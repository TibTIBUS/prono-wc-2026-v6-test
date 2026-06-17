const { json, supabase } = require("./v6-utils");

function outcome(scoreA, scoreB) {
  const diff = Number(scoreA) - Number(scoreB);
  if (diff > 0) return "A";
  if (diff < 0) return "B";
  return "N";
}

function groupPoints(prediction, result) {
  if (!result) return 0;

  const psA = Number(prediction.score_a);
  const psB = Number(prediction.score_b);
  const rsA = Number(result.score_a);
  const rsB = Number(result.score_b);

  if (Number.isNaN(psA) || Number.isNaN(psB) || Number.isNaN(rsA) || Number.isNaN(rsB)) return 0;

  if (psA === rsA && psB === rsB) return 5;
  if (outcome(psA, psB) === outcome(rsA, rsB)) return 2;

  return 0;
}

function knockoutPoints(prediction, match) {
  if (!match || match.status !== "complete") return 0;

  const psA = Number(prediction.score_a);
  const psB = Number(prediction.score_b);
  const rsA = Number(match.score_a);
  const rsB = Number(match.score_b);

  if (Number.isNaN(psA) || Number.isNaN(psB) || Number.isNaN(rsA) || Number.isNaN(rsB)) return 0;

  if (psA === rsA && psB === rsB) return 10;
  if (outcome(psA, psB) === outcome(rsA, rsB)) return 5;

  return 0;
}

exports.handler = async () => {
  try {
    const db = supabase();

    const [
      employeesRes,
      predictionsRes,
      resultsRes,
      knockoutMatchesRes,
      knockoutPredictionsRes
    ] = await Promise.all([
      db.from("employees").select("*"),
      db.from("predictions").select("*"),
      db.from("results").select("*"),
      db.from("v6_knockout_matches").select("*"),
      db.from("v6_knockout_predictions").select("*")
    ]);

    for (const res of [employeesRes, predictionsRes, resultsRes, knockoutMatchesRes, knockoutPredictionsRes]) {
      if (res.error) throw res.error;
    }

    const employees = employeesRes.data || [];
    const predictions = predictionsRes.data || [];
    const results = resultsRes.data || [];
    const knockoutMatches = knockoutMatchesRes.data || [];
    const knockoutPredictions = knockoutPredictionsRes.data || [];

    const resultByMatchId = new Map(results.map(r => [String(r.match_id), r]));
    const knockoutMatchById = new Map(knockoutMatches.map(m => [String(m.id), m]));

    const rowsByEmployeeId = new Map();

    for (const employee of employees) {
      rowsByEmployeeId.set(String(employee.id), {
        employee_id: employee.id,
        employee: employee.name,
        name: employee.name,
        salarie: employee.name,
        group_points: 0,
        knockout_points: 0,
        total: 0,
        exact_scores: 0,
        good_results: 0,
        scores_exacts: 0,
        bons_resultats: 0,
        details: []
      });
    }

    for (const prediction of predictions) {
      const employeeId = String(prediction.employee_id);
      const row = rowsByEmployeeId.get(employeeId);
      if (!row) continue;

      const result = resultByMatchId.get(String(prediction.match_id));
      if (!result) continue;

      const pts = groupPoints(prediction, result);
      row.group_points += pts;

      if (pts === 5) {
        row.exact_scores += 1;
        row.scores_exacts += 1;
      } else if (pts === 2) {
        row.good_results += 1;
        row.bons_resultats += 1;
      }
    }

    for (const prediction of knockoutPredictions) {
      const employeeId = String(prediction.employee_id);
      const row = rowsByEmployeeId.get(employeeId);
      if (!row) continue;

      const match = knockoutMatchById.get(String(prediction.match_id));
      if (!match) continue;

      const pts = knockoutPoints(prediction, match);
      row.knockout_points += pts;

      if (pts === 10) {
        row.exact_scores += 1;
        row.scores_exacts += 1;
      } else if (pts === 5) {
        row.good_results += 1;
        row.bons_resultats += 1;
      }
    }

    const ranking = Array.from(rowsByEmployeeId.values())
      .map(row => ({
        ...row,
        total: row.group_points + row.knockout_points
      }))
      .sort((a, b) => {
        if (b.total !== a.total) return b.total - a.total;
        if (b.exact_scores !== a.exact_scores) return b.exact_scores - a.exact_scores;
        if (b.good_results !== a.good_results) return b.good_results - a.good_results;
        return String(a.employee).localeCompare(String(b.employee), "fr");
      })
      .map((row, index) => ({
        rank: index + 1,
        rang: index + 1,
        ...row
      }));

    const completedGroupResults = results.length;
    const completedKnockoutResults = knockoutMatches.filter(m => m.status === "complete").length;
    const leader = ranking[0]?.employee || ranking[0]?.salarie || "-";

    const stats = {
      employees: employees.length,
      participants: employees.length,
      leader,
      matches: 72,
      group_matches: 72,
      results: completedGroupResults,
      completed_results: completedGroupResults + completedKnockoutResults,
      completed_group_results: completedGroupResults,
      completed_knockout_results: completedKnockoutResults,
      updated_at: new Date().toISOString()
    };

    return json(200, {
      ranking,
      classement: ranking,
      rows: ranking,
      stats,
      summary: stats
    });
  } catch (error) {
    return json(500, {
      error: error.message || "Erreur serveur classement V6.2.1"
    });
  }
};
