const { schedule } = require("@netlify/functions");
const { saveRankingHistory } = require("./v6-save-ranking-history");

// Netlify utilise UTC. En juin/juillet en France : 9h00 = 7h00 UTC.
exports.handler = schedule("0 7 * * *", async () => {
  try {
    const result = await saveRankingHistory();
    return { statusCode: 200, body: JSON.stringify(result) };
  } catch (error) {
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }
});
