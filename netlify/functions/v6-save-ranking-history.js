const { json } = require("./v6-utils");

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

    return json(200, {
      ok: true,
      message: "Fonction créée. Étape suivante : on connecte l’écriture Supabase.",
      count: ranking.length
    });

  } catch (error) {
    return json(500, {
      error: error.message
    });
  }
};
