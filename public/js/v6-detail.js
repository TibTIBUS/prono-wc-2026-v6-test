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

    tbody.innerHTML = (data.matches || []).map(match => `
      <tr>
        <td>${match.phase || "-"}</td>
        <td>${escapeHtml(match.team_a || "-")} - ${escapeHtml(match.team_b || "-")}</td>
        <td>${match.prediction || "-"}</td>
        <td>${match.result || "-"}</td>
        <td><strong>${match.points || 0}</strong></td>
        <td>${match.label || "-"}</td>
      </tr>
    `).join("");

  } catch (e) {
    document.getElementById("error").innerHTML =
      `<div class="error">${e.message}</div>`;
  }
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text || "";
  return div.innerHTML;
}

loadPlayerDetail();
