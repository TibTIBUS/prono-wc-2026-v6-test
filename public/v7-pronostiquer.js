
const OFFICIAL_SLOTS={
  "R32-01":{fifa:"M73",slotA:"2e Groupe A",slotB:"2e Groupe B"},
  "R32-02":{fifa:"M74",slotA:"1er Groupe E",slotB:"Meilleur 3e A/B/C/D/F"},
  "R32-03":{fifa:"M75",slotA:"1er Groupe F",slotB:"2e Groupe C"},
  "R32-04":{fifa:"M76",slotA:"1er Groupe C",slotB:"2e Groupe F"},
  "R32-05":{fifa:"M77",slotA:"1er Groupe I",slotB:"Meilleur 3e C/D/F/G/H"},
  "R32-06":{fifa:"M78",slotA:"2e Groupe E",slotB:"2e Groupe I"},
  "R32-07":{fifa:"M79",slotA:"1er Groupe A",slotB:"Meilleur 3e C/E/F/H/I"},
  "R32-08":{fifa:"M80",slotA:"1er Groupe L",slotB:"Meilleur 3e E/H/I/J/K"},
  "R32-09":{fifa:"M81",slotA:"1er Groupe D",slotB:"Meilleur 3e B/E/F/I/J"},
  "R32-10":{fifa:"M82",slotA:"1er Groupe G",slotB:"Meilleur 3e A/E/H/I/J"},
  "R32-11":{fifa:"M83",slotA:"2e Groupe K",slotB:"2e Groupe L"},
  "R32-12":{fifa:"M84",slotA:"1er Groupe H",slotB:"2e Groupe J"},
  "R32-13":{fifa:"M85",slotA:"1er Groupe B",slotB:"Meilleur 3e E/F/G/I/J"},
  "R32-14":{fifa:"M86",slotA:"1er Groupe J",slotB:"2e Groupe H"},
  "R32-15":{fifa:"M87",slotA:"1er Groupe K",slotB:"Meilleur 3e D/E/I/J/L"},
  "R32-16":{fifa:"M88",slotA:"2e Groupe D",slotB:"2e Groupe G"}
};

let STATE={employees:[],matches:[],predictions:[]};

const STAGE_INFOS={
  "16e de finale":{icon:"🏁",title:"16e de finale",text:"Les affiches doivent être saisies dans l'emplacement officiel correspondant."},
  "8e de finale":{icon:"⚔️",title:"8e de finale",text:"Les 8 matchs seront disponibles après les 16e."},
  "Quart de finale":{icon:"🏟️",title:"Quarts de finale",text:"Les 4 affiches seront ouvertes dès que les équipes seront connues."},
  "Demi-finale":{icon:"🔥",title:"Demi-finales",text:"Les 2 derniers matchs avant la finale."},
  "Petite finale":{icon:"🥉",title:"Match pour la troisième place",text:"Le pronostic pour la médaille de bronze."},
  "Finale":{icon:"🏆",title:"Finale",text:"Le dernier pronostic de la compétition."}
};

async function init(){await loadEmployeesAndBoard();}

async function loadEmployeesAndBoard(){
  try{
    const data=await v6api("v7-get-board");
    STATE.employees=data.employees||[];
    document.getElementById("employeeSelect").innerHTML=`<option value="">-- Choisir un salarié --</option>`+STATE.employees.map(e=>`<option value="${e.id}">${escapeHtml(e.name)}</option>`).join("");
    STATE.matches=data.matches||[];
    STATE.predictions=[];
    renderBoard();
  }catch(e){showBox("error",e.message);}
}

async function loadBoard(){
  try{
    const employeeId=document.getElementById("employeeSelect").value;
    if(!employeeId){STATE.predictions=[];renderBoard();return;}
    const data=await v6api(`v7-get-board?employee_id=${employeeId}`);
    STATE.matches=data.matches||[];
    STATE.predictions=data.predictions||[];
    renderBoard();
  }catch(e){showBox("error",e.message);}
}

function getPrediction(matchId){return STATE.predictions.find(p=>String(p.match_id)===String(matchId));}
function known(value){const v=String(value||"").trim().toLowerCase();return v&&!["à déterminer","a determiner","en attente","tbd"].includes(v);}
function hasStarted(kickoffAt){if(!kickoffAt)return false;return new Date(kickoffAt).getTime()<=Date.now();}
function canPredict(match){return match.is_open&&known(match.team_a)&&known(match.team_b)&&!hasStarted(match.kickoff_at)&&!getPrediction(match.id);}

