const { json, supabase } = require("./v6-utils");

function outcome(a, b) {
  if (Number(a) > Number(b)) return "A";
  if (Number(a) < Number(b)) return "B";
  return "D";
}

function groupPoints(pred, real) {
  // Reprise exacte de la logique V5 officielle :
  // 5 points score exact, 2 points bon résultat.
  if (!pred || !real || pred.score_a === null || pred.score_b === null) {
    return { points: 0, exact: false, good: false };
  }

  const predA = Number(pred.score_a);
  const predB = Number(pred.score_b);
  const realA = Number(real.score_a);
  const realB = Number(real.score_b);

  if ([predA, predB, realA, realB].some(Number.isNaN)) {
    return { points: 0, exact: false, good: false };
  }

  if (predA === realA && predB === realB) {
    return { points: 5, exact: true, good: true };
  }

  if (outcome(predA, predB) === outcome(realA, realB)) {
    return { points: 2, exact: false, good: true };
  }

  return { points: 0, exact: false, good: false };
}

function knockoutPoints(pred, match) {
  // Phases finales : score temps réglementaire uniquement.
  // Barème prévu : 10 points score exact, 5 points bon résultat.
  if (!pred || !match || match.status !== "complete" || pred.score_a === null || pred.score_b === null) {
    return { points: 0, exact: false, good: false };
  }

  const predA = Number(pred.score_a);
  const predB = Number(pred.score_b);
  const realA = Number(match.score_a);
  const realB = Number(match.score_b);

  if ([predA, predB, realA, realB].some(Number.isNaN)) {
    return { points: 0, exact: false, good: false };
  }

  if (predA === realA && predB === realB) {
    return { points: 10, exact: true, good: true };
  }

  if (outcome(predA, predB) === outcome(realA, realB)) {
    return { points: 5, exact: false, good: true };
  }

  return { points: 0, exact: false, good: false };
}

// Très important : Supabase/PostgREST limite les select à 1000 lignes.
// La table predictions contient environ 2808 lignes.
// Sans pagination, le classement est faux.
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

exports.handler = async () => {
  try {
    const db = supabase();

    const [
      employees,
      matches,
      predictions,
      results,
      knockoutMatches,
      knockoutPredictions
    ] = await Promise.all([
      selectAll(db, "employees", q => q.order("display_order", { ascending: true }).order("name", { ascending: true })),
      selectAll(db, "matches", q => q.order("position", { ascending: true })),
      selectAll(db, "predictions"),
      selectAll(db, "results"),
      selectAll(db, "v6_knockout_matches"),
      selectAll(db, "v6_knockout_predictions")
    ]);

    const resultsByMatch = new Map(results.map(r => [String(r.match_id), r]));
    const predictionsByEmployee = new Map();

    for (const prediction of predictions) {
      const employeeId = String(prediction.employee_id);
      const matchId = String(prediction.match_id);

      if (!predictionsByEmployee.has(employeeId)) {
        predictionsByEmployee.set(employeeId, new Map());
      }

      predictionsByEmployee.get(employeeId).set(matchId, prediction);
    }

    const knockoutMatchById = new Map(knockoutMatches.map(m => [String(m.id), m]));
    const knockoutPredictionsByEmployee = new Map();

    for (const prediction of knockoutPredictions) {
      const employeeId = String(prediction.employee_id);

      if (!knockoutPredictionsByEmployee.has(employeeId)) {
        knockoutPredictionsByEmployee.set(employeeId, []);
      }

      knockoutPredictionsByEmployee.get(employeeId).push(prediction);
    }

    const ranking = employees.map(employee => {
      const employeeId = String(employee.id);
      const byMatch = predictionsByEmployee.get(employeeId) || new Map();
      const koPredictions = knockoutPredictionsByEmployee.get(employeeId) || [];

      let groupTotal = 0;
      let knockoutTotal = 0;
      let exact = 0;
      let good = 0;

      for (const match of matches) {
        const real = resultsByMatch.get(String(match.id));
        if (!real) continue;

        const pred = byMatch.get(String(match.id));
        const calc = groupPoints(pred, real);

        groupTotal += calc.points;

        if (calc.exact) exact += 1;
        else if (calc.good) good += 1;
      }

      for (const pred of koPredictions) {
        const match = knockoutMatchById.get(String(pred.match_id));
        const calc = knockoutPoints(pred, match);

        knockoutTotal += calc.points;

        if (calc.exact) exact += 1;
        else if (calc.good) good += 1;
      }

      return {
        employee_id: employee.id,
        employee: employee.name,
        name: employee.name,
        salarie: employee.name,
        groupTotal,
        group_points: groupTotal,
        knockoutTotal,
        knockout_points: knockoutTotal,
        total: groupTotal + knockoutTotal,
        exact,
        good,
        exact_scores: exact,
        good_results: good,
        scores_exacts: exact,
        bons_resultats: good
      };
    })
      .sort((a, b) =>
        b.total - a.total ||
        b.exact - a.exact ||
        b.good - a.good ||
        String(a.employee).localeCompare(String(b.employee), "fr")
      )
      .map((row, index) => ({
        rank: index + 1,
        rang: index + 1,
        ...row
      }));

    const completedGroupResults = results.length;
    const completedKnockoutResults = knockoutMatches.filter(m => m.status === "complete").length;
    const leader = ranking[0]?.employee || "-";

    const meta = {
      employees: employees.length,
      participants: employees.length,
      matches: matches.length,
      group_results: completedGroupResults,
      knockout_results: completedKnockoutResults,
      results: completedGroupResults,
      completed_results: completedGroupResults + completedKnockoutResults,
      completed_group_results: completedGroupResults,
      completed_knockout_results: completedKnockoutResults,
      leader,
      updated_at: new Date().toISOString()
    };

    return json(200, {
      ranking,
      classement: ranking,
      rows: ranking,
      players: ranking,
      meta,
      stats: meta,
      summary: meta
    });
  } catch (error) {
    return json(500, {
      error: error.message || "Erreur serveur classement V6.4"
    });
  }
};
