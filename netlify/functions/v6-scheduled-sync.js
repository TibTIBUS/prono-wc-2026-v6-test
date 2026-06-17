
const { schedule } = require("@netlify/functions");
const { syncWithApi } = require("./v6-sync-api");

exports.handler = schedule("*/30 * * * *", async () => {
  try{
    const result = await syncWithApi();
    return {statusCode:200, body:JSON.stringify(result)};
  }catch(error){
    return {statusCode:500, body:JSON.stringify({error:error.message})};
  }
});
