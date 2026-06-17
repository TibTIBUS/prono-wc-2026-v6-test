
const { createClient } = require("@supabase/supabase-js");

function json(statusCode, body){
  return {statusCode, headers:{"Content-Type":"application/json; charset=utf-8","Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"Content-Type, x-admin-password","Access-Control-Allow-Methods":"GET,POST,OPTIONS"}, body:JSON.stringify(body)};
}
function supabase(){
  const url=process.env.SUPABASE_URL, key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url||!key) throw new Error("Variables Supabase manquantes.");
  return createClient(url,key);
}
function requireAdmin(event){
  const expected=process.env.ADMIN_PASSWORD;
  const received=event.headers["x-admin-password"] || event.headers["X-Admin-Password"];
  if(!expected) throw new Error("ADMIN_PASSWORD non configuré.");
  if(received!==expected){const err=new Error("Mot de passe admin incorrect."); err.statusCode=401; throw err;}
}
function outcome(a,b){if(a>b)return "A"; if(a<b)return "B"; return "D";}
function pointsFor(pred, real, exactPts, goodPts){
  if(!pred||!real||real.score_a===null||real.score_b===null||pred.score_a===null||pred.score_b===null) return {points:0, exact:false, good:false};
  if(Number(pred.score_a)===Number(real.score_a)&&Number(pred.score_b)===Number(real.score_b)) return {points:exactPts, exact:true, good:true};
  if(outcome(Number(pred.score_a),Number(pred.score_b))===outcome(Number(real.score_a),Number(real.score_b))) return {points:goodPts, exact:false, good:true};
  return {points:0, exact:false, good:false};
}
async function loadV6Data(db){
  const [employees, groupMatches, groupPredictions, groupResults, koMatches, koPredictions, locks] = await Promise.all([
    db.from("employees").select("*").order("display_order",{ascending:true}).order("name",{ascending:true}),
    db.from("matches").select("*").order("position",{ascending:true}),
    db.from("predictions").select("*"),
    db.from("results").select("*"),
    db.from("v6_knockout_matches").select("*").order("display_order",{ascending:true}).order("kickoff_at",{ascending:true}),
    db.from("v6_knockout_predictions").select("*"),
    db.from("v6_prediction_locks").select("*")
  ]);
  for(const res of [employees,groupMatches,groupPredictions,groupResults,koMatches,koPredictions,locks]) if(res.error) throw res.error;
  return {employees:employees.data||[], groupMatches:groupMatches.data||[], groupPredictions:groupPredictions.data||[], groupResults:groupResults.data||[], koMatches:koMatches.data||[], koPredictions:koPredictions.data||[], locks:locks.data||[]};
}
function buildCombinedRanking(data){
  const groupResultsByMatch=new Map(data.groupResults.map(r=>[r.match_id,r]));
  const groupPredsByEmployee=new Map();
  for(const p of data.groupPredictions){if(!groupPredsByEmployee.has(p.employee_id))groupPredsByEmployee.set(p.employee_id,new Map());groupPredsByEmployee.get(p.employee_id).set(p.match_id,p);}
  const koResultsByMatch=new Map(data.koMatches.filter(m=>m.score_a!==null&&m.score_b!==null).map(m=>[m.id,m]));
  const koPredsByEmployee=new Map();
  for(const p of data.koPredictions){if(!koPredsByEmployee.has(p.employee_id))koPredsByEmployee.set(p.employee_id,new Map());koPredsByEmployee.get(p.employee_id).set(p.match_id,p);}
  return data.employees.map(employee=>{
    let groupTotal=0, groupExact=0, groupGood=0, koTotal=0, koExact=0, koGood=0;
    const gp=groupPredsByEmployee.get(employee.id)||new Map();
    for(const match of data.groupMatches){const real=groupResultsByMatch.get(match.id); if(!real)continue; const calc=pointsFor(gp.get(match.id),real,5,2); groupTotal+=calc.points; if(calc.exact)groupExact++; else if(calc.good)groupGood++;}
    const kp=koPredsByEmployee.get(employee.id)||new Map();
    for(const match of data.koMatches){const real=koResultsByMatch.get(match.id); if(!real)continue; const calc=pointsFor(kp.get(match.id),real,10,5); koTotal+=calc.points; if(calc.exact)koExact++; else if(calc.good)koGood++;}
    return {employee_id:employee.id, employee:employee.name, total:groupTotal+koTotal, groupTotal, knockoutTotal:koTotal, exact:groupExact+koExact, good:groupGood+koGood};
  }).sort((a,b)=>b.total-a.total||b.exact-a.exact||b.good-a.good||a.employee.localeCompare(b.employee)).map((r,i)=>({rank:i+1,...r}));
}
module.exports={json,supabase,requireAdmin,loadV6Data,buildCombinedRanking};
