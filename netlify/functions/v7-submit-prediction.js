const { json, supabase } = require("./v6-utils");

function isKnownTeam(value) {
  const v = String(value || "").trim().toLowerCase();
  return v && !["à déterminer", "a determiner", "en attente", "tbd", "null"].includes(v);
}
function hasStarted(kickoffAt) {
  if (!kickoffAt) return false;
  return new Date(kickoffAt).getTime() <= Date.now();
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return json(200, {});
  if (event.httpMethod !== "POST") return json(405, { error: "Méthode non autorisée." });
  try {
    const body = JSON.parse(event.body || "{}");
    const employeeId = Number(body.employee_id);
    const matchId = String(body.match_id || "");
    const scoreA = Number(body.score_a);
    const scoreB = Number(body.score_b);

    if (!employeeId) throw new Error("Salarié manquant.");
    if (!matchId) throw new Error("Match manquant.");
    if (!Number.isInteger(scoreA) || !Number.isInteger(scoreB) || scoreA < 0 || scoreB < 0) throw new Error("Scores invalides.");

    const db = supabase();
    const { data: match, error: matchError } = await db.from("v7_knockout_matches").select("*").eq("id", matchId).single();
    if (matchError) throw matchError;

    if (!isKnownTeam(match.team_a) || !isKnownTeam(match.team_b)) throw new Error("Les deux équipes ne sont pas encore connues.");
    if (!match.is_open) throw new Error("Ce match n'est pas encore ouvert aux pronostics.");
    if (hasStarted(match.kickoff_at)) throw new Error("Le match a commencé : pronostic verrouillé.");

    const { data: existing, error: existingError } = await db
      .from("v7_knockout_predictions")
      .select("*")
      .eq("employee_id", employeeId)
      .eq("match_id", matchId)
      .maybeSingle();
    if (existingError) throw existingError;
    if (existing && existing.locked) throw new Error("Pronostic déjà validé pour ce match.");

    const { error } = await db.from("v7_knockout_predictions").upsert({
      employee_id: employeeId,
      match_id: matchId,
      score_a: scoreA,
      score_b: scoreB,
      locked: true,
      submitted_at: new Date().toISOString()
    }, { onConflict: "employee_id,match_id" });

    if (error) throw error;
    return json(200, { ok: true, message: "Pronostic validé et verrouillé pour ce match." });
  } catch (error) {
    return json(error.statusCode || 500, { error: error.message });
  }
};
