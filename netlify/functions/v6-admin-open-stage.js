const { json, supabase, requireAdmin } = require("./v6-utils");

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return json(200, {});
  if (event.httpMethod !== "POST") return json(405, { error: "Méthode non autorisée." });

  try {
    requireAdmin(event);

    const body = JSON.parse(event.body || "{}");
    const stage = body.stage;
    const isOpen = body.is_open === true;

    if (!stage) throw new Error("Phase manquante.");

    const db = supabase();

    const { error } = await db
      .from("v6_knockout_matches")
      .update({
        is_open: isOpen,
        updated_at: new Date().toISOString()
      })
      .eq("stage", stage);

    if (error) throw error;

    return json(200, {
      ok: true,
      stage,
      is_open: isOpen,
      message: isOpen ? `Pronostics ouverts pour ${stage}.` : `Pronostics fermés pour ${stage}.`
    });

  } catch (error) {
    return json(error.statusCode || 500, {
      error: error.message || "Erreur ouverture phase."
    });
  }
};
