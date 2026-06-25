
const { json, supabase, requireAdmin } = require("./v6-utils");

function cleanTeam(value) {
  const v = String(value || "").trim();
  if (!v || v === "null" || v === "undefined") return null;
  return v;
}

function cleanDate(value) {
  const v = String(value || "").trim();
  if (!v) return null;

  const d = new Date(v);
  if (Number.isNaN(d.getTime())) throw new Error("Date invalide.");

  return d.toISOString();
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return json(200, {});
  if (event.httpMethod !== "POST") return json(405, { error: "Méthode non autorisée." });

  try {
    requireAdmin(event);

    const body = JSON.parse(event.body || "{}");
    const id = String(body.id || "").trim();
    if (!id) throw new Error("ID du match manquant.");

    const teamA = cleanTeam(body.team_a);
    const teamB = cleanTeam(body.team_b);
    const kickoffAt = cleanDate(body.kickoff_at);
    const isOpen = Boolean(body.is_open);

    if (isOpen && (!teamA || !teamB)) {
      throw new Error("Impossible d'ouvrir les pronostics tant que les deux équipes ne sont pas renseignées.");
    }

    const db = supabase();
    const { error } = await db
      .from("v7_knockout_matches")
      .update({
        team_a: teamA,
        team_b: teamB,
        kickoff_at: kickoffAt,
        is_open: isOpen,
        status: body.status || "scheduled",
        updated_at: new Date().toISOString()
      })
      .eq("id", id);

    if (error) throw error;

    return json(200, { ok: true, message: "Match enregistré.", id });
  } catch (error) {
    return json(error.statusCode || 500, { error: error.message });
  }
};
