const { json, requireAdmin } = require("./v6-utils");

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

    if (!apiKey) {
      throw new Error("API_FOOTBALL_KEY non configurée dans Netlify.");
    }

    const url = `${baseUrl}/fixtures?league=${league}&season=${season}`;
    const res = await fetch(url, {
      headers: { "x-apisports-key": apiKey }
    });

    if (!res.ok) {
      throw new Error(`Erreur API-Football HTTP ${res.status}`);
    }

    const payload = await res.json();
    const fixtures = payload.response || [];

    const rounds = {};

    for (const item of fixtures) {
      const round = item.league?.round || "ROUND VIDE";
      if (!rounds[round]) rounds[round] = 0;
      rounds[round] += 1;
    }

    return json(200, {
      ok: true,
      total_fixtures: fixtures.length,
      rounds,
      sample: fixtures.slice(0, 10).map(item => ({
        round: item.league?.round,
        date: item.fixture?.date,
        status: item.fixture?.status,
        home: item.teams?.home?.name,
        away: item.teams?.away?.name,
        goals: item.goals
      }))
    });

  } catch (error) {
    return json(error.statusCode || 500, {
      error: error.message
    });
  }
};
