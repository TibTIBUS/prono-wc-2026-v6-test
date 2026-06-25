const { json, requireAdmin } = require("./v6-utils");

async function apiGet(path) {
  const apiKey = process.env.API_FOOTBALL_KEY;
  const baseUrl = process.env.API_FOOTBALL_BASE_URL || "https://v3.football.api-sports.io";

  if (!apiKey) throw new Error("API_FOOTBALL_KEY non configurée.");

  const res = await fetch(`${baseUrl}${path}`, {
    headers: { "x-apisports-key": apiKey }
  });

  if (!res.ok) throw new Error(`Erreur API-Football HTTP ${res.status} sur ${path}`);

  return await res.json();
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return json(200, {});
  if (event.httpMethod !== "POST") return json(405, { error: "Méthode non autorisée." });

  try {
    requireAdmin(event);

    const configuredLeague = process.env.API_FOOTBALL_LEAGUE_ID || "1";
    const configuredSeason = process.env.API_FOOTBALL_SEASON || "2026";
    const baseUrl = process.env.API_FOOTBALL_BASE_URL || "https://v3.football.api-sports.io";

    const leagueSearch = await apiGet(`/leagues?search=World%20Cup`);
    const leagues = leagueSearch.response || [];

    const candidates = [];

    candidates.push({
      league: configuredLeague,
      season: configuredSeason,
      name: "Configuration Netlify",
      source: "netlify_config"
    });

    for (const item of leagues) {
      const league = item.league || {};
      const seasons = item.seasons || [];
      const name = String(league.name || "");

      if (!name.toLowerCase().includes("world cup")) continue;

      for (const season of seasons) {
        const year = season.year || season.season;
        if (String(year) === "2026") {
          candidates.push({
            league: String(league.id),
            season: String(year),
            name,
            country: item.country?.name || "",
            source: "auto_search"
          });
        }
      }
    }

    const unique = new Map(candidates.map(c => [`${c.league}-${c.season}`, c]));
    const tested = [];

    for (const candidate of unique.values()) {
      try {
        const payload = await apiGet(`/fixtures?league=${candidate.league}&season=${candidate.season}`);
        const fixtures = payload.response || [];
        const rounds = {};

        for (const item of fixtures) {
          const round = item.league?.round || "ROUND_INCONNU";
          rounds[round] = (rounds[round] || 0) + 1;
        }

        tested.push({
          ...candidate,
          total_fixtures: fixtures.length,
          rounds
        });
      } catch (error) {
        tested.push({
          ...candidate,
          error: error.message,
          total_fixtures: 0,
          rounds: {}
        });
      }
    }

    return json(200, {
      ok: true,
      api_config: {
        baseUrl,
        configuredLeague,
        configuredSeason
      },
      leagues_found: leagues.map(item => ({
        id: item.league?.id,
        name: item.league?.name,
        country: item.country?.name,
        seasons: (item.seasons || []).map(s => s.year || s.season).slice(-8)
      })),
      tested
    });
  } catch (error) {
    return json(error.statusCode || 500, { error: error.message });
  }
};
