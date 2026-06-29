async function loadPlayerDetail() {
  try {
    const params = new URLSearchParams(window.location.search);
    const id = params.get("id");

    if (!id) {
      document.getElementById("playerName").textContent = "Salarié introuvable";
      return;
    }

    const response = await fetch(`/.netlify/functions/v6-get-player-detail?id=${id}`);
    const data = await response.json();

    if (data.error) {
      throw new Error(data.error);
    }

    document.getElementById("playerName").textContent =
      data.employee?.name || "-";

    document.getElementById("totalPoints").textContent =
      data.summary?.total || 0;

    document.getElementById("groupPoints").textContent =
      data.summary?.group_points || 0;

    document.getElementById("knockoutPoints").textContent =
      data.summary?.knockout_points || 0;

    document.getElementById("exactScores").textContent =
      data.summary?.exact_scores || 0;

    document.getElementById("goodResults").textContent =
      data.summary?.good_results || 0;

    const tbody = document.getElementById("matchesBody");
    const rows = data.matches || [];

    tbody.innerHTML = rows.length ? rows.map(match => `
      <tr>
        <td>${escapeHtml(match.phase || "-")}</td>
        <td>${escapeHtml(match.team_a || "-")} - ${escapeHtml(match.team_b || "-")}</td>
        <td>${escapeHtml(match.prediction || "-")}</td>
        <td>${escapeHtml(match.result || "-")}</td>
        <td><strong>${match.points || 0}</strong></td>
        <td>${formatLabel(match.label)}</td>
      </tr>
    `).join("") : `
      <tr>
        <td colspan="6">Aucun match terminé pour le moment.</td>
      </tr>
    `;

  } catch (e) {
    document.getElementById("error").innerHTML =
      `<div class="error">${escapeHtml(e.message)}</div>`;
  }
}

function formatLabel(label) {
  const value = String(label || "-");

  if (value === "Score exact") {
    return `<span class="badge success">Score exact</span>`;
  }

  if (value === "Bon résultat") {
    return `<span class="badge info">Bon résultat</span>`;
  }

  if (value === "Raté") {
    return `<span class="badge danger">Raté</span>`;
  }

  return `<span class="badge">${escapeHtml(value)}</span>`;
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text || "";
  return div.innerHTML;
}

loadPlayerDetail();
