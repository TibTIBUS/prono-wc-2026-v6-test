const { json, supabase, requireAdmin } = require("./v6-utils");

function isKnockoutRound(round) {
  const r = String(round || "").toLowerCase();
  return (r.includes("round of 32") || r.includes("round of 16") || r.includes("quarter") || r.includes("semi") || r.includes("final")) && !r.includes("group");
}

function stageFromRound(round) {
  const r = String(round || "").toLowerCase();
  if (r.includes("round of 32")) return "16e de finale";
  if (r.includes("round of 16")) return "8e de finale";
  if (r.includes("quarter")) return "Quart de finale";
  if (r.includes("semi")) return "Demi-finale";
  if (r.includes("final")) return "Finale";
  return "Phase finale";
}

function codeFromStage(stage) {
  if (stage === "16e de finale") return "R32";
  if (stage === "8e de finale") return "R16";
  if (stage === "Quart de finale") return "QF";
  if (stage === "Demi-finale") return "SF";
  if (stage === "Finale") return "F";
  return "KO";
}

function baseOrder(code) {
  if (code === "R32") return 1;
  if (code === "R16") return 20;
  if (code === "QF") return 40;
  if (code === "SF") return 60;
  if (code === "F") return 80;
  return 100;
}

function statusFromApi(item) {
  const short = String(item.fixture?.status?.short || "").toUpperCase();
  if (["FT", "AET", "PEN"].includes(short)) return "complete";
  if (["1H", "HT", "2H", "ET", "P", "BT", "LIVE"].includes(short)) return "live";
  return "scheduled";
}

function cleanTeamName(value) {
  const v = String(value || "").trim();
  return v || "À déterminer";
}

function teamsKnown(a, b) {
  return a && b && a !== "À déterminer" && b !== "À déterminer";
}

async function syncV7KnockoutFixtures() {
  const apiKey = process.env.API_FOOTBALL_KEY;
  const league = process.env.API_FOOTBALL_LEAGUE_ID || "1";
  const season = process.env.API_FOOTBALL_SEASON || "2026";
  const baseUrl = process.env.API_FOOTBALL_BASE_URL || "https://v3.football.api-sports.io";

  if (!apiKey) throw new Error("API_FOOTBALL_KEY non configurée.");

  const res = await fetch(`${baseUrl}/fixtures?league=${league}&season=${season}`, {
    headers: { "x-apisports-key": apiKey }
  });

  if (!res.ok) throw new Error(`Erreur API-Football HTTP ${res.status}`);

  const payload = await res.json();
  const fixtures = (payload.response || [])
    .filter(item => isKnockoutRound(item.league?.round))
    .sort((a, b) => new Date(a.fixture?.date || 0) - new Date(b.fixture?.date || 0));

  const byStage = new Map();

  for (const item of fixtures) {
    const stage = stageFromRound(item.league?.round);
    if (!byStage.has(stage)) byStage.set(stage, []);
    byStage.get(stage).push(item);
  }

  const rows = [];

  for (const [stage, items] of byStage.entries()) {
    const code = codeFromStage(stage);
    items.forEach((item, index) => {
      const n = index + 1;
      const id = `${code}-${String(n).padStart(2, "0")}`;
      const status = statusFromApi(item);
      const teamA = cleanTeamName(item.teams?.home?.name);
      const teamB = cleanTeamName(item.teams?.away?.name);
      const goals = item.goals || {};

      rows.push({
        id,
        stage,
        match_number: n,
        display_order: baseOrder(code) + n,
        api_fixture_id: String(item.fixture?.id || ""),
        team_a: teamA,
        team_b: teamB,
        kickoff_at: item.fixture?.date || null,
        status,
        is_open: teamsKnown(teamA, teamB) && status === "scheduled",
        score_a: status === "complete" ? goals.home : null,
        score_b: status === "complete" ? goals.away : null,
        updated_at: new Date().toISOString()
      });
    });
  }

  const db = supabase();

  if (rows.length) {
    const { error } = await db
      .from("v7_knockout_matches")
      .upsert(rows, { onConflict: "id" });
    if (error) throw error;
  }

  return {
    ok: true,
    received: (payload.response || []).length,
    knockout_found: fixtures.length,
    synced: rows.length,
    message: `${rows.length} match(s) V7 synchronisé(s).`
  };
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return json(200, {});
  if (event.httpMethod !== "POST") return json(405, { error: "Méthode non autorisée." });

  try {
    requireAdmin(event);
    const result = await syncV7KnockoutFixtures();
    return json(200, result);
  } catch (error) {
    return json(error.statusCode || 500, { error: error.message });
  }
};

exports.syncV7KnockoutFixtures = syncV7KnockoutFixtures;
