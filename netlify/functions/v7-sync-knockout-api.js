const { json, supabase, requireAdmin } = require("./v6-utils");
const { syncKnockoutTree } = require("./v7-sync-knockout-tree");

function normalize(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const API_TO_LOCAL = {
  "south africa": "Afrique du Sud",
  "canada": "Canada",
  "brazil": "Brésil",
  "japan": "Japon",
  "germany": "Allemagne",
  "paraguay": "Paraguay",
  "netherlands": "Pays-Bas",
  "morocco": "Maroc",
  "ivory coast": "Côte d'Ivoire",
  "norway": "Norvège",
  "france": "France",
  "sweden": "Suède",
  "mexico": "Mexique",
  "ecuador": "Équateur",
  "england": "Angleterre",
  "dr congo": "RD Congo",
  "congo dr": "RD Congo",
  "belgium": "Belgique",
  "senegal": "Sénégal",
  "united states": "États-Unis",
  "usa": "États-Unis",
  "bosnia and herzegovina": "Bosnie-Herzégovine",
  "spain": "Espagne",
  "austria": "Autriche",
  "portugal": "Portugal",
  "croatia": "Croatie",
  "switzerland": "Suisse",
  "algeria": "Algérie",
  "australia": "Australie",
  "egypt": "Égypte",
  "argentina": "Argentine",
  "cape verde": "Cap-Vert",
  "colombia": "Colombie",
  "ghana": "Ghana"
};

function localTeamName(apiName) {
  const key = normalize(apiName);
  return API_TO_LOCAL[key] || apiName;
}

function namesMatch(localName, apiName) {
  return normalize(localName) === normalize(apiName) ||
    normalize(localName) === normalize(localTeamName(apiName));
}

function isFinished(status) {
  const s = String(status || "").toUpperCase();
  return ["FT", "AET", "PEN", "COMPLETED", "COMPLETE", "FINISHED", "MATCH FINISHED"].includes(s);
}

function isKnockoutRound(round) {
  const r = normalize(round);
  return (
    r.includes("round of 32") ||
    r.includes("round of 16") ||
    r.includes("16th finals") ||
    r.includes("8th finals") ||
    r.includes("quarter") ||
    r.includes("semi") ||
    r.includes("final")
  );
}

function stageFromRound(round) {
  const r = normalize(round);

  if (r.includes("round of 32") || r.includes("16th finals")) return "16e de finale";
  if (r.includes("round of 16") || r.includes("8th finals")) return "8e de finale";
  if (r.includes("quarter")) return "Quart de finale";
  if (r.includes("semi")) return "Demi-finale";
  if (r.includes("final")) return "Finale";

  return null;
}

function scoreForLocalOrder(localMatch, apiHome, apiAway, homeGoals, awayGoals) {
  const sameOrder =
    namesMatch(localMatch.team_a, apiHome) &&
    namesMatch(localMatch.team_b, apiAway);

  if (sameOrder) {
    return {
      score_a: Number(homeGoals),
      score_b: Number(awayGoals)
    };
  }

  return {
    score_a: Number(awayGoals),
    score_b: Number(homeGoals)
  };
}

function dateDistanceMinutes(a, b) {
  if (!a || !b) return Number.MAX_SAFE_INTEGER;
  return Math.abs(new Date(a).getTime() - new Date(b).getTime()) / 60000;
}

function findLocalMatch(localMatches, fixture) {
  const apiHome = fixture.teams?.home?.name;
  const apiAway = fixture.teams?.away?.name;
  const apiDate = fixture.fixture?.date;
  const stage = stageFromRound(fixture.league?.round);

  if (!apiHome || !apiAway || !stage) return null;

  const sameStage = localMatches.filter(m =>
    normalize(m.stage || m.phase) === normalize(stage)
  );

  const byTeams = sameStage.find(match => {
    const sameOrder =
      namesMatch(match.team_a, apiHome) &&
      namesMatch(match.team_b, apiAway);

    const reverseOrder =
      namesMatch(match.team_a, apiAway) &&
      namesMatch(match.team_b, apiHome);

    return sameOrder || reverseOrder;
  });

  if (byTeams) return byTeams;

  const byDate = sameStage
    .map(match => ({
      match,
      distance: dateDistanceMinutes(match.kickoff_at, apiDate)
    }))
    .filter(x => x.distance <= 120)
    .sort((a, b) => a.distance - b.distance)[0];

  return byDate?.match || null;
}

async function syncKnockoutApi() {
  const apiKey = process.env.API_FOOTBALL_KEY;
  const league = process.env.API_FOOTBALL_LEAGUE_ID || "1";
  const season = process.env.API_FOOTBALL_SEASON || "2026";
  const baseUrl = process.env.API_FOOTBALL_BASE_URL || "https://v3.football.api-sports.io";

  if (!apiKey) {
    throw new Error("API_FOOTBALL_KEY non configurée dans Netlify.");
  }

  const db = supabase();

  const { data: localMatches, error: localError } = await db
    .from("v7_knockout_matches")
    .select("*")
    .order("display_order", { ascending: true });

  if (localError) throw localError;

  const url = `${baseUrl}/fixtures?league=${league}&season=${season}`;
  const res = await fetch(url, {
    headers: {
      "x-apisports-key": apiKey
    }
  });

  if (!res.ok) {
    throw new Error(`Erreur API-Football HTTP ${res.status}`);
  }

  const payload = await res.json();
  const fixtures = payload.response || [];

  const knockoutFixtures = fixtures.filter(item =>
    isKnockoutRound(item.league?.round)
  );

  let updated = 0;
  const unmatched = [];
  const skipped = [];

  for (const item of knockoutFixtures) {
    const status = item.fixture?.status?.short || item.fixture?.status?.long || "";
    const home = item.teams?.home?.name;
    const away = item.teams?.away?.name;
    const goals = item.goals || {};

    if (!home || !away) continue;

    const localMatch = findLocalMatch(localMatches || [], item);

    if (!localMatch) {
      unmatched.push({
        round: item.league?.round,
        home,
        away,
        date: item.fixture?.date,
        status
      });
      continue;
    }

    const patch = {
      team_a: localMatch.team_a || localTeamName(home),
      team_b: localMatch.team_b || localTeamName(away),
      kickoff_at: item.fixture?.date || localMatch.kickoff_at,
      updated_at: new Date().toISOString()
    };

    if (isFinished(status)) {
      if (
        goals.home === null ||
        goals.away === null ||
        goals.home === undefined ||
        goals.away === undefined
      ) {
        skipped.push({
          id: localMatch.id,
          home,
          away,
          status,
          reason: "score manquant"
        });
        continue;
      }

      const score = scoreForLocalOrder(localMatch, home, away, goals.home, goals.away);

      patch.score_a = score.score_a;
      patch.score_b = score.score_b;
      patch.status = "complete";
      patch.is_open = false;

      if (score.score_a > score.score_b) {
        patch.winner_team = patch.team_a || localTeamName(home);
      } else if (score.score_b > score.score_a) {
        patch.winner_team = patch.team_b || localTeamName(away);
      }
    } else {
      patch.status = "scheduled";

      if (patch.team_a && patch.team_b) {
        patch.is_open = true;
      }
    }

    const { error: updateError } = await db
      .from("v7_knockout_matches")
      .update(patch)
      .eq("id", localMatch.id);

    if (updateError) throw updateError;

    updated += 1;
  }

  const tree = await syncKnockoutTree(db);

  return {
    ok: true,
    updated,
    tree_updates: tree.updates,
    unmatched,
    skipped_count: skipped.length,
    skipped,
    total_api_knockout_fixtures: knockoutFixtures.length
  };
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return json(200, {});

  try {
    if (event.httpMethod === "POST") {
      requireAdmin(event);
    }

    const result = await syncKnockoutApi();
    return json(200, result);
  } catch (error) {
    return json(error.statusCode || 500, {
      error: error.message || "Erreur synchronisation phases finales API"
    });
  }
};

exports.syncKnockoutApi = syncKnockoutApi;
