
async function loadRanking(){
  try{
    const data=await v6api("v6-get-ranking"), ranking=data.ranking||[];
    document.getElementById("statLeader").textContent=ranking[0]?.employee||"-";
    document.getElementById("statPlayers").textContent=data.meta.employees;
    document.getElementById("statGroup").textContent=data.meta.group_results;
    document.getElementById("statKo").textContent=data.meta.knockout_results;
    document.getElementById("lastUpdate").textContent="Mise à jour : "+new Date(data.meta.updated_at).toLocaleString("fr-FR");
    document.getElementById("rankingBody").innerHTML=ranking.map(r=>`<tr><td>${medal(r.rank)}</td><td><div class="name-cell"><span class="avatar">${initials(r.employee)}</span><span>${escapeHtml(r.employee)}</span></div></td><td><strong>${r.total}</strong></td><td>${r.groupTotal}</td><td>${r.knockoutTotal}</td><td>${r.exact}</td><td>${r.good}</td></tr>`).join("");
  }catch(e){show("error",e.message,true);}
}
loadRanking();setInterval(loadRanking,60000);
