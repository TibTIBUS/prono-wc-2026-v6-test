
const { json, supabase, requireAdmin } = require("./v6-utils");
exports.handler = async (event) => {
  if(event.httpMethod==="OPTIONS") return json(200,{});
  try{
    requireAdmin(event);
    const {employee_id,stage}=JSON.parse(event.body||"{}");
    if(!employee_id||!stage)return json(400,{error:"employee_id et stage obligatoires."});
    const db=supabase();
    const {error:lockError}=await db.from("v6_prediction_locks").delete().eq("employee_id",employee_id).eq("stage",stage);
    if(lockError) throw lockError;
    const {error:predError}=await db.from("v6_knockout_predictions").delete().eq("employee_id",employee_id).eq("stage",stage);
    if(predError) throw predError;
    return json(200,{ok:true});
  }catch(error){return json(error.statusCode||500,{error:error.message});}
};
