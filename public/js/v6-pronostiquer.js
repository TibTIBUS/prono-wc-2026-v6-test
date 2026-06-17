
let state=null;
async function init(){try{state=await v6api("v6-get-data");renderEmployees();renderMatches();}catch(e){show("error",e.message,true);}}
function selectedEmployeeId(){return Number(document.getElementById("employeeSelect").value);}
function selectedStage(){return document.getElementById("stageSelect").value;}
function renderEmployees(){
  document.getElementById("employeeSelect").innerHTML=state.employees.map(e=>`<option value="${e.id}">${escapeHtml(e.name)}</option>`).join("");
  const stages=[...new Set(state.koMatches.filter(m=>m.is_open).map(m=>m.stage))];
  document.getElementById("stageSelect").innerHTML=stages.length?stages.map(s=>`<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join(""):`<option value="">Aucune phase ouverte</option>`;
}
function isLocked(employeeId,stage){return state.locks.some(l=>Number(l.employee_id)===Number(employeeId)&&l.stage===stage&&l.locked);}
function existingPrediction(employeeId,matchId){return state.koPredictions.find(p=>Number(p.employee_id)===Number(employeeId)&&p.match_id===matchId);}
function renderMatches(){
  const employeeId=selectedEmployeeId(), stage=selectedStage(), locked=isLocked(employeeId,stage);
  const openMatches=state.koMatches.filter(m=>m.is_open&&m.stage===stage);
  const status=document.getElementById("statusBox");
  if(!stage||!openMatches.length){status.innerHTML=`<span class="badge info">Aucun match ouvert</span>`;document.getElementById("matchesBody").innerHTML="";document.getElementById("submitBtn").disabled=true;return;}
  status.innerHTML=locked?`<span class="badge lock">Pronostics validés et verrouillés</span>`:`<span class="badge open">Pronostics ouverts</span>`;
  document.getElementById("submitBtn").disabled=locked;
  document.getElementById("matchesBody").innerHTML=openMatches.map(m=>{const p=existingPrediction(employeeId,m.id);return `<tr><td>${escapeHtml(m.stage)}</td><td>${escapeHtml(m.team_a)} - ${escapeHtml(m.team_b)}</td><td><input class="score-input" type="number" min="0" id="score_${m.id}_a" value="${p?.score_a??""}" ${locked?"disabled":""}></td><td><input class="score-input" type="number" min="0" id="score_${m.id}_b" value="${p?.score_b??""}" ${locked?"disabled":""}></td><td>${m.kickoff_at?new Date(m.kickoff_at).toLocaleString("fr-FR"):"-"}</td></tr>`}).join("");
}
async function submitPredictions(){
  const employeeId=selectedEmployeeId(), employee=state.employees.find(e=>Number(e.id)===employeeId), stage=selectedStage();
  const openMatches=state.koMatches.filter(m=>m.is_open&&m.stage===stage);
  if(!confirm(`Confirmer la validation définitive des pronostics pour ${employee.name} ?\n\nAprès validation, ils ne pourront plus être modifiés.`)) return;
  const predictions=[];
  for(const m of openMatches){const a=document.getElementById(`score_${m.id}_a`).value,b=document.getElementById(`score_${m.id}_b`).value;if(a===""||b===""){alert("Tous les scores doivent être remplis.");return;}predictions.push({match_id:m.id,score_a:Number(a),score_b:Number(b)});}
  try{await v6api("v6-submit-predictions",{method:"POST",body:JSON.stringify({employee_id:employeeId,stage,predictions})});show("success","Pronostics validés et verrouillés.");state=await v6api("v6-get-data");renderMatches();}catch(e){show("error",e.message,true);}
}
init();
