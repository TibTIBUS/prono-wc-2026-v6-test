const { json, supabase } = require("./v6-utils");

function outcome(a, b) {
  if (Number(a) > Number(b)) return "A";
  if (Number(a) < Number(b)) return "B";
  return "D";
}

function groupPoints(pred, real) {
  if (!pred || !real || pred.score_a === null || pred.score_b === null) return { points: 0, exact: false, good: false };

  const predA = Number(pred.score_a);
  const predB = Number(pred.score_b);
  const realA = Number(real.score_a);
  const realB = Number(real.score_b);

  if ([predA, predB, realA, realB].some(Number.isNaN)) return { points: 0, exact: false, good: false };

  if (predA === realA && predB === realB) return { points: 5, exact: true, good: true };
  if (outcome(predA, predB) === outcome(realA, realB)) return { points: 2, exact: false, good: true };

  return { points: 0, exact: false, good: false };
}

function knockoutPoints(pred, match) {
  if (!pred || !match || match.status !== "complete" || pred.score_a === null || pred.score_b === null) return { points: 0, exact: false, good: false };

  const predA = Number(pred.score_a);
  const predB = Number(pred.score_b);
  const realA = Number(match.score_a);
  const realB = Number(match.score_b);

  if ([predA, predB, realA, realB].some(Number.isNaN)) return { points: 0, exact: false, good: false };

  if (predA === realA && predB === realB) return { points: 10, exact: true, good: true };
  if (outcome(predA, predB) === outcome(realA, realB)) return { points: 5, exact: false, good: true };

  return { points: 0, exact: false, good: false };
}

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

async function getPreviousSnapshotByEmployee(db) {
  const today = new Date().toISOString().slice(0, 10);

  const { data: dates, error: dateError } = await db
    .from("v6_ranking_history")
    .select("snapshot_date")
    .lt("snapshot_date", today)
    .order("snapshot_date", { ascending: false })
    .limit(1);

  if (dateError) throw dateError;

  const previousDate = dates?.[0]?.snapshot_date;
  if (!previousDate) return { previousDate: null, map: new Map() };

  const rows = await selectAll(db, "v6_ranking_history", q => q.eq("snapshot_date", previousDate));

  return { previousDate, map: new Map(rows.map(r => [String(r.employee_id), r])) };
}

exports.handler = async () => {
  try {
    const db = supabase();
    const previousSnapshot = await getPreviousSnapshotByEmployee(db);

    const [employees, matches, predictions, results, knockoutMatches, knockoutPredictions] = await Promise.all([
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
      if (!predictionsByEmployee.has(employeeId)) predictionsByEmployee.set(employeeId, new Map());
      predictionsByEmployee.get(employeeId).set(matchId, prediction);
    }

    const knockoutMatchById = new Map(knockoutMatches.map(m => [String(m.id), m]));
    const knockoutPredictionsByEmployee = new Map();

    for (const prediction of knockoutPredictions) {
      const employeeId = String(prediction.employee_id);
      if (!knockoutPredictionsByEmployee.has(employeeId)) knockoutPredictionsByEmployee.set(employeeId, []);
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

        const calc = groupPoints(byMatch.get(String(match.id)), real);
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
      .map((row, index) => {
        const currentRank = index + 1;
        const previous = previousSnapshot.map.get(String(row.employee_id));
        const previousRank = previous ? Number(previous.rank) : null;
        const movement = previousRank ? previousRank - currentRank : 0;

        let movementLabel = "➖";
        let movementType = "same";

        if (movement > 0) {
          movementLabel = `⬆️ +${movement}`;
          movementType = "up";
        } else if (movement < 0) {
          movementLabel = `⬇️ ${movement}`;
          movementType = "down";
        }

        return {
          rank: currentRank,
          rang: currentRank,
          previous_rank: previousRank,
          previous_snapshot_date: previousSnapshot.previousDate,
          movement,
          evolution: movementLabel,
          evolution_type: movementType,
          ...row
        };
      });

    const meta = {
      employees: employees.length,
      participants: employees.length,
      matches: matches.length,
      group_results: results.length,
      knockout_results: knockoutMatches.filter(m => m.status === "complete").length,
      results: results.length,
      completed_results: results.length + knockoutMatches.filter(m => m.status === "complete").length,
      completed_group_results: results.length,
      completed_knockout_results: knockoutMatches.filter(m => m.status === "complete").length,
      leader: ranking[0]?.employee || "-",
      previous_snapshot_date: previousSnapshot.previousDate,
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
    return json(500, { error: error.message || "Erreur serveur classement V6.6 automatique" });
  }
};
