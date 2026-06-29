const { json, supabase } = require("./v6-utils");

function isCompleteStatus(status) {
  return ["complete", "finished", "completed"].includes(String(status || "").toLowerCase());
}

function isKnownTeam(value) {
  const v = String(value || "").trim().toLowerCase();
  return v && !["à déterminer", "a determiner", "en attente", "tbd", "null"].includes(v);
}

function getWinner(match) {
  if (!isCompleteStatus(match.status)) return null;

  const scoreA = Number(match.score_a);
  const scoreB = Number(match.score_b);

  if (!Number.isNaN(scoreA) && !Number.isNaN(scoreB)) {
    if (scoreA > scoreB) return match.team_a;
    if (scoreB > scoreA) return match.team_b;
  }

  if (isKnownTeam(match.winner_team)) {
    return match.winner_team;
  }

  return null;
}

async function selectAll(db, table, applyOrder) {
  const pageSize = 1000;
  let from = 0;
  let all = [];

  while (true) {
    let query = db.from(table).select("*").range(from, from + pageSize - 1);
    if (applyOrder) query = applyOrder(query);

    const { data, error } = await query;
    if (error) throw error;

    all = all.concat(data || []);
    if (!data || data.length < pageSize) break;
    from += pageSize;
  }

  return all;
}

async function syncKnockoutTree(db) {
  const matches = await selectAll(
    db,
    "v7_knockout_matches",
    q => q.order("display_order", { ascending: true })
  );

  const byId = new Map(matches.map(match => [String(match.id), match]));
  let updates = 0;
  let skippedDraws = 0;

  for (const match of matches) {
    const nextMatchId = match.next_match_id;
    const nextSlot = match.next_slot;

    if (!nextMatchId || !nextSlot) continue;
    if (!["team_a", "team_b"].includes(nextSlot)) continue;

    const winner = getWinner(match);
    if (!winner) {
      if (isCompleteStatus(match.status)) skippedDraws += 1;
      continue;
    }

    const nextMatch = byId.get(String(nextMatchId));
    if (!nextMatch) continue;

    const currentValue = nextMatch[nextSlot];

    if (String(currentValue || "").trim() === String(winner || "").trim()) {
      continue;
    }

    const patch = {
      [nextSlot]: winner,
      updated_at: new Date().toISOString()
    };

    const futureTeamA = nextSlot === "team_a" ? winner : nextMatch.team_a;
    const futureTeamB = nextSlot === "team_b" ? winner : nextMatch.team_b;

    if (isKnownTeam(futureTeamA) && isKnownTeam(futureTeamB)) {
      patch.is_open = true;
      if (!isCompleteStatus(nextMatch.status)) {
        patch.status = "scheduled";
      }
    }

    const { error } = await db
      .from("v7_knockout_matches")
      .update(patch)
      .eq("id", nextMatchId);

    if (error) throw error;

    updates += 1;

    const refreshed = {
      ...nextMatch,
      ...patch
    };

    byId.set(String(nextMatchId), refreshed);
  }

  return {
    updates,
    skipped_draws: skippedDraws
  };
}

exports.syncKnockoutTree = syncKnockoutTree;

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return json(200, {});
  if (!["GET", "POST"].includes(event.httpMethod)) {
    return json(405, { error: "Méthode non autorisée." });
  }

  try {
    const db = supabase();
    const result = await syncKnockoutTree(db);

    return json(200, {
      ok: true,
      message: "Arbre phases finales synchronisé.",
      ...result,
      updated_at: new Date().toISOString()
    });
  } catch (error) {
    return json(500, {
      error: error.message || "Erreur synchronisation arbre phases finales"
    });
  }
};
