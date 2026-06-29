const { json, supabase } = require("./v6-utils");

function outcome(a, b) {
  if (Number(a) > Number(b)) return "A";
  if (Number(a) < Number(b)) return "B";
  return "D";
}

function isCompleteStatus(status) {
  return ["complete", "finished", "completed"].includes(String(status || "").toLowerCase());
}

function groupPoints(pred, real) {
  if (!pred || !real || pred.score_a === null || pred.score_b === null) {
    return { points: 0, exact: false, good: false, label: "Non joué" };
  }

  const predA = Number(pred.score_a);
  const predB = Number(pred.score_b);
  const realA = Number(real.score_a);
  const realB = Number(real.score_b);

  if ([predA, predB, realA, realB].some(Number.isNaN)) {
    return { points: 0, exact: false, good: false, label: "Non joué" };
  }

  if (predA === realA && predB === realB) {
    return { points: 5, exact: true, good: true, label: "Score exact" };
  }

  if (outcome(predA, predB) === outcome(realA, realB)) {
    return { points: 2, exact: false, good: true, label: "Bon résultat" };
  }

  return { points: 0, exact: false, good: false, label: "Raté" };
}

function knockoutPoints(pred, match) {
  if (
    !pred ||
    !match ||
    !isCompleteStatus(match.status) ||
    pred.score_a === null ||
    pred.score_b === null ||
    match.score_a === null ||
    match.score_b === null
  ) {
    return { points: 0, exact: false, good: false, label: "Non joué" };
  }

  const predA = Number(pred.score_a);
  const predB = Number(pred.score_b);
  const realA = Number(match.score_a);
  const realB = Number(match.score_b);

  if ([predA, predB, realA, realB].some(Number.isNaN)) {
    return { points: 0, exact: false, good: false, label: "Non joué" };
  }

  if (predA === realA && predB === realB) {
    return { points: 10, exact: true, good: true, label: "Score exact" };
  }

  if (outcome(predA, predB) === outcome(realA, realB)) {
    return { points: 5, exact: false, good: true, label: "Bon résultat" };
  }

  return { points: 0, exact: false, good: false, label: "Raté" };
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

function dateValue(match) {
  return new Date(match.kickoff_at || match.updated_at || match.created_at || 0).getTime();
}

exports.handler = async (event) => {
  try {
    const db = supabase();
    const employeeId = event.queryStringParameters?.id;

    if (!employeeId) {
      return json(400, { error: "ID salarié manquant" });
    }

    const { data: employee, error: employeeError } = await db
      .from("employees")
      .select("*")
      .eq("id", employeeId)
      .single();

    if (employeeError || !employee) {
      return json(404, { error: "Salarié introuvable" });
    }

    const [
      matches,
      predictions,
      results,
      knockoutMatches,
      knockoutPredictions
    ] = await Promise.all([
      selectAll(db, "matches", q => q.order("position", { ascending: true })),
      selectAll(db, "predictions", q => q.eq("employee_id", employeeId)),
      selectAll(db, "results"),
      selectAll(db, "v7_knockout_matches", q => q.order("display_order", { ascending: true })),
      selectAll(db, "v7_knockout_predictions", q => q.eq("employee_id", employeeId))
    ]);

    const resultsByMatch = new Map(results.map(r => [String(r.match_id), r]));
    const predictionsByMatch = new Map(predictions.map(p => [String(p.match_id), p]));
    const knockoutMatchById = new Map(knockoutMatches.map(m => [String(m.id), m]));
    const knockoutPredictionByMatch = new Map(knockoutPredictions.map(p => [String(p.match_id), p]));

    let total = 0;
    let groupTotal = 0;
    let knockoutTotal = 0;
    let exact = 0;
    let good = 0;

    const groupRows = matches
      .filter(match => resultsByMatch.has(String(match.id)))
      .map(match => {
        const pred = predictionsByMatch.get(String(match.id));
        const real = resultsByMatch.get(String(match.id));
        const calc = groupPoints(pred, real);

        groupTotal += calc.points;
        total += calc.points;

        if (calc.exact) exact += 1;
        else if (calc.good) good += 1;

        return {
          id: match.id,
          phase: "Poules",
          group: match.group_name || match.group || "",
          position: match.position,
          team_a: match.team_a,
          team_b: match.team_b,
          prediction: pred ? `${pred.score_a} - ${pred.score_b}` : "-",
          result: real ? `${real.score_a} - ${real.score_b}` : "-",
          points: calc.points,
          label: calc.label,
          exact: calc.exact,
          good: calc.good,
          kickoff_at: match.kickoff_at || match.match_date || null,
          display_order: match.position || 0
        };
      })
      .sort((a, b) => Number(b.position || 0) - Number(a.position || 0));

    const knockoutRows = knockoutMatches
      .filter(match => isCompleteStatus(match.status))
      .map(match => {
        const pred = knockoutPredictionByMatch.get(String(match.id));
        const calc = knockoutPoints(pred, match);

        knockoutTotal += calc.points;
        total += calc.points;

        if (calc.exact) exact += 1;
        else if (calc.good) good += 1;

        return {
          id: match.id,
          phase: match.stage || match.phase || "Phase finale",
          team_a: match.team_a || "-",
          team_b: match.team_b || "-",
          prediction: pred ? `${pred.score_a} - ${pred.score_b}` : "-",
          result: `${match.score_a} - ${match.score_b}`,
          points: calc.points,
          label: calc.label,
          exact: calc.exact,
          good: calc.good,
          kickoff_at: match.kickoff_at || null,
          display_order: match.display_order || 0
        };
      })
      .sort((a, b) =>
        dateValue(b) - dateValue(a) ||
        Number(b.display_order || 0) - Number(a.display_order || 0)
      );

    return json(200, {
      employee: {
        id: employee.id,
        name: employee.name
      },
      summary: {
        total,
        group_points: groupTotal,
        knockout_points: knockoutTotal,
        exact_scores: exact,
        good_results: good
      },
      group_matches: groupRows,
      knockout_matches: knockoutRows,
      matches: [...knockoutRows, ...groupRows],
      updated_at: new Date().toISOString()
    });

  } catch (error) {
    return json(500, {
      error: error.message || "Erreur serveur détail salarié"
    });
  }
};
