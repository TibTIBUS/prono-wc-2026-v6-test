
const { json, supabase, requireAdmin } = require("./v6-utils");
exports.handler = async (event) => {
  if(event.httpMethod==="OPTIONS") return json(200,{});
  try{
    requireAdmin(event);
    const {match_id,is_open}=JSON.parse(event.body||"{}");
    if(!match_id)return json(400,{error:"match_id obligatoire."});
    const {error}=await supabase().from("v6_knockout_matches").update({is_open:Boolean(is_open),updated_at:new Date().toISOString()}).eq("id",match_id);
    if(error) throw error;
    return json(200,{ok:true});
  }catch(error){return json(error.statusCode||500,{error:error.message});}
};
