const { json, requireAdmin } = require("./v6-utils");

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

    const res = await fetch(`${baseUrl}/fixtures?league=${league}&season=${season}`, {
      headers: { "x-apisports-key": apiKey }
    });

    if (!res.ok) throw new Error(`Erreur API-Football HTTP ${res.status}`);

    const payload = await res.json();
    const fixtures = payload.response || [];

    const rounds = {};
    const suspicious = [];

    for (const item of fixtures) {
      const round = item.league?.round || "ROUND_INCONNU";
      rounds[round] = (rounds[round] || 0) + 1;

      const text = JSON.stringify({
        round,
        fixture_id: item.fixture?.id,
        date: item.fixture?.date,
        status: item.fixture?.status,
        home: item.teams?.home?.name,
        away: item.teams?.away?.name
      }).toLowerCase();

      if (
        text.includes("round") ||
        text.includes("final") ||
        text.includes("16") ||
        text.includes("32") ||
        text.includes("knock") ||
        text.includes("play")
      ) {
        suspicious.push({
          fixture_id: item.fixture?.id,
          round,
          date: item.fixture?.date,
          status: item.fixture?.status?.short,
          home: item.teams?.home?.name,
          away: item.teams?.away?.name
        });
      }
    }

    return json(200, {
      ok: true,
      total_fixtures: fixtures.length,
      rounds,
      suspicious: suspicious.slice(0, 80),
      api_config: { league, season, baseUrl }
    });
  } catch (error) {
    return json(error.statusCode || 500, { error: error.message });
  }
};
