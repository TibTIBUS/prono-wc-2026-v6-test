const { json, supabase } = require("./v6-utils");

async function countRows(db, table) {
  const { count, error } = await db
    .from(table)
    .select("*", { count: "exact", head: true });

  if (error) return { table, ok: false, error: error.message };
  return { table, ok: true, count };
}

exports.handler = async () => {
  try {
    const db = supabase();

    const checks = await Promise.all([
      countRows(db, "employees"),
      countRows(db, "matches"),
      countRows(db, "predictions"),
      countRows(db, "results"),
      countRows(db, "v6_knockout_matches"),
      countRows(db, "v6_knockout_predictions"),
      countRows(db, "v6_prediction_locks")
    ]);

    return json(200, {
      ok: checks.every(c => c.ok),
      checks,
      api_config: {
        has_api_key: Boolean(process.env.API_FOOTBALL_KEY),
        league_id: process.env.API_FOOTBALL_LEAGUE_ID || "1",
        season: process.env.API_FOOTBALL_SEASON || "2026",
        base_url: process.env.API_FOOTBALL_BASE_URL || "https://v3.football.api-sports.io"
      },
      updated_at: new Date().toISOString()
    });
  } catch (error) {
    return json(500, { error: error.message });
  }
};
