const { json, supabase, requireAdmin } = require("./v6-utils");

function normalizeText(value) {
  return String(value || "").toLowerCase();
}

function isKnockoutRound(round) {
  const r = normalizeText(round);

  return (
    (
      r.includes("round of 32") ||
      r.includes("round of 16") ||
      r.includes("1/16") ||
      r.includes("16th") ||
      r.includes("last 32") ||
      r.includes("last 16") ||
      r.includes("knockout") ||
      r.includes("play-off") ||
      r.includes("playoff") ||
      r.includes("quarter") ||
      r.includes("quart") ||
      r.includes("semi") ||
      r.includes("demi") ||
      r.includes("third") ||
      r.includes("bronze") ||
      r.includes("final")
    ) &&
    !r.includes("group")
  );
}

function stageFromRound(round) {
  const r = normalizeText(round);

  if (r.includes("round of 32") || r.includes("1/16") || r.includes("last 32")) return "16e de finale";
  if (r.includes("round of 16") || r.includes("last 16")) return "8e de finale";
  if (r.includes("quarter") || r.includes("quart")) return "Quart de finale";
  if (r.includes("semi") || r.includes("demi")) return "Demi-finale";
  if (r.includes("third") || r.includes("bronze")) return "Petite finale";
  if (r.includes("final")) return "Finale";

  return "Phase finale";
}

function codeFromStage(stage) {
  if (stage === "16e de finale") return "R32";
  if (stage === "8e de finale") return "R16";
  if (stage === "Quart de finale") return "QF";
  if (stage === "Demi-finale") return "SF";
  if (stage === "Petite finale") return "BF";
  if (stage === "Finale") return "F";
  return "KO";
}

function baseOrder(code) {
  if (code === "R32") return 1;
  if (code === "R16") return 20;
  if (code === "QF") return 40;
  if (code === "SF") return 60;
  if (code === "BF") return 70;
  if (code === "F") return 80;
  return 100;
}

function statusFromApi(item) {
  const short = String(item.fixture?.status?.short || "").toUpperCase();

  if (["FT", "AET", "PEN"].includes(short)) return "complete";
  if (["1H", "HT", "2H", "ET", "P", "BT", "LIVE"].includes(short)) return "live";

  return "scheduled";
}

function cleanTeamName(value) {
  const v = String(value || "").trim();
  return v || "À déterminer";
}

function teamsKnown(a, b) {
  return a && b && a !== "À déterminer" && b !== "À déterminer";
}

async function apiGet(path) {
  const apiKey = process.env.API_FOOTBALL_KEY;
  const baseUrl = process.env.API_FOOTBALL_BASE_URL || "https://v3.football.api-sports.io";

  if (!apiKey) throw new Error("API_FOOTBALL_KEY non configurée.");

  const res = await fetch(`${baseUrl}${path}`, {
    headers: { "x-apisports-key": apiKey }
  });

  if (!res.ok) {
    throw new Error(`Erreur API-Football HTTP ${res.status} sur ${path}`);
  }

  const payload = await res.json();

  if (payload.errors && Object.keys(payload.errors).length > 0) {
    throw new Error(`Erreur API-Football: ${JSON.stringify(payload.errors)}`);
  }

  return payload;
}

async function getFixtures(league, season) {
  const payload = await apiGet(`/fixtures?league=${league}&season=${season}`);
  return payload.response || [];
}

async function getCandidateCompetitions() {
  const configuredLeague = process.env.API_FOOTBALL_LEAGUE_ID || "1";
  const configuredSeason = process.env.API_FOOTBALL_SEASON || "2026";

  const candidates = new Map();

  function addCandidate(league, season, source, name = "") {
    if (!league || !season) return;

    const key = `${league}-${season}`;
    candidates.set(key, {
      league: String(league),
      season: String(season),
      source,
      name
    });
  }

  addCandidate(configuredLeague, configuredSeason, "netlify_config", "Configuration Netlify");

  try {
    const leaguesPayload = await apiGet(`/leagues?search=World%20Cup`);
    const leagues = leaguesPayload.response || [];

    for (const item of leagues) {
      const league = item.league || {};
      const seasons = item.seasons || [];

      const leagueName = normalizeText(league.name);
      const country = normalizeText(item.country?.name);

      const looksLikeWorldCup =
        leagueName.includes("world cup") ||
        leagueName.includes("fifa world cup") ||
        country.includes("world");

      if (!looksLikeWorldCup) continue;

      for (const s of seasons) {
        const year = s.year || s.season;

        if (String(year) === "2026") {
          addCandidate(league.id, year, "auto_search", league.name);
        }
      }
    }
  } catch (error) {
    // On garde au moins la config Netlify.
  }

  return Array.from(candidates.values());
}

