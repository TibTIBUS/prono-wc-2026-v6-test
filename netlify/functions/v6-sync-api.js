const { json, supabase, requireAdmin } = require("./v6-utils");

function isKnockoutRound(round) {
  const r = String(round || "").toLowerCase();
  if (!r) return false;
  return (
    r.includes("round of 32") ||
    r.includes("round of 16") ||
    r.includes("16e") ||
    r.includes("8e") ||
    r.includes("quarter") ||
    r.includes("semi") ||
    r.includes("final") ||
    r.includes("third")
  ) && !r.includes("group");
}

function normalizeStage(round) {
  const r = String(round || "").toLowerCase();

  if (r.includes("round of 32") || r.includes("32")) return "16e de finale";
  if (r.includes("round of 16") || r.includes("16")) return "8e de finale";
  if (r.includes("quarter")) return "Quart de finale";
  if (r.includes("semi")) return "Demi-finale";
  if (r.includes("third")) return "Petite finale";
  if (r.includes("final")) return "Finale";

  return round || "Phase finale";
}

function statusFromApi(item) {
  const short = String(item.fixture?.status?.short || "").toUpperCase();
  if (["FT", "AET", "PEN"].includes(short)) return "complete";
  if (["1H", "HT", "2H", "ET", "P", "BT", "LIVE"].includes(short)) return "live";
  return "scheduled";
}

function getGoals(item) {
  const status = statusFromApi(item);
  if (status !== "complete") return { score_a: null, score_b: null };

  const goals = item.goals || {};
  if (goals.home === null || goals.away === null || goals.home === undefined || goals.away === undefined) {
    return { score_a: null, score_b: null };
  }

  return { score_a: Number(goals.home), score_b: Number(goals.away) };
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return json(200, {});

  try {
    if (event.httpMethod === "POST") {
      requireAdmin(event);
    }

    const apiKey = process.env.API_FOOTBALL_KEY;
    const league = process.env.API_FOOTBALL_LEAGUE_ID || "1";
    const season = process.env.API_FOOTBALL_SEASON || "2026";
    const baseUrl = process.env.API_FOOTBALL_BASE_URL || "https://v3.football.api-sports.io";

    if (!apiKey) throw new Error("API_FOOTBALL_KEY non configurée dans Netlify.");

    const url = `${baseUrl}/fixtures?league=${league}&season=${season}`;
    const res = await fetch(url, {
      headers: { "x-apisports-key": apiKey }
    });

    if (!res.ok) {
      throw new Error(`Erreur API-Football HTTP ${res.status}`);
    }

    const payload = await res.json();
    const fixtures = payload.response || [];

    const knockoutFixtures = fixtures.filter(item => isKnockoutRound(item.league?.round));

    const rows = knockoutFixtures.map((item, index) => {
      const goals = getGoals(item);
      const apiId = item.fixture?.id;

      return {
        id: String(apiId),
        api_fixture_id: String(apiId),
        stage: normalizeStage(item.league?.round),
        team_a: item.teams?.home?.name || "À déterminer",
        team_b: item.teams?.away?.name || "À déterminer",
        kickoff_at: item.fixture?.date || null,
        status: statusFromApi(item),
        score_a: goals.score_a,
        score_b: goals.score_b,
        is_open: false,
        display_order: index + 1,
        updated_at: new Date().toISOString()
      };
    }).filter(row => row.id && row.team_a && row.team_b);

    const db = supabase();

    let upserted = 0;

    if (rows.length) {
      const { error } = await db
        .from("v6_knockout_matches")
        .upsert(rows, { onConflict: "id" });

      if (error) throw error;
      upserted = rows.length;
    }

    await db.from("v6_sync_logs").insert({
      status: "success",
      message: `Synchronisation phases finales OK : ${upserted} match(s) récupéré(s).`,
      payload: {
        received_fixtures: fixtures.length,
        knockout_fixtures: knockoutFixtures.length,
        upserted
      }
    });

    return json(200, {
      ok: true,
      received_fixtures: fixtures.length,
      knockout_fixtures: knockoutFixtures.length,
      upserted,
      message: `${upserted} match(s) de phase finale synchronisé(s).`
    });

  } catch (error) {
    try {
      await supabase().from("v6_sync_logs").insert({
        status: "error",
        message: error.message,
        payload: {}
      });
    } catch (e) {}

    return json(error.statusCode || 500, {
      error: error.message || "Erreur synchronisation phases finales."
    });
  }
};
