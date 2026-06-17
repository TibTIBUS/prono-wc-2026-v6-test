const { json, supabase } = require("./v6-utils");

async function saveRankingHistory() {
  const siteUrl = process.env.URL || process.env.DEPLOY_PRIME_URL;
  if (!siteUrl) throw new Error("URL Netlify introuvable.");

  const rankingResponse = await fetch(`${siteUrl}/.netlify/functions/v6-get-ranking`);
  if (!rankingResponse.ok) throw new Error("Impossible de récupérer le classement actuel.");

  const rankingData = await rankingResponse.json();
  const ranking = rankingData.ranking || [];
  const today = new Date().toISOString().slice(0, 10);

  const rows = ranking.map(r => ({
    employee_id: r.employee_id,
    employee_name: r.employee,
    rank: r.rank,
    total_points: r.total,
    exact_scores: r.exact || r.exact_scores || 0,
    good_results: r.good || r.good_results || 0,
    snapshot_date: today
  }));

  const db = supabase();

  await db.from("v6_ranking_history").delete().eq("snapshot_date", today);

  if (rows.length > 0) {
    const { error } = await db.from("v6_ranking_history").insert(rows);
    if (error) throw error;
  }

  return {
    ok: true,
    message: "Classement du jour enregistré.",
    snapshot_date: today,
    saved: rows.length
  };
}

exports.handler = async () => {
  try {
    return json(200, await saveRankingHistory());
  } catch (error) {
    return json(500, { error: error.message });
  }
};

exports.saveRankingHistory = saveRankingHistory;
