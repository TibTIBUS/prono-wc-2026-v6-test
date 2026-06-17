
const { json, supabase, requireAdmin } = require("./v6-utils");
async function syncWithApi(){
  const apiKey=process.env.API_FOOTBALL_KEY;
  const league=process.env.API_FOOTBALL_LEAGUE_ID||"1";
  const season=process.env.API_FOOTBALL_SEASON||"2026";
  const baseUrl=process.env.API_FOOTBALL_BASE_URL||"https://v3.football.api-sports.io";
  if(!apiKey) throw new Error("API_FOOTBALL_KEY non configurée.");
  const url=`${baseUrl}/fixtures?league=${league}&season=${season}`;
  const res=await fetch(url,{headers:{"x-apisports-key":apiKey}});
  if(!res.ok) throw new Error(`Erreur API football : ${res.status}`);
  const payload=await res.json();
  const fixtures=payload.response||[];
  const knockout=fixtures.filter(item=>{const round=String(item.league?.round||"").toLowerCase();return round.includes("round of 32")||round.includes("round of 16")||round.includes("quarter")||round.includes("semi")||round.includes("final");});
  const rows=knockout.map((item,index)=>{const round=item.league?.round||"Phase finale";const apiId=String(item.fixture?.id);const goals=item.goals||{};const status=item.fixture?.status?.short||item.fixture?.status?.long||"scheduled";return {id:`api-${apiId}`,api_match_id:apiId,stage:round,team_a:item.teams?.home?.name||"Equipe A",team_b:item.teams?.away?.name||"Equipe B",kickoff_at:item.fixture?.date||null,status,score_a:goals.home===null||goals.home===undefined?null:Number(goals.home),score_b:goals.away===null||goals.away===undefined?null:Number(goals.away),is_open:false,display_order:index+1,updated_at:new Date().toISOString()};});
  const db=supabase();
  if(rows.length){const {error}=await db.from("v6_knockout_matches").upsert(rows,{onConflict:"id"}); if(error) throw error;}
  await db.from("v6_sync_logs").insert({status:"success",message:`Synchronisation OK : ${rows.length} matchs phases finales.`,payload:{count:rows.length}});
  return {ok:true,count:rows.length};
}
exports.handler=async(event)=>{if(event.httpMethod==="OPTIONS")return json(200,{});try{if(event.httpMethod==="POST")requireAdmin(event);return json(200,await syncWithApi());}catch(error){try{await supabase().from("v6_sync_logs").insert({status:"error",message:error.message,payload:{}});}catch(e){}return json(error.statusCode||500,{error:error.message});}};
exports.syncWithApi=syncWithApi;
