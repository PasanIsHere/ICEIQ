import type { ProcessedSkater, TodayGame, TeamStanding } from './types';

const SEASON = '20252026';
const GAME_TYPE = '2';

const NHL_TEAMS = [
  'ANA','BOS','BUF','CAR','CBJ','CGY','CHI','COL','DAL','DET',
  'EDM','FLA','LAK','MIN','MTL','NJD','NSH','NYI','NYR','OTT',
  'PHI','PIT','SEA','SJS','STL','TBL','TOR','UTA','VAN','VGK','WSH','WPG',
];

interface RawSkater {
  playerId: number;
  headshot: string;
  firstName: { default: string };
  lastName: { default: string };
  positionCode: string;
  gamesPlayed: number;
  goals: number;
  assists: number;
  points: number;
  shots: number;
  shootingPctg: number;
  avgTimeOnIcePerGame: number; // seconds
}

// DailyFaceoff line data shape from backend
interface TeamLineData {
  team: string;
  source: string;
  updatedAt: string;
  lines: Record<string, { name: string; position: string; jerseyNumber: number; injuryStatus: string | null; gameTimeDecision: boolean }[]>;
  injured: string[];
  gtd: string[];
}

function secondsToDisplay(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// Map DailyFaceoff group → line number
function groupToLine(group: string): number {
  if (group === 'f1' || group === 'd1') return 1;
  if (group === 'f2' || group === 'd2') return 2;
  if (group === 'f3' || group === 'd3') return 3;
  return 4;
}

// Fallback TOI-based line estimation when DailyFaceoff data unavailable
function assignLinesFromToi(
  skaters: (RawSkater & { team: string })[]
): Map<number, number> {
  const byTeam = new Map<string, (RawSkater & { team: string })[]>();
  for (const s of skaters) {
    if (!byTeam.has(s.team)) byTeam.set(s.team, []);
    byTeam.get(s.team)!.push(s);
  }
  const lineMap = new Map<number, number>();
  for (const roster of byTeam.values()) {
    const fwds = roster.filter((s) => ['C', 'L', 'R'].includes(s.positionCode))
      .sort((a, b) => b.avgTimeOnIcePerGame - a.avgTimeOnIcePerGame);
    const defs = roster.filter((s) => s.positionCode === 'D')
      .sort((a, b) => b.avgTimeOnIcePerGame - a.avgTimeOnIcePerGame);
    fwds.forEach((s, i) => lineMap.set(s.playerId, Math.min(4, Math.floor(i / 3) + 1)));
    defs.forEach((s, i) => lineMap.set(s.playerId, Math.min(3, Math.floor(i / 2) + 1)));
  }
  return lineMap;
}

export async function fetchSkaterStats(): Promise<ProcessedSkater[]> {
  // Fetch player stats + DailyFaceoff lines in parallel
  const [statsResults, linesResp] = await Promise.all([
    Promise.all(
      NHL_TEAMS.map(async (team) => {
        const res = await fetch(`/nhl-api/v1/club-stats/${team}/${SEASON}/${GAME_TYPE}`);
        if (!res.ok) return [];
        const data = await res.json();
        return (data.skaters as RawSkater[]).map((s) => ({ ...s, team }));
      })
    ),
    fetch('/api/lines').then((r) => r.json()).catch(() => ({ data: {} })),
  ]);

  const allSkaters = statsResults.flat().filter(
    (s) => s.positionCode !== 'G' && s.gamesPlayed > 0
  );

  const linesData: Record<string, TeamLineData> = linesResp.data ?? {};

  // Build lookup maps from DailyFaceoff data
  // name (lowercase) → { lineNumber, injuryStatus, gtd }
  const dfLineMap = new Map<string, { lineNumber: number; injuryStatus: string | null; gtd: boolean }>();
  const injuredNames = new Set<string>();

  for (const teamData of Object.values(linesData)) {
    for (const [group, players] of Object.entries(teamData.lines)) {
      const lineNum = groupToLine(group);
      for (const p of players) {
        const key = p.name.toLowerCase();
        dfLineMap.set(key, {
          lineNumber: lineNum,
          injuryStatus: p.injuryStatus,
          gtd: p.gameTimeDecision,
        });
      }
    }
    for (const name of teamData.injured) injuredNames.add(name.toLowerCase());
  }

  // TOI fallback line assignment
  const toiLineMap = assignLinesFromToi(allSkaters);

  const goalsPer60List = allSkaters.map((s) => {
    const totalSec = s.avgTimeOnIcePerGame * s.gamesPlayed;
    return totalSec > 0 ? (s.goals / totalSec) * 3600 : 0;
  });
  const goalsPerGameList = allSkaters.map((s) => s.goals / s.gamesPlayed);
  const maxG60 = Math.max(...goalsPer60List, 1);
  const maxGPG = Math.max(...goalsPerGameList, 1);

  const processed: ProcessedSkater[] = allSkaters
    .map((s, i) => {
      const fullName = `${s.firstName.default} ${s.lastName.default}`;
      const dfInfo = dfLineMap.get(fullName.toLowerCase());
      const isInjured = injuredNames.has(fullName.toLowerCase());

      const avgToiSec = s.avgTimeOnIcePerGame;
      const totalSec = avgToiSec * s.gamesPlayed;
      const goalsPer60 = totalSec > 0 ? (s.goals / totalSec) * 3600 : 0;
      const goalsPerGame = s.goals / s.gamesPlayed;
      const shotsPer60 = totalSec > 0 ? (s.shots / totalSec) * 3600 : 0;

      const g60Norm = goalsPer60List[i] / maxG60;
      const gpgNorm = goalsPerGameList[i] / maxGPG;
      const scoringScore = (g60Norm * 0.6 + gpgNorm * 0.4) * 100;

      const lineNumber = dfInfo?.lineNumber ?? toiLineMap.get(s.playerId) ?? 4;

      return {
        playerId: s.playerId,
        name: fullName,
        team: s.team,
        headshot: s.headshot,
        position: s.positionCode,
        gamesPlayed: s.gamesPlayed,
        goals: s.goals,
        assists: s.assists,
        points: s.points,
        shots: s.shots,
        avgToiMinutes: avgToiSec / 60,
        avgToiDisplay: secondsToDisplay(avgToiSec),
        goalsPerGame: Math.round(goalsPerGame * 100) / 100,
        goalsPer60: Math.round(goalsPer60 * 100) / 100,
        shotsPer60: Math.round(shotsPer60 * 100) / 100,
        shootingPct: Math.round(s.shootingPctg * 1000) / 10,
        scoringScore: Math.round(scoringScore * 10) / 10,
        lineNumber,
        isGtd: dfInfo?.gtd ?? false,
        isInjured,
        noStats: false,
      };
    })
    .filter((p): p is ProcessedSkater => p !== null)
    .sort((a, b) => b.scoringScore - a.scoringScore);

  return processed;
}

export async function fetchTodayGames(): Promise<TodayGame[]> {
  const res = await fetch('/api/schedule');
  if (!res.ok) return [];
  const data = await res.json();
  return data.data ?? [];
}

export async function fetchStandings(): Promise<Map<string, TeamStanding>> {
  const res = await fetch('/api/standings');
  if (!res.ok) return new Map();
  const raw: Record<string, TeamStanding> = (await res.json()).data ?? {};
  return new Map(Object.entries(raw));
}

// Line multipliers
const LINE_MULTIPLIER: Record<number, number> = { 1: 1.0, 2: 0.82, 3: 0.64, 4: 0.46 };
const HOME_BONUS = 1.04;
const LEAGUE_AVG_GA = 3.0;

export function applyGameContext(
  players: ProcessedSkater[],
  games: TodayGame[],
  standings: Map<string, TeamStanding>,
  selectedGameId: number | null
): ProcessedSkater[] {
  const teamContext = new Map<string, { opponent: string; isHome: boolean }>();
  for (const g of games) {
    if (selectedGameId !== null && g.id !== selectedGameId) continue;
    teamContext.set(g.homeTeam, { opponent: g.awayTeam, isHome: true });
    teamContext.set(g.awayTeam, { opponent: g.homeTeam, isHome: false });
  }

  return players
    .filter((p) => teamContext.has(p.team))
    .map((p) => {
      const ctx = teamContext.get(p.team)!;
      const oppGaPerGame = standings.get(ctx.opponent)?.gaPerGame ?? LEAGUE_AVG_GA;
      const oppMultiplier = oppGaPerGame / LEAGUE_AVG_GA;
      const lineMultiplier = LINE_MULTIPLIER[p.lineNumber] ?? 0.46;
      const homeMultiplier = ctx.isHome ? HOME_BONUS : 1.0;
      const adjustedScore = Math.min(
        100,
        Math.round(p.scoringScore * oppMultiplier * lineMultiplier * homeMultiplier * 10) / 10
      );
      return { ...p, opponent: ctx.opponent, isHome: ctx.isHome, adjustedScore, opponentGaPerGame: Math.round(oppGaPerGame * 100) / 100 };
    })
    .sort((a, b) => (b.adjustedScore ?? 0) - (a.adjustedScore ?? 0));
}
