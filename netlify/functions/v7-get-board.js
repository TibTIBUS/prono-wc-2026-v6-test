const { json, supabase } = require("./v6-utils");
const { syncKnockoutTree } = require("./v7-sync-knockout-tree");

async function selectAll(db, table, applyOrder) {
  const pageSize = 1000;
  let from = 0;
  let all = [];

  while (true) {
    let query = db.from(table).select("*").range(from, from + pageSize - 1);
    if (applyOrder) query = applyOrder(query);

    const { data, error } = await query;
    if (error) throw error;

    all = all.concat(data || []);
    if (!data || data.length < pageSize) break;
    from += pageSize;
  }

  return all;
}

function collectTeams(groupMatches, knockoutMatches) {
  const set = new Set();

  for (const match of groupMatches || []) {
    if (match.team_a) set.add(String(match.team_a).trim());
    if (match.team_b) set.add(String(match.team_b).trim());
  }

  for (const match of knockoutMatches || []) {
    if (match.team_a && match.team_a !== "À déterminer") set.add(String(match.team_a).trim());
    if (match.team_b && match.team_b !== "À déterminer") set.add(String(match.team_b).trim());
  }

  return Array.from(set).filter(Boolean).sort((a, b) => a.localeCompare(b, "fr"));
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return json(200, {});

  try {
    const db = supabase();
    await syncKnockoutTree(db);

    const params = event.queryStringParameters || {};
    const employeeId = params.employee_id ? Number(params.employee_id) : null;

    const [employees, matches, groupMatches] = await Promise.all([
      selectAll(db, "employees", q => q.order("display_order", { ascending: true }).order("name", { ascending: true })),
      selectAll(db, "v7_knockout_matches", q => q.order("display_order", { ascending: true })),
      selectAll(db, "matches", q => q.order("position", { ascending: true }))
    ]);

    let predictions = [];

    if (employeeId) {
      const { data, error } = await db
        .from("v7_knockout_predictions")
        .select("*")
        .eq("employee_id", employeeId);

      if (error) throw error;
      predictions = data || [];
    }

    return json(200, {
      employees,
      matches,
      predictions,
      teams: collectTeams(groupMatches, matches),
      meta: {
        employees: employees.length,
        matches: matches.length,
        updated_at: new Date().toISOString()
      }
    });
  } catch (error) {
    return json(500, { error: error.message });
  }
};
