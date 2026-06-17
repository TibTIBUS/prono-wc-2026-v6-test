const { json, supabase } = require("./v6-utils");

function outcome(a, b) {
  if (Number(a) > Number(b)) return "A";
  if (Number(a) < Number(b)) return "B";
  return "D";
}

function groupPoints(pred, real) {
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

function dateDiffInDays(fromDate, toDate) {
  const from = new Date(`${fromDate}T00:00:00.000Z`);
  const to = new Date(`${toDate}T00:00:00.000Z`);
  return Math.round((to - from) / (1000 * 60 * 60 * 24));
}

async function computeLeaderSince(db, currentLeaderEmployeeId, currentLeaderName) {
  if (!currentLeaderEmployeeId) {
    return { employee: "-", days: 0, since_date: null, label: "Aucun historique" };
  }

  const rows = await selectAll(
    db,
    "v6_ranking_history",
    q => q.order("snapshot_date", { ascending: false }).order("rank", { ascending: true })
  );

  const leadersByDate = new Map();
  for (const row of rows) {
    const d = String(row.snapshot_date);
    if (!leadersByDate.has(d) && Number(row.rank) === 1) {
      leadersByDate.set(d, row);
    }
  }

  const leaders = Array.from(leadersByDate.values())
    .sort((a, b) => String(b.snapshot_date).localeCompare(String(a.snapshot_date)));

  if (!leaders.length) {
    return { employee: currentLeaderName || "-", days: 0, since_date: null, label: "En attente d'historique" };
  }

  let sinceDate = null;

  for (const leader of leaders) {
    if (String(leader.employee_id) === String(currentLeaderEmployeeId)) {
      sinceDate = leader.snapshot_date;
    } else {
      break;
    }
  }

  if (!sinceDate) {
    return { employee: currentLeaderName || "-", days: 1, since_date: null, label: "Nouveau leader" };
  }

  const today = new Date().toISOString().slice(0, 10);
  const days = Math.max(1, dateDiffInDays(sinceDate, today) + 1);

  return {
    employee: currentLeaderName || leaders[0].employee_name,
    days,
    since_date: sinceDate,
    label: days <= 1 ? "Nouveau leader" : `${days} jours`
  };
}

function computeMovers(ranking) {
  const bestUp = ranking
    .filter(r => Number(r.movement) > 0)
    .sort((a, b) => Number(b.movement) - Number(a.movement))[0] || null;

  const worstDown = ranking
    .filter(r => Number(r.movement) < 0)
    .sort((a, b) => Number(a.movement) - Number(b.movement))[0] || null;

  return {
    best_progression: bestUp ? {
      employee: bestUp.employee,
      movement: bestUp.movement,
      label: `+${bestUp.movement} place${bestUp.movement > 1 ? "s" : ""}`
    } : {
      employee: "-",
      movement: 0,
      label: "Aucun mouvement"
    },
    biggest_drop: worstDown ? {
      employee: worstDown.employee,
      movement: worstDown.movement,
      label: `${worstDown.movement} place${Math.abs(worstDown.movement) > 1 ? "s" : ""}`
    } : {
      employee: "-",
      movement: 0,
      label: "Aucun mouvement"
    }
  };
}

function computeCurrentStreak(employeeId, matches, resultsByMatch, predictionsByEmployee) {
  const byMatch = predictionsByEmployee.get(String(employeeId)) || new Map();
  const playedMatches = matches.filter(match => resultsByMatch.has(String(match.id)));

  let streak = 0;

  for (let i = playedMatches.length - 1; i >= 0; i--) {
    const match = playedMatches[i];
    const real = resultsByMatch.get(String(match.id));
    const pred = byMatch.get(String(match.id));
    const calc = groupPoints(pred, real);

    if (calc.points > 0) {
      streak += 1;
    } else {
      break;
    }
  }

  return streak;
}

function computeAlmostStats(employeeId, matches, resultsByMatch, predictionsByEmployee) {
  const byMatch = predictionsByEmployee.get(String(employeeId)) || new Map();
  const playedMatches = matches.filter(match => resultsByMatch.has(String(match.id)));

  let almost = 0;

  for (const match of playedMatches) {
    const real = resultsByMatch.get(String(match.id));
    const pred = byMatch.get(String(match.id));

    if (!pred || pred.score_a === null || pred.score_b === null) continue;

    const calc = groupPoints(pred, real);
    if (calc.points > 0) continue;

    const distance =
      Math.abs(Number(pred.score_a) - Number(real.score_a)) +
      Math.abs(Number(pred.score_b) - Number(real.score_b));

    if (distance === 1) {
      almost += 1;
    }
  }

  return almost;
}

function computeExtraFunStats(ranking, matches, resultsByMatch, predictionsByEmployee) {
  const exactKing = [...ranking]
    .sort((a, b) => Number(b.exact_scores || b.exact || 0) - Number(a.exact_scores || a.exact || 0) || b.total - a.total)[0] || null;

  const goodKing = [...ranking]
    .sort((a, b) => Number(b.good_results || b.good || 0) - Number(a.good_results || a.good || 0) || b.total - a.total)[0] || null;

  const streakRows = ranking.map(row => ({
    employee: row.employee,
    streak: computeCurrentStreak(row.employee_id, matches, resultsByMatch, predictionsByEmployee)
  })).sort((a, b) => b.streak - a.streak || a.employee.localeCompare(b.employee, "fr"));

  const almostRows = ranking.map(row => ({
    employee: row.employee,
    almost: computeAlmostStats(row.employee_id, matches, resultsByMatch, predictionsByEmployee)
  })).sort((a, b) => b.almost - a.almost || a.employee.localeCompare(b.employee, "fr"));

  const streakKing = streakRows[0] || null;
  const almostKing = almostRows[0] || null;

  return {
    exact_king: exactKing ? {
      employee: exactKing.employee,
      value: exactKing.exact_scores || exactKing.exact || 0,
      label: `${exactKing.exact_scores || exactKing.exact || 0} score${(exactKing.exact_scores || exactKing.exact || 0) > 1 ? "s" : ""} exact${(exactKing.exact_scores || exactKing.exact || 0) > 1 ? "s" : ""}`
    } : { employee: "-", value: 0, label: "Aucun score exact" },

    good_result_king: goodKing ? {
      employee: goodKing.employee,
      value: goodKing.good_results || goodKing.good || 0,
      label: `${goodKing.good_results || goodKing.good || 0} bon${(goodKing.good_results || goodKing.good || 0) > 1 ? "s" : ""} résultat${(goodKing.good_results || goodKing.good || 0) > 1 ? "s" : ""}`
    } : { employee: "-", value: 0, label: "Aucun bon résultat" },

    current_streak: streakKing && streakKing.streak > 0 ? {
      employee: streakKing.employee,
      value: streakKing.streak,
      label: `${streakKing.streak} match${streakKing.streak > 1 ? "s" : ""} avec points`
    } : { employee: "-", value: 0, label: "Aucune série en cours" },

    almost_king: almostKing && almostKing.almost > 0 ? {
      employee: almostKing.employee,
      value: almostKing.almost,
      label: `${almostKing.almost} presque réussi${almostKing.almost > 1 ? "s" : ""}`
    } : { employee: "-", value: 0, label: "Aucun presque" }
  };
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

    const completedKnockoutResults = knockoutMatches.filter(m => m.status === "complete").length;
    const leader = ranking[0]?.employee || "-";
    const leaderSince = await computeLeaderSince(db, ranking[0]?.employee_id, leader);
    const movers = computeMovers(ranking);
    const extraFun = computeExtraFunStats(ranking, matches, resultsByMatch, predictionsByEmployee);

    const fun_stats = {
      leader_since: {
        employee: leader,
        days: leaderSince.days,
        since_date: leaderSince.since_date,
        label: leaderSince.label
      },
      best_progression: movers.best_progression,
      biggest_drop: movers.biggest_drop,
      ...extraFun
    };

    const meta = {
      employees: employees.length,
      participants: employees.length,
      matches: matches.length,
      group_results: results.length,
      knockout_results: completedKnockoutResults,
      results: results.length,
      completed_results: results.length + completedKnockoutResults,
      completed_group_results: results.length,
      completed_knockout_results: completedKnockoutResults,
      leader,
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
      summary: meta,
      fun_stats
    });
  } catch (error) {
    return json(500, { error: error.message || "Erreur serveur classement V6.8" });
  }
};
