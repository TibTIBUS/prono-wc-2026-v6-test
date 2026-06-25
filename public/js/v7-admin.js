function authHeaders(){
  return {
    "Content-Type":"application/json",
    "x-admin-password":document.getElementById("adminPassword").value
  };
}

function showBox(id,msg){
  const el=document.getElementById(id);
  el.textContent=msg||"";
  el.style.display=msg?"block":"none";
}

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
    showBox("success",`${data.message || "Synchronisation terminée."} Compétition: ${data.chosen_competition?.name || data.chosen_competition?.league || "-"}`);
    console.log("V7 sync result", data);
    await loadBoard();
  }catch(e){showBox("error",e.message);}
}

async function debugApi(){
  try{
    const data=await v6api("v7-debug-api",{method:"POST",headers:authHeaders(),body:JSON.stringify({})});
    console.log("V7 API debug", data);
    const tested = data.tested || [];
    const lines = tested.map(t => `${t.name || "Compétition"} | league=${t.league} season=${t.season} | fixtures=${t.total_fixtures}`).join("\\n");
    showBox("success", `Diagnostic API terminé. Détails dans la console.\\n${lines || "Aucune compétition testée."}`);
  }catch(e){showBox("error",e.message);}
}

async function loadBoard(){
  try{
    const data=await v6api("v7-get-board");
    renderBoard(data.matches||[]);
  }catch(e){showBox("error",e.message);}
}

function renderBoard(matches){
  const grouped={};
  for(const m of matches){
    if(!grouped[m.stage])grouped[m.stage]=[];
    grouped[m.stage].push(m);
  }
  document.getElementById("board").innerHTML=Object.entries(grouped).map(([stage,rows])=>`
    <div class="v7-stage">
      <h3>${escapeHtml(stage)}</h3>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Match</th>
              <th>Équipe A</th>
              <th>Équipe B</th>
              <th>Date</th>
              <th>Ouvert</th>
              <th>Statut</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map(m=>`
              <tr>
                <td>${m.match_number}</td>
                <td>${escapeHtml(m.team_a||"En attente")}</td>
                <td>${escapeHtml(m.team_b||"En attente")}</td>
                <td>${m.kickoff_at?new Date(m.kickoff_at).toLocaleString("fr-FR"):"-"}</td>
                <td>${m.is_open?"✅":"⏳"}</td>
                <td>${escapeHtml(m.status||"-")}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    </div>
  `).join("");
}

loadBoard();