function statusLabel(match){
  const pred=getPrediction(match.id);
  if(pred)return `<span class="badge success">Pronostic validé</span>`;
  if(!known(match.team_a)||!known(match.team_b))return `<span class="badge">En attente des équipes</span>`;
  if(hasStarted(match.kickoff_at))return `<span class="badge danger">Verrouillé</span>`;
  if(match.is_open)return `<span class="badge info">Ouvert aux pronostics</span>`;
  return `<span class="badge">Fermé</span>`;
}

function renderBoard(){
  const grouped={};
  for(const m of STATE.matches){if(!grouped[m.stage])grouped[m.stage]=[];grouped[m.stage].push(m);}
  const order=["16e de finale","8e de finale","Quart de finale","Demi-finale","Petite finale","Finale"];
  const entries=order.filter(stage=>grouped[stage]).map(stage=>[stage,grouped[stage]]);

  document.getElementById("board").innerHTML=entries.map(([stage,rows])=>{
    const info=STAGE_INFOS[stage]||{icon:"⚽",title:stage,text:"Phase finale"};
    const knownCount=rows.filter(m=>known(m.team_a)&&known(m.team_b)).length;
    const predictedCount=rows.filter(m=>getPrediction(m.id)).length;
    return `
      <section class="card v7-stage-card">
        <div class="v7-stage-title">
          <div class="v7-stage-icon">${info.icon}</div>
          <div><h3>${escapeHtml(info.title)}</h3><p>${escapeHtml(info.text)}</p></div>
          <div class="v7-stage-counter"><strong>${knownCount}/${rows.length}</strong><span>matchs connus</span></div>
          <div class="v7-stage-counter"><strong>${predictedCount}/${rows.length}</strong><span>validés</span></div>
        </div>
        <div class="v7-grid">${rows.map(matchCard).join("")}</div>
      </section>`;
  }).join("");
}

function matchCard(match){
  const pred=getPrediction(match.id);
  const disabled=!canPredict(match);
  const predText=pred?`<p class="muted">Ton prono : <strong>${pred.score_a} - ${pred.score_b}</strong></p>`:"";
  const slot=OFFICIAL_SLOTS[match.id];

  return `
    <article class="v7-match-card">
      <div class="v7-match-head"><strong>${slot?slot.fifa:"Match "+match.match_number}</strong>${statusLabel(match)}</div>
      ${slot?`<div class="v7-slot-box"><span>Repère officiel</span><strong>${escapeHtml(slot.slotA)}</strong><em>contre</em><strong>${escapeHtml(slot.slotB)}</strong></div>`:""}
      <div class="v7-teams"><div>${escapeHtml(match.team_a||"En attente")}</div><div>${escapeHtml(match.team_b||"En attente")}</div></div>
      <p class="muted">${match.kickoff_at?new Date(match.kickoff_at).toLocaleString("fr-FR"):"Date à confirmer"}</p>
      ${predText}
      ${pred?"":`<div class="v7-score-row"><input ${disabled?"disabled":""} id="a-${match.id}" type="number" min="0" placeholder="0"><span>-</span><input ${disabled?"disabled":""} id="b-${match.id}" type="number" min="0" placeholder="0"></div><button class="btn primary" ${disabled?"disabled":""} onclick="submitPrediction('${match.id}')">Valider ce match</button>`}
    </article>`;
}

async function submitPrediction(matchId){
  try{
    const employeeId=document.getElementById("employeeSelect").value;
    if(!employeeId)throw new Error("Choisis d'abord ton nom.");
    const scoreA=Number(document.getElementById(`a-${matchId}`).value);
    const scoreB=Number(document.getElementById(`b-${matchId}`).value);
    if(!Number.isInteger(scoreA)||!Number.isInteger(scoreB)||scoreA<0||scoreB<0)throw new Error("Saisis deux scores valides.");
    if(!confirm("Valider définitivement ce pronostic ?"))return;
    const data=await v6api("v7-submit-prediction",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({employee_id:Number(employeeId),match_id:matchId,score_a:scoreA,score_b:scoreB})});
    showBox("success",data.message||"Pronostic enregistré.");
    await loadBoard();
  }catch(e){showBox("error",e.message);}
}

function showBox(id,msg){const el=document.getElementById(id);el.textContent=msg||"";el.style.display=msg?"block":"none";}
init();
