
function authHeaders(){
  return {
    "Content-Type":"application/json",
    "x-admin-password":document.getElementById("adminPassword").value
  };
}

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

let TEAMS=[];

function showBox(id,msg){const el=document.getElementById(id);el.textContent=msg||"";el.style.display=msg?"block":"none";}

async function initBoard(){
  try{
    const data=await v6api("v7-init-board",{method:"POST",headers:authHeaders(),body:JSON.stringify({})});
    showBox("success",data.message||"Tableau initialisé.");
    await loadBoard();
  }catch(e){showBox("error",e.message);}
}

async function syncApi(){
  try{
    const data=await v6api("v7-sync-api",{method:"POST",headers:authHeaders(),body:JSON.stringify({})});
    showBox("success",`${data.message||"Synchronisation terminée."} Compétition: ${data.chosen_competition?.name||data.chosen_competition?.league||"-"}`);
    console.log("V7 sync result",data);
    await loadBoard();
  }catch(e){showBox("error",e.message);}
}

async function debugApi(){
  try{
    const data=await v6api("v7-debug-api",{method:"POST",headers:authHeaders(),body:JSON.stringify({})});
    console.log("V7 API debug",data);
    const tested=data.tested||[];
    const lines=tested.map(t=>`${t.name||"Compétition"} | league=${t.league} season=${t.season} | fixtures=${t.total_fixtures}`).join("\n");
    showBox("success",`Diagnostic API terminé. Détails dans la console.\n${lines||"Aucune compétition testée."}`);
  }catch(e){showBox("error",e.message);}
}

async function loadBoard(){
  try{
    const data=await v6api("v7-get-board");
    TEAMS=data.teams||[];
    renderBoard(data.matches||[]);
  }catch(e){showBox("error",e.message);}
}

function optionList(current){
  const currentValue=String(current||"");
  const all=[...new Set([currentValue,...TEAMS].filter(Boolean))];
  return `<option value="">À déterminer</option>`+
    all.map(t=>`<option value="${escapeHtml(t)}" ${t===currentValue?"selected":""}>${escapeHtml(t)}</option>`).join("");
}

function toLocalDatetime(value){
  if(!value) return "";
  const d=new Date(value);
  if(Number.isNaN(d.getTime())) return "";
  const pad=n=>String(n).padStart(2,"0");
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function localInputToIso(value){
  if(!value) return null;
  const d=new Date(value);
  if(Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function renderBoard(matches){
  const grouped={};
  for(const m of matches){if(!grouped[m.stage]) grouped[m.stage]=[];grouped[m.stage].push(m);}
  document.getElementById("board").innerHTML=Object.entries(grouped).map(([stage,rows])=>`
    <div class="v7-admin-stage">
      <h3>${escapeHtml(stage)}</h3>
      <div class="v7-admin-grid">${rows.map(matchEditor).join("")}</div>
    </div>`).join("");
}

function matchEditor(m){
  const slot=OFFICIAL_SLOTS[m.id];
  return `
    <article class="v7-admin-card">
      <div class="v7-admin-head"><strong>${slot ? slot.fifa : "Match "+m.match_number}</strong><span class="badge ${m.is_open ? "success" : ""}">${m.is_open ? "Ouvert" : "Fermé"}</span></div>
      ${slot ? `<div class="v7-slot-box"><span>Repère officiel</span><strong>${escapeHtml(slot.slotA)}</strong><em>contre</em><strong>${escapeHtml(slot.slotB)}</strong></div>` : ""}
      <label>Équipe A</label><select id="teamA-${m.id}">${optionList(m.team_a)}</select>
      <label>Équipe B</label><select id="teamB-${m.id}">${optionList(m.team_b)}</select>
      <label>Date et heure du match</label><input id="kickoff-${m.id}" type="datetime-local" value="${toLocalDatetime(m.kickoff_at)}">
      <label class="v7-check"><input id="open-${m.id}" type="checkbox" ${m.is_open ? "checked" : ""}>Ouvrir les pronostics pour ce match</label>
      <button class="btn primary" onclick="saveMatch('${m.id}')">Enregistrer ce match</button>
    </article>`;
}

async function saveMatch(id){
  try{
    const teamA=document.getElementById(`teamA-${id}`).value;
    const teamB=document.getElementById(`teamB-${id}`).value;
    const kickoff=document.getElementById(`kickoff-${id}`).value;
    const isOpen=document.getElementById(`open-${id}`).checked;
    const data=await v6api("v7-admin-save-match",{
      method:"POST",
      headers:authHeaders(),
      body:JSON.stringify({id,team_a:teamA,team_b:teamB,kickoff_at:localInputToIso(kickoff),is_open:isOpen,status:"scheduled"})
    });
    showBox("success",data.message||"Match enregistré.");
    await loadBoard();
  }catch(e){showBox("error",e.message);}
}
loadBoard();
