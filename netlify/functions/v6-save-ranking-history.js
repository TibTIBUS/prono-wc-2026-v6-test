const { json, supabase } = require("./v6-utils");

exports.handler = async () => {
  try {
    const siteUrl = process.env.URL || process.env.DEPLOY_PRIME_URL;

    if (!siteUrl) {
      throw new Error("URL Netlify introuvable.");
    }

    const rankingResponse = await fetch(`${siteUrl}/.netlify/functions/v6-get-ranking`);

    if (!rankingResponse.ok) {
      throw new Error("Impossible de récupérer le classement actuel.");
    }

    const rankingData = await rankingResponse.json();
    const ranking = rankingData.ranking || [];

    const rows = ranking.map(r => ({
      employee_id: r.employee_id,
      employee_name: r.employee,
      rank: r.rank,
      total_points: r.total,
      exact_scores: r.exact || r.exact_scores || 0,
      good_results: r.good || r.good_results || 0,
      snapshot_date: new Date().toISOString().slice(0, 10)
    }));

    if (rows.length > 0) {
      const db = supabase();

      const { error } = await db
        .from("v6_ranking_history")
        .insert(rows);

      if (error) {
        throw error;
      }
    }

    return json(200, {
      ok: true,
      message: "Classement du jour enregistré.",
      saved: rows.length
    });

  } catch (error) {
    return json(500, {
      error: error.message
    });
  }
};
