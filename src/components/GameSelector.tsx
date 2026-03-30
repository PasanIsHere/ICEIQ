import type { TodayGame } from '../types';

interface Props {
  games: TodayGame[];
  selectedId: number | null;
  onSelect: (id: number | null) => void;
}

function formatTime(utc: string): string {
  return new Date(utc).toLocaleTimeString('en-US', {
    hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
  });
}

function GameStatus({ g }: { g: TodayGame }) {
  if (g.gameState === 'LIVE') return <span className="game-tab-status gs-live">Live</span>;
  if (g.gameState === 'OFF')  return <span className="game-tab-status gs-final">Final</span>;
  if (g.gameState === 'PRE')  return <span className="game-tab-status gs-pre">Pre-game</span>;
  return <span className="game-tab-status gs-time">{formatTime(g.startTimeUTC)}</span>;
}

export default function GameSelector({ games, selectedId, onSelect }: Props) {
  if (games.length === 0) return null;

  return (
    <div className="game-selector-wrap">
      <div className="game-selector-label">Today — {games.length} games</div>
      <div className="game-selector">
        <button
          className={`game-tab ${selectedId === null ? 'selected' : ''}`}
          onClick={() => onSelect(null)}
        >
          All games
        </button>

        {games.map((g) => (
          <button
            key={g.id}
            className={`game-tab ${selectedId === g.id ? 'selected' : ''}`}
            onClick={() => onSelect(g.id)}
          >
            <div className="game-tab-logos">
              <img src={g.awayTeamLogo} alt={g.awayTeam} className="gc-logo" />
              <span className="gc-at">@</span>
              <img src={g.homeTeamLogo} alt={g.homeTeam} className="gc-logo" />
            </div>
            <span>
              {g.awayTeam} @ {g.homeTeam}
            </span>
            {(g.gameState === 'LIVE' || g.gameState === 'OFF') && g.homeScore !== undefined && (
              <span className="game-tab-score">{g.awayScore}–{g.homeScore}</span>
            )}
            <GameStatus g={g} />
          </button>
        ))}
      </div>
    </div>
  );
}
