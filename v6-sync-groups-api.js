const { json, supabase, requireAdmin } = require("./v6-utils");

function normalize(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const TEAM_ALIASES = {
  "mexique": ["mexico"],
  "afrique du sud": ["south africa"],
  "coree du sud": ["south korea", "korea republic"],
  "tchequie": ["czechia", "czech republic"],
  "bosnie herz": ["bosnia and herzegovina", "bosnia herzegovina"],
  "bresil": ["brazil"],
  "haiti": ["haiti"],
  "ecosse": ["scotland"],
  "usa": ["united states", "usa"],
  "allemagne": ["germany"],
  "curacao": ["curacao", "curaçao"],
  "cote d ivoire": ["ivory coast", "cote d ivoire"],
  "equateur": ["ecuador"],
  "pays bas": ["netherlands"],
  "suede": ["sweden"],
  "egypte": ["egypt"],
  "nouvelle zelande": ["new zealand"],
  "espagne": ["spain"],
  "cap vert": ["cape verde", "cape verde islands"],
  "arabie saoudite": ["saudi arabia"],
  "senegal": ["senegal"],
  "irak": ["iraq"],
  "norvege": ["norway"],
  "argentine": ["argentina"],
  "algerie": ["algeria"],
  "autriche": ["austria"],
  "jordanie": ["jordan"],
  "congo": ["dr congo", "congo dr", "congo"],
  "ouzbekistan": ["uzbekistan"],
  "angleterre": ["england"],
  "croatie": ["croatia"]
};

function namesMatch(localName, apiName) {
  const local = normalize(localName);
  const api = normalize(apiName);
  if (local === api) return true;
  const aliases = TEAM_ALIASES[local] || [];
  return aliases.map(normalize).includes(api);
}

function findLocalMatch(localMatches, apiHome, apiAway) {
  return localMatches.find(match => {
    const sameOrder = namesMatch(match.team_a, apiHome) && namesMatch(match.team_b, apiAway);
    const reverseOrder = namesMatch(match.team_a, apiAway) && namesMatch(match.team_b, apiHome);
    return sameOrder || reverseOrder;
  });
}

function scoreForLocalOrder(match, apiHome, apiAway, homeGoals, awayGoals) {
  const sameOrder = namesMatch(match.team_a, apiHome) && namesMatch(match.team_b, apiAway);
  if (sameOrder) return { score_a: Number(homeGoals), score_b: Number(awayGoals) };
  return { score_a: Number(awayGoals), score_b: Number(homeGoals) };
}

function isFinished(status) {
  const s = String(status || "").toUpperCase();
  return ["FT", "AET", "PEN", "COMPLETED", "COMPLETE", "FINISHED", "MATCH FINISHED"].includes(s);
}

async function syncGroups() {
  const apiKey = process.env.API_FOOTBALL_KEY;
  const league = process.env.API_FOOTBALL_LEAGUE_ID || "1";
  const season = process.env.API_FOOTBALL_SEASON || "2026";
  const baseUrl = process.env.API_FOOTBALL_BASE_URL || "https://v3.football.api-sports.io";

  if (!apiKey) {
    throw new Error("API_FOOTBALL_KEY non configurée dans Netlify.");
  }

  const db = supabase();

  const { data: localMatches, error: localError } = await db
    .from("matches")
    .select("*")
    .order("position", { ascending: true });

  if (localError) throw localError;

  const url = `${baseUrl}/fixtures?league=${league}&season=${season}`;
  const res = await fetch(url, { headers: { "x-apisports-key": apiKey } });

  if (!res.ok) {
    throw new Error(`Erreur API-Football HTTP ${res.status}`);
  }

  const payload = await res.json();
  const fixtures = payload.response || [];

  const groupFixtures = fixtures.filter(item => {
    const round = String(item.league?.round || "").toLowerCase();
    return round.includes("group");
  });

  const rows = [];
  const unmatched = [];
  const skipped = [];

  for (const item of groupFixtures) {
    const status = item.fixture?.status?.short || item.fixture?.status?.long || "";
    const home = item.teams?.home?.name;
    const away = item.teams?.away?.name;
    const goals = item.goals || {};

    if (!home || !away) continue;

    if (!isFinished(status)) {
      skipped.push({ home, away, status });
      continue;
    }

    if (goals.home === null || goals.away === null || goals.home === undefined || goals.away === undefined) {
      skipped.push({ home, away, status, reason: "score missing" });
      continue;
    }

    const localMatch = findLocalMatch(localMatches || [], home, away);
    if (!localMatch) {
      unmatched.push({ home, away, status, goals });
      continue;
    }

    const score = scoreForLocalOrder(localMatch, home, away, goals.home, goals.away);
    rows.push({
      match_id: localMatch.id,
      score_a: score.score_a,
      score_b: score.score_b,
      played_at: item.fixture?.date || new Date().toISOString(),
      updated_at: new Date().toISOString()
    });
  }

  if (rows.length) {
    const { error: upsertError } = await db
      .from("results")
      .upsert(rows, { onConflict: "match_id" });

    if (upsertError) throw upsertError;
  }

  await db.from("v6_group_sync_logs").insert({
    status: "success",
    message: `Synchronisation poules OK : ${rows.length} résultats mis à jour, ${unmatched.length} non associés.`,
    payload: {
      updated: rows.length,
      unmatched,
      skipped_count: skipped.length
    }
  });

  return {
    ok: true,
    updated: rows.length,
    unmatched,
    skipped_count: skipped.length
  };
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return json(200, {});

  try {
    if (event.httpMethod === "POST") {
      requireAdmin(event);
    }

    const result = await syncGroups();
    return json(200, result);
  } catch (error) {
    try {
      await supabase().from("v6_group_sync_logs").insert({
        status: "error",
        message: error.message,
        payload: {}
      });
    } catch (e) {}

    return json(error.statusCode || 500, { error: error.message });
  }
};

exports.syncGroups = syncGroups;
