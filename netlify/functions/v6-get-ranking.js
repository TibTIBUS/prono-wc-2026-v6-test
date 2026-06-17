
const { json, supabase, loadV6Data, buildCombinedRanking } = require("./v6-utils");
exports.handler = async (event) => {
  if(event.httpMethod==="OPTIONS") return json(200,{});
  try{
    const data=await loadV6Data(supabase());
    return json(200,{ranking:buildCombinedRanking(data), meta:{employees:data.employees.length, group_results:data.groupResults.length, knockout_matches:data.koMatches.length, knockout_results:data.koMatches.filter(m=>m.score_a!==null&&m.score_b!==null).length, updated_at:new Date().toISOString()}});
  }catch(error){return json(error.statusCode||500,{error:error.message});}
};
