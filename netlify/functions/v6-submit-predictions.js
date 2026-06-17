
const { json, supabase } = require("./v6-utils");
exports.handler = async (event) => {
  if(event.httpMethod==="OPTIONS") return json(200,{});
  try{
    const {employee_id,stage,predictions}=JSON.parse(event.body||"{}");
    if(!employee_id||!stage||!Array.isArray(predictions)||!predictions.length) return json(400,{error:"employee_id, stage et predictions obligatoires."});
    const db=supabase();
    const {data:existingLock,error:lockError}=await db.from("v6_prediction_locks").select("*").eq("employee_id",employee_id).eq("stage",stage).maybeSingle();
    if(lockError) throw lockError;
    if(existingLock&&existingLock.locked) return json(409,{error:"Pronostics déjà validés. Modification impossible."});
    const {data:openMatches,error:matchError}=await db.from("v6_knockout_matches").select("*").eq("stage",stage).eq("is_open",true);
    if(matchError) throw matchError;
    const openIds=new Set((openMatches||[]).map(m=>m.id));
    const rows=predictions.filter(p=>openIds.has(p.match_id)).map(p=>({employee_id:Number(employee_id),match_id:p.match_id,stage,score_a:Number(p.score_a),score_b:Number(p.score_b),locked:true,submitted_at:new Date().toISOString()}));
    if(!rows.length) return json(400,{error:"Aucun match ouvert."});
    const {error:predError}=await db.from("v6_knockout_predictions").upsert(rows,{onConflict:"employee_id,match_id"});
    if(predError) throw predError;
    const {error:upsertLockError}=await db.from("v6_prediction_locks").upsert({employee_id:Number(employee_id),stage,locked:true,locked_at:new Date().toISOString()},{onConflict:"employee_id,stage"});
    if(upsertLockError) throw upsertLockError;
    return json(200,{ok:true,saved:rows.length});
  }catch(error){return json(error.statusCode||500,{error:error.message});}
};
