
const { json, supabase, requireAdmin } = require("./v6-utils");
exports.handler = async (event) => {
  if(event.httpMethod==="OPTIONS") return json(200,{});
  try{
    requireAdmin(event);
    const p=JSON.parse(event.body||"{}");
    const row={id:p.id||p.api_match_id||`manual-${Date.now()}`,api_match_id:p.api_match_id||p.id||`manual-${Date.now()}`,stage:p.stage||"16e de finale",team_a:p.team_a,team_b:p.team_b,kickoff_at:p.kickoff_at||null,status:p.status||"scheduled",score_a:p.score_a===""||p.score_a===undefined?null:Number(p.score_a),score_b:p.score_b===""||p.score_b===undefined?null:Number(p.score_b),is_open:Boolean(p.is_open),display_order:Number(p.display_order||0),updated_at:new Date().toISOString()};
    if(!row.team_a||!row.team_b)return json(400,{error:"team_a et team_b obligatoires."});
    const {error}=await supabase().from("v6_knockout_matches").upsert(row,{onConflict:"id"});
    if(error) throw error;
    return json(200,{ok:true,match:row});
  }catch(error){return json(error.statusCode||500,{error:error.message});}
};
