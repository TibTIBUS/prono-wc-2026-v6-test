
const { json, supabase, loadV6Data, buildCombinedRanking } = require("./v6-utils");
exports.handler = async (event) => {
  if(event.httpMethod==="OPTIONS") return json(200,{});
  try{const data=await loadV6Data(supabase()); return json(200,{...data, ranking:buildCombinedRanking(data)});}
  catch(error){return json(error.statusCode||500,{error:error.message});}
};
