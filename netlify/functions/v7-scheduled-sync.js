const { schedule } = require("@netlify/functions");
const { syncV7KnockoutFixtures } = require("./v7-sync-api");

// Toutes les 30 minutes : récupère automatiquement les affiches dès que l'API les publie.
exports.handler = schedule("*/30 * * * *", async () => {
  try {
    const result = await syncV7KnockoutFixtures();
    return {
      statusCode: 200,
      body: JSON.stringify(result)
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message || "Erreur synchro automatique V7" })
    };
  }
});