async function chooseBestCompetition() {
  const candidates = await getCandidateCompetitions();
  const tested = [];

  for (const candidate of candidates) {
    try {
      const fixtures = await getFixtures(candidate.league, candidate.season);
      const knockout = fixtures.filter(item => isKnockoutRound(item.league?.round));

      tested.push({
        ...candidate,
        total_fixtures: fixtures.length,
        knockout_fixtures: knockout.length
      });

      // Important :
      // on ne choisit la compétition que si elle contient des matchs de phase finale.
      if (knockout.length > 0) {
        return {
          chosen: candidate,
          fixtures,
          tested
        };
      }
    } catch (error) {
      tested.push({
        ...candidate,
        error: error.message,
        total_fixtures: 0,
        knockout_fixtures: 0
      });
    }
  }

  const best = tested
    .filter(x => x.total_fixtures > 0)
    .sort((a, b) => b.total_fixtures - a.total_fixtures)[0];

  return {
    chosen: best || candidates[0] || null,
    fixtures: [],
    tested
  };
}

function buildRowsFromFixtures(fixtures) {
  const knockoutFixtures = fixtures
    .filter(item => isKnockoutRound(item.league?.round))
    .sort((a, b) => new Date(a.fixture?.date || 0) - new Date(b.fixture?.date || 0));

  const byStage = new Map();

  for (const item of knockoutFixtures) {
    const stage = stageFromRound(item.league?.round);

    if (!byStage.has(stage)) byStage.set(stage, []);
    byStage.get(stage).push(item);
  }

  const rows = [];

  for (const [stage, items] of byStage.entries()) {
    const code = codeFromStage(stage);

    items.forEach((item, index) => {
      const n = index + 1;
      const id = `${code}-${String(n).padStart(2, "0")}`;
      const status = statusFromApi(item);

      const teamA = cleanTeamName(item.teams?.home?.name);
      const teamB = cleanTeamName(item.teams?.away?.name);
      const goals = item.goals || {};

      rows.push({
        id,
        stage,
        match_number: n,
        display_order: baseOrder(code) + n,
        api_fixture_id: String(item.fixture?.id || ""),
        team_a: teamA,
        team_b: teamB,
        kickoff_at: item.fixture?.date || null,
        status,
        is_open: teamsKnown(teamA, teamB) && status === "scheduled",
        score_a: status === "complete" ? goals.home : null,
        score_b: status === "complete" ? goals.away : null,
        updated_at: new Date().toISOString()
      });
    });
  }

  return {
    knockoutFixtures,
    rows
  };
}

async function syncV7KnockoutFixtures() {
  const competition = await chooseBestCompetition();
  const fixtures = competition.fixtures || [];

  const built = buildRowsFromFixtures(fixtures);
  const rows = built.rows || [];

  const db = supabase();

  if (rows.length) {
    const { error } = await db
      .from("v7_knockout_matches")
      .upsert(rows, { onConflict: "id" });

    if (error) throw error;
  }

  return {
    ok: true,
    chosen_competition: competition.chosen,
    tested_competitions: competition.tested,
    total_fixtures: fixtures.length,
    knockout_found: built.knockoutFixtures.length,
    synced: rows.length,
    message: `${rows.length} match(s) V7 synchronisé(s).`
  };
}

exports.handler = async event => {
  if (event.httpMethod === "OPTIONS") return json(200, {});

  if (event.httpMethod !== "POST") {
    return json(405, { error: "Méthode non autorisée." });
  }

  try {
    requireAdmin(event);

    const result = await syncV7KnockoutFixtures();
    return json(200, result);
  } catch (error) {
    return json(error.statusCode || 500, { error: error.message });
  }
};

exports.syncV7KnockoutFixtures = syncV7KnockoutFixtures;
