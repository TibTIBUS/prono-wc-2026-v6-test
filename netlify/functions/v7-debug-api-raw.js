const { json } = require("./v6-utils");

exports.handler = async () => {
  try {
    const apiKey = process.env.API_FOOTBALL_KEY;
    const league = process.env.API_FOOTBALL_LEAGUE_ID || "1";
    const season = process.env.API_FOOTBALL_SEASON || "2026";
    const baseUrl = process.env.API_FOOTBALL_BASE_URL || "https://v3.football.api-sports.io";

    const url = `${baseUrl}/fixtures?league=${league}&season=${season}`;

    const res = await fetch(url, {
      headers: { "x-apisports-key": apiKey }
    });

    const payload = await res.json();

    return json(200, {
      ok: true,
      url_used: url,
      status: res.status,
      errors: payload.errors,
      results: payload.results,
      response_count: payload.response?.length || 0,
      first_response: payload.response?.[0] || null
    });
  } catch (error) {
    return json(500, { error: error.message });
  }
};
