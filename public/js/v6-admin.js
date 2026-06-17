
let state=null;
function adminPassword(){return document.getElementById("adminPassword").value.trim();}
function authHeaders(){return {"x-admin-password":adminPassword()};}
async function init(){try{state=await v6api("v6-get-data");renderAdmin();}catch(e){show("error",e.message,true);}}
function renderAdmin(){
  document.getElementById("matchList").innerHTML=state.koMatches.map(m=>`<tr><td>${escapeHtml(m.stage)}</td><td>${escapeHtml(m.team_a)} - ${escapeHtml(m.team_b)}</td><td>${m.score_a===null?"-":m.score_a} - ${m.score_b===null?"-":m.score_b}</td><td><span class="badge ${m.is_open?"open":"lock"}">${m.is_open?"Ouvert":"Fermé"}</span></td><td><button class="btn ${m.is_open?"red":"primary"}" onclick="toggleOpen('${m.id}',${!m.is_open})">${m.is_open?"Fermer":"Ouvrir"}</button></td></tr>`).join("");
  const stages=[...new Set(state.koMatches.map(m=>m.stage))];
  document.getElementById("unlockStage").innerHTML=stages.map(s=>`<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join("");
  document.getElementById("unlockEmployee").innerHTML=state.employees.map(e=>`<option value="${e.id}">${escapeHtml(e.name)}</option>`).join("");
  document.getElementById("locksBody").innerHTML=state.employees.map(e=>{const locks=state.locks.filter(l=>Number(l.employee_id)===Number(e.id)&&l.locked).map(l=>l.stage).join(", ");return `<tr><td>${escapeHtml(e.name)}</td><td>${locks||"-"}</td></tr>`}).join("");
}
async function toggleOpen(matchId,isOpen){try{await v6api("v6-admin-update-open",{method:"POST",headers:authHeaders(),body:JSON.stringify({match_id:matchId,is_open:isOpen})});state=await v6api("v6-get-data");renderAdmin();}catch(e){show("error",e.message,true);}}
async function addManualMatch(){try{await v6api("v6-admin-save-match",{method:"POST",headers:authHeaders(),body:JSON.stringify({stage:document.getElementById("stage").value,team_a:document.getElementById("teamA").value,team_b:document.getElementById("teamB").value,kickoff_at:document.getElementById("kickoff").value||null,is_open:document.getElementById("isOpen").checked,display_order:Number(document.getElementById("displayOrder").value||0)})});show("success","Match ajouté.");state=await v6api("v6-get-data");renderAdmin();}catch(e){show("error",e.message,true);}}
async function syncApi(){try{await v6api("v6-sync-api",{method:"POST",headers:authHeaders(),body:JSON.stringify({})});show("success","Synchronisation API terminée.");state=await v6api("v6-get-data");renderAdmin();}catch(e){show("error",e.message,true);}}
async function unlockEmployee(){try{await v6api("v6-admin-unlock",{method:"POST",headers:authHeaders(),body:JSON.stringify({employee_id:Number(document.getElementById("unlockEmployee").value),stage:document.getElementById("unlockStage").value})});show("success","Salarié déverrouillé.");state=await v6api("v6-get-data");renderAdmin();}catch(e){show("error",e.message,true);}}
init();
