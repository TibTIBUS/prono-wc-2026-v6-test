const { json, supabase, requireAdmin } = require("./v6-utils");

const STAGES = [
  { stage: "16e de finale", code: "R32", count: 16 },
  { stage: "8e de finale", code: "R16", count: 8 },
  { stage: "Quart de finale", code: "QF", count: 4 },
  { stage: "Demi-finale", code: "SF", count: 2 },
  { stage: "Petite finale", code: "BF", count: 1 },
  { stage: "Finale", code: "F", count: 1 }
];

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return json(200, {});
  if (event.httpMethod !== "POST") return json(405, { error: "Méthode non autorisée." });
  try {
    requireAdmin(event);
    const db = supabase();
    const rows = [];
    let display = 1;

    for (const s of STAGES) {
      for (let i = 1; i <= s.count; i++) {
        rows.push({
          id: `${s.code}-${String(i).padStart(2, "0")}`,
          stage: s.stage,
          match_number: i,
          display_order: display++,
          status: "pending",
          is_open: false,
          updated_at: new Date().toISOString()
        });
      }
    }

    const { error } = await db.from("v7_knockout_matches").upsert(rows, { onConflict: "id" });
    if (error) throw error;

    return json(200, { ok: true, message: "Tableau V7 initialisé.", matches: rows.length });
  } catch (error) {
    return json(error.statusCode || 500, { error: error.message });
  }
};
