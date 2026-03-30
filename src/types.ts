export interface ProcessedSkater {
  playerId: number;
  name: string;
  team: string;
  headshot: string;
  position: string;
  gamesPlayed: number;
  goals: number;
  assists: number;
  points: number;
  shots: number;
  avgToiMinutes: number;
  avgToiDisplay: string;
  goalsPerGame: number;
  goalsPer60: number;
  shotsPer60: number;
  shootingPct: number;
  scoringScore: number; // base 0-100 composite
  lineNumber: number;   // 1-4 from DailyFaceoff (or TOI fallback)
  isGtd: boolean;       // game-time decision per DailyFaceoff
  isInjured: boolean;   // injured per DailyFaceoff (kept in list so OCR can find them)
  noStats: boolean;     // found by OCR but has no season stats in DB
  // set when a game context is active:
  opponent?: string;
  isHome?: boolean;
  adjustedScore?: number;
  opponentGaPerGame?: number;
}

export interface TodayGame {
  id: number;
  homeTeam: string;
  awayTeam: string;
  homeTeamLogo: string;
  awayTeamLogo: string;
  startTimeUTC: string;
  gameState: string; // LIVE, OFF, FUT, PRE
  homeScore?: number;
  awayScore?: number;
}

export interface TeamStanding {
  abbrev: string;
  gamesPlayed: number;
  goalAgainst: number;
  gaPerGame: number; // derived
}
