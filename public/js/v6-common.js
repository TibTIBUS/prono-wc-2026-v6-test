
async function v6api(path, options = {}) {
  const res = await fetch("/.netlify/functions/" + path, {...options, headers: {"Content-Type":"application/json", ...(options.headers || {})}});
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Erreur serveur");
  return data;
}
function escapeHtml(value){return String(value ?? "").replace(/[&<>"']/g, s=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[s]));}
function initials(name){return String(name || "?").split(/\s+/).map(x=>x[0]).join("").slice(0,2).toUpperCase();}
function medal(rank){if(rank===1)return `<span class="medal gold-medal">1</span>`; if(rank===2)return `<span class="medal silver-medal">2</span>`; if(rank===3)return `<span class="medal bronze-medal">3</span>`; return `<span class="rank">${rank}</span>`;}
function show(elId, message, isError=false){const el=document.getElementById(elId); el.textContent=message; el.style.display="block"; if(!isError)setTimeout(()=>el.style.display="none",3500);}
