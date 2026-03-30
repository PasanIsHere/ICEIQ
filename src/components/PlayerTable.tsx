import type { ProcessedSkater } from '../types';

interface Props {
  players: ProcessedSkater[];
  gameMode: boolean;
}

function scoreKey(p: ProcessedSkater, gameMode: boolean): number {
  return gameMode && p.adjustedScore !== undefined ? p.adjustedScore : p.scoringScore;
}

function ScoreCell({ score, max }: { score: number; max: number }) {
  const pct = max > 0 ? Math.min(100, (score / max) * 100) : 0;
  return (
    <div className="score-cell">
      <span className="score-num">{score}</span>
      <div className="score-track">
        <div className="score-fill" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function GaCell({ ga }: { ga: number }) {
  const cls = ga >= 3.3 ? 'ga-weak' : ga >= 2.8 ? 'ga-mid' : 'ga-strong';
  return <span className={`ga-val ${cls}`}>{ga}</span>;
}

export default function PlayerTable({ players, gameMode }: Props) {
  const activePlayers = players.filter((p) => !p.noStats && !p.isInjured);
  const top3 = activePlayers.slice(0, 3);
  const maxScore = activePlayers.length > 0 ? scoreKey(activePlayers[0], gameMode) : 100;

  return (
    <>
      {/* ── Leaders strip ─────────────────────────────────────────────────── */}
      {top3.length > 0 && (
        <div className="leaders">
          {top3.map((p, i) => (
            <div key={p.playerId} className="leader-card">
              <span className="leader-rank">#{i + 1}</span>
              {p.headshot
                ? <img src={p.headshot} alt={p.name} className="leader-photo" />
                : <div className="leader-photo" />
              }
              <div className="leader-info">
                <div className="leader-name">
                  {p.name}
                  {p.isGtd && <span className="status-badge badge-gtd" style={{ marginLeft: 6 }}>GTD</span>}
                </div>
                <div className="leader-meta">
                  <span>{p.team}</span>
                  <span className="leader-dot">·</span>
                  <span>{p.position}</span>
                  <span className="leader-dot">·</span>
                  <span>L{p.lineNumber}</span>
                  {gameMode && p.opponent && (
                    <>
                      <span className="leader-dot">·</span>
                      <span>{p.isHome ? 'vs' : '@'} {p.opponent}</span>
                    </>
                  )}
                </div>
              </div>
              <div className="leader-stats">
                <div className="leader-stat">
                  <span className="leader-stat-val">{scoreKey(p, gameMode)}</span>
                  <span className="leader-stat-lbl">{gameMode ? 'Adj' : 'Score'}</span>
                </div>
                <div className="leader-stat">
                  <span className="leader-stat-val">{p.goalsPer60}</span>
                  <span className="leader-stat-lbl">G/60</span>
                </div>
                <div className="leader-stat">
                  <span className="leader-stat-val">{p.goals}</span>
                  <span className="leader-stat-lbl">Goals</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Data table ────────────────────────────────────────────────────── */}
      <div className="table-wrap">
        <table className="player-table">
          <thead>
            <tr>
              <th className="num">#</th>
              <th className="col-player">Player</th>
              <th>Team</th>
              <th>Line</th>
              <th className="num" title="Games played">GP</th>
              <th className="num">Goals</th>
              <th className="num">Avg TOI</th>
              <th className="num" title="Goals per 60 minutes of ice time">G/60</th>
              <th className="num" title="Goals per game">G/GP</th>
              <th className="num" title="Shooting percentage">S%</th>
              {gameMode && <th className="num" title="Opponent goals against per game">Opp GA/G</th>}
              <th className="col-score">{gameMode ? 'Adj Score' : 'Score'}</th>
            </tr>
          </thead>
          <tbody>
            {players.map((p) => {
              const isActive = !p.noStats && !p.isInjured;
              const activeRank = isActive
                ? activePlayers.findIndex((a) => a.playerId === p.playerId) + 1
                : null;

              return (
                <tr
                  key={p.playerId}
                  className={[
                    activeRank !== null && activeRank <= 3 ? 'row-top' : '',
                    p.isInjured ? 'row-injured' : '',
                    p.noStats   ? 'row-nostats' : '',
                  ].filter(Boolean).join(' ')}
                >
                  <td className="col-rank num">
                    {activeRank ?? '—'}
                  </td>

                  <td className="col-player">
                    <div className="player-cell">
                      {p.headshot
                        ? <img src={p.headshot} alt="" className="mini-shot" />
                        : <div className="mini-shot" />
                      }
                      <div className="player-cell-text">
                        <div className="player-cell-name">
                          {p.name}
                          {p.isGtd    && <span className="status-badge badge-gtd">GTD</span>}
                          {p.isInjured && <span className="status-badge badge-inj">Out</span>}
                          {p.noStats  && <span className="status-badge badge-nodata">No data</span>}
                        </div>
                        {gameMode && p.opponent && (
                          <div className="player-cell-sub">
                            {p.isHome ? 'vs' : '@'} {p.opponent}
                          </div>
                        )}
                      </div>
                    </div>
                  </td>

                  <td>{p.noStats ? '—' : p.team}</td>
                  <td>
                    {isActive
                      ? <span className="line-tag">L{p.lineNumber}</span>
                      : <span className="line-tag" style={{ color: 'var(--text-3)' }}>—</span>
                    }
                  </td>
                  <td className="num">{p.noStats ? '—' : p.gamesPlayed}</td>
                  <td className="num col-goals">{p.noStats ? '—' : p.goals}</td>
                  <td className="num">{p.noStats ? '—' : p.avgToiDisplay}</td>
                  <td className="num">{p.noStats ? '—' : p.goalsPer60}</td>
                  <td className="num">{p.noStats ? '—' : p.goalsPerGame}</td>
                  <td className="num">{p.noStats ? '—' : `${p.shootingPct}%`}</td>

                  {gameMode && (
                    <td className="num">
                      {p.opponentGaPerGame !== undefined ? <GaCell ga={p.opponentGaPerGame} /> : '—'}
                    </td>
                  )}

                  <td className="col-score">
                    {isActive
                      ? <ScoreCell score={scoreKey(p, gameMode)} max={maxScore} />
                      : <span className="score-na">—</span>
                    }
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
