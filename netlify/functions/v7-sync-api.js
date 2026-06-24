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
function statusFromApi(item) {
  const short = String(item.fixture?.status?.short || "").toUpperCase();
  if (["FT", "AET", "PEN"].includes(short)) return "complete";
  if (["1H", "HT", "2H", "ET", "P", "BT", "LIVE"].includes(short)) return "live";
  return "scheduled";
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return json(200, {});
  if (event.httpMethod !== "POST") return json(405, { error: "Méthode non autorisée." });
  try {
    requireAdmin(event);
    const apiKey = process.env.API_FOOTBALL_KEY;
    const league = process.env.API_FOOTBALL_LEAGUE_ID || "1";
    const season = process.env.API_FOOTBALL_SEASON || "2026";
    const baseUrl = process.env.API_FOOTBALL_BASE_URL || "https://v3.football.api-sports.io";
    if (!apiKey) throw new Error("API_FOOTBALL_KEY non configurée.");

    const res = await fetch(`${baseUrl}/fixtures?league=${league}&season=${season}`, { headers: { "x-apisports-key": apiKey } });
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
        const teamA = item.teams?.home?.name || "À déterminer";
        const teamB = item.teams?.away?.name || "À déterminer";
        const bothKnown = teamA !== "À déterminer" && teamB !== "À déterminer";
        const goals = item.goals || {};
        rows.push({
          id,
          stage,
          match_number: n,
          display_order: ({R32:1,R16:20,QF:40,SF:60,F:80}[code] || 100) + n,
          api_fixture_id: String(item.fixture?.id || ""),
          team_a: teamA,
          team_b: teamB,
          kickoff_at: item.fixture?.date || null,
          status,
          is_open: bothKnown && status === "scheduled",
          score_a: status === "complete" ? goals.home : null,
          score_b: status === "complete" ? goals.away : null,
          updated_at: new Date().toISOString()
        });
      });
    }

    const db = supabase();
    if (rows.length) {
      const { error } = await db.from("v7_knockout_matches").upsert(rows, { onConflict: "id" });
      if (error) throw error;
    }

    return json(200, { ok: true, message: `${rows.length} match(s) V7 synchronisé(s).`, synced: rows.length });
  } catch (error) {
    return json(error.statusCode || 500, { error: error.message });
  }
};
