async function loadRanking(){
  try{
    const data = await v6api("v6-get-ranking");
    const ranking = data.ranking || data.classement || data.rows || [];
    const meta = data.meta || data.stats || data.summary || {};
    const funStats = data.fun_stats || {};

    document.getElementById("statLeader").textContent = ranking[0]?.employee || ranking[0]?.salarie || "-";
    document.getElementById("statPlayers").textContent = meta.employees || meta.participants || 0;
    document.getElementById("statGroup").textContent = meta.completed_group_results || meta.group_results || meta.results || 0;
    document.getElementById("statKo").textContent = meta.completed_knockout_results || meta.knockout_results || 0;
    document.getElementById("lastUpdate").textContent = "Mise à jour : " + new Date(meta.updated_at || Date.now()).toLocaleString("fr-FR");

    renderFunStats(funStats);

    document.getElementById("rankingBody").innerHTML = ranking.map(r => `
      <tr>
        <td>${medal(r.rank || r.rang)}</td>
        <td>${formatEvolution(r)}</td>
        <td>
          <div class="name-cell">
            <span class="avatar">${initials(r.employee || r.salarie || r.name)}</span>
            <span>${escapeHtml(r.employee || r.salarie || r.name)}</span>
          </div>
        </td>
        <td><strong>${r.total || 0}</strong></td>
        <td>${r.group_points || r.groupTotal || 0}</td>
        <td>${r.knockout_points || r.knockoutTotal || 0}</td>
        <td>${r.exact_scores || r.scores_exacts || r.exact || 0}</td>
        <td>${r.good_results || r.bons_resultats || r.good || 0}</td>
      </tr>
    `).join("");

  }catch(e){
    show("error", e.message, true);
  }
}

function renderFunStats(funStats){
  const leaderSince = funStats.leader_since || {};
  const bestProgression = funStats.best_progression || {};
  const biggestDrop = funStats.biggest_drop || {};

  setText("funLeaderName", leaderSince.employee || "-");
  setText("funLeaderDetail", leaderSince.label || "En attente d'historique");
  setText("funUpName", bestProgression.employee || "-");
  setText("funUpDetail", bestProgression.label || "Aucun mouvement");
  setText("funDownName", biggestDrop.employee || "-");
  setText("funDownDetail", biggestDrop.label || "Aucun mouvement");
}

function setText(id, value){
  const el = document.getElementById(id);
  if(el) el.textContent = value;
}

function formatEvolution(row){
  const type = row.evolution_type || "same";
  const value = row.evolution || "➖";
  if(type === "up") return `<span class="evo evo-up">${value}</span>`;
  if(type === "down") return `<span class="evo evo-down">${value}</span>`;
  return `<span class="evo evo-same">${value}</span>`;
}

loadRanking();
setInterval(loadRanking, 60000);
