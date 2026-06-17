const { schedule } = require("@netlify/functions");
const { syncGroups } = require("./v6-sync-groups-api");

exports.handler = schedule("*/30 * * * *", async () => {
  try {
    const result = await syncGroups();
    return {
      statusCode: 200,
      body: JSON.stringify(result)
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
});
