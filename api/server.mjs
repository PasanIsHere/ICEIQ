import express from 'express';
import cors from 'cors';

const app = express();
app.use(cors());

// ── Team slug mapping ─────────────────────────────────────────────────────────
const TEAM_SLUGS = {
  ANA: 'anaheim-ducks',    BOS: 'boston-bruins',       BUF: 'buffalo-sabres',
  CAR: 'carolina-hurricanes', CBJ: 'columbus-blue-jackets', CGY: 'calgary-flames',
  CHI: 'chicago-blackhawks', COL: 'colorado-avalanche',   DAL: 'dallas-stars',
  DET: 'detroit-red-wings',  EDM: 'edmonton-oilers',      FLA: 'florida-panthers',
  LAK: 'los-angeles-kings',  MIN: 'minnesota-wild',        MTL: 'montreal-canadiens',
  NJD: 'new-jersey-devils',  NSH: 'nashville-predators',   NYI: 'new-york-islanders',
  NYR: 'new-york-rangers',   OTT: 'ottawa-senators',       PHI: 'philadelphia-flyers',
  PIT: 'pittsburgh-penguins', SEA: 'seattle-kraken',       SJS: 'san-jose-sharks',
  STL: 'st-louis-blues',     TBL: 'tampa-bay-lightning',   TOR: 'toronto-maple-leafs',
  UTA: 'utah-hockey-club',   VAN: 'vancouver-canucks',     VGK: 'vegas-golden-knights',
  WSH: 'washington-capitals', WPG: 'winnipeg-jets',
};

// ── Cache (persists across warm invocations within the same function instance) ─
const cache = new Map();
const CACHE_TTL = 60 * 60 * 1000;

function getCache(key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL) { cache.delete(key); return null; }
  return entry.data;
}
function setCache(key, data) { cache.set(key, { data, ts: Date.now() }); }

// ── DailyFaceoff scraper ──────────────────────────────────────────────────────
async function fetchDailyFaceoffTeam(abbrev) {
  const slug = TEAM_SLUGS[abbrev];
  if (!slug) return null;
  const res = await fetch(`https://www.dailyfaceoff.com/teams/${slug}/line-combinations/`, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    },
  });
  if (!res.ok) return null;
  const html = await res.text();
  const match = html.match(/<script id="__NEXT_DATA__" type="application\/json">(.+?)<\/script>/s);
  if (!match) return null;
  const nextData = JSON.parse(match[1]);
  return nextData?.props?.pageProps?.combinations ?? null;
}

function parseLines(combos, abbrev) {
  if (!combos?.players) return null;
  const evPlayers = combos.players.filter((p) => p.categoryIdentifier === 'ev');
  const lines = {};
  for (const p of evPlayers) {
    const group = p.groupIdentifier;
    if (!group) continue;
    if (!lines[group]) lines[group] = [];
    lines[group].push({
      name: p.name,
      position: p.positionIdentifier,
      jerseyNumber: p.jerseyNumber,
      injuryStatus: p.injuryStatus,
      gameTimeDecision: p.gameTimeDecision ?? false,
    });
  }
  const injured = new Set();
  const gtd = new Set();
  for (const p of combos.players) {
    if (p.injuryStatus) injured.add(p.name);
    if (p.gameTimeDecision) gtd.add(p.name);
  }
  return { team: abbrev, source: combos.sourceName, updatedAt: combos.updatedAt, lines, injured: [...injured], gtd: [...gtd] };
}

// ── Routes ────────────────────────────────────────────────────────────────────
app.get('/api/lines', async (req, res) => {
  const cached = getCache('all_lines');
  if (cached) return res.json({ data: cached, cached: true });
  const abbrevs = Object.keys(TEAM_SLUGS);
  const result = {};
  for (let i = 0; i < abbrevs.length; i += 8) {
    const batch = abbrevs.slice(i, i + 8);
    const settled = await Promise.allSettled(
      batch.map(async (abbrev) => {
        const combos = await fetchDailyFaceoffTeam(abbrev);
        return [abbrev, combos ? parseLines(combos, abbrev) : null];
      })
    );
    for (const r of settled) {
      if (r.status === 'fulfilled' && r.value) {
        const [abbrev, data] = r.value;
        if (data) result[abbrev] = data;
      }
    }
    if (i + 8 < abbrevs.length) await new Promise((r) => setTimeout(r, 300));
  }
  setCache('all_lines', result);
  res.json({ data: result, cached: false });
});

app.get('/api/lines/:team', async (req, res) => {
  const abbrev = req.params.team.toUpperCase();
  const cacheKey = `lines_${abbrev}`;
  const cached = getCache(cacheKey);
  if (cached) return res.json({ data: cached, cached: true });
  try {
    const combos = await fetchDailyFaceoffTeam(abbrev);
    const data = combos ? parseLines(combos, abbrev) : null;
    if (!data) return res.status(404).json({ error: 'Not found' });
    setCache(cacheKey, data);
    res.json({ data, cached: false });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/schedule', async (req, res) => {
  const date = req.query.date ?? getTodayET();
  const cacheKey = `schedule_${date}`;
  const cached = getCache(cacheKey);
  if (cached) return res.json({ data: cached, cached: true });
  try {
    const r = await fetch(`https://api-web.nhle.com/v1/schedule/${date}`);
    if (!r.ok) return res.status(r.status).json({ error: 'NHL API error' });
    const raw = await r.json();
    const todayBlock = raw.gameWeek?.find((w) => w.date === date);
    const games = (todayBlock?.games ?? []).map((g) => ({
      id: g.id,
      homeTeam: g.homeTeam.abbrev,
      awayTeam: g.awayTeam.abbrev,
      homeTeamLogo: g.homeTeam.logo,
      awayTeamLogo: g.awayTeam.logo,
      startTimeUTC: g.startTimeUTC,
      gameState: g.gameState,
      homeScore: g.homeTeam.score,
      awayScore: g.awayTeam.score,
    }));
    setCache(cacheKey, games);
    res.json({ data: games, cached: false });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/standings', async (req, res) => {
  const date = getTodayET();
  const cacheKey = `standings_${date}`;
  const cached = getCache(cacheKey);
  if (cached) return res.json({ data: cached, cached: true });
  try {
    const r = await fetch(`https://api-web.nhle.com/v1/standings/${date}`);
    if (!r.ok) return res.status(r.status).json({ error: 'NHL API error' });
    const raw = await r.json();
    const map = {};
    for (const t of raw.standings ?? []) {
      const abbrev = t.teamAbbrev?.default ?? t.teamAbbrev;
      map[abbrev] = {
        abbrev,
        gamesPlayed: t.gamesPlayed,
        goalAgainst: t.goalAgainst,
        gaPerGame: t.gamesPlayed > 0 ? Math.round((t.goalAgainst / t.gamesPlayed) * 100) / 100 : 3.0,
      };
    }
    setCache(cacheKey, map);
    res.json({ data: map, cached: false });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── NHL API proxy ─────────────────────────────────────────────────────────────
app.get('/nhl-api/*', async (req, res) => {
  const path = req.path.replace('/nhl-api', '');
  const qs = new URLSearchParams(req.query).toString();
  const url = `https://api-web.nhle.com${path}${qs ? '?' + qs : ''}`;
  try {
    const r = await fetch(url);
    const body = await r.text();
    res.status(r.status)
       .set('Content-Type', r.headers.get('content-type') ?? 'application/json')
       .send(body);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// ── Helpers ───────────────────────────────────────────────────────────────────
function getTodayET() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
}

export default app;
