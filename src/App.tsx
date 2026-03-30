import { useEffect, useState } from 'react';
import { fetchSkaterStats, fetchTodayGames, fetchStandings, applyGameContext } from './api';
import type { ProcessedSkater, TodayGame, TeamStanding } from './types';
import PlayerTable from './components/PlayerTable';
import GameSelector from './components/GameSelector';
import ScreenshotImport from './components/ScreenshotImport';
import './App.css';

export default function App() {
  const [allPlayers, setAllPlayers] = useState<ProcessedSkater[]>([]);
  const [games, setGames] = useState<TodayGame[]>([]);
  const [standings, setStandings] = useState<Map<string, TeamStanding>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedGameId, setSelectedGameId] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const [minGames, setMinGames] = useState(10);
  const [screenshotNames, setScreenshotNames] = useState<string[] | null>(null);
  const [showAllLeague, setShowAllLeague] = useState(false);

  useEffect(() => {
    Promise.all([fetchSkaterStats(), fetchTodayGames(), fetchStandings()])
      .then(([players, g, s]) => {
        setAllPlayers(players);
        setGames(g);
        setStandings(s);
        setLoading(false);
      })
      .catch((err) => { setError(err.message); setLoading(false); });
  }, []);

  // Build the displayed player list
  const displayedPlayers = (() => {
    const inScreenshotMode = screenshotNames !== null && screenshotNames.length > 0;

    let pool: ProcessedSkater[];
    if (showAllLeague) {
      pool = allPlayers;
    } else if (games.length > 0) {
      pool = applyGameContext(allPlayers, games, standings, selectedGameId);
    } else {
      pool = allPlayers;
    }

    // In screenshot mode: bypass minGames and injury filters — show every matched player
    // In normal mode: filter out injured players and enforce minGames
    if (inScreenshotMode) {
      const nameSet = new Set(screenshotNames);
      const found = pool.filter((p) => nameSet.has(p.name));

      // Add stub rows for OCR-matched names not in the stats DB at all
      const foundNames = new Set(found.map((p) => p.name));
      const stubs: ProcessedSkater[] = screenshotNames
        .filter((n) => !foundNames.has(n))
        .map((n) => ({
          playerId: -Math.random(),
          name: n,
          team: '—',
          headshot: '',
          position: '—',
          gamesPlayed: 0,
          goals: 0,
          assists: 0,
          points: 0,
          shots: 0,
          avgToiMinutes: 0,
          avgToiDisplay: '—',
          goalsPerGame: 0,
          goalsPer60: 0,
          shotsPer60: 0,
          shootingPct: 0,
          scoringScore: 0,
          lineNumber: 4,
          isGtd: false,
          isInjured: false,
          noStats: true,
        }));

      return [...found, ...stubs];
    }

    // Normal mode: remove injured, apply minGames, apply search
    const q = search.toLowerCase();
    return pool.filter(
      (p) =>
        !p.isInjured &&
        p.gamesPlayed >= minGames &&
        (p.name.toLowerCase().includes(q) || p.team.toLowerCase().includes(q))
    );
  })();

  const gameMode = !showAllLeague && games.length > 0;
  const allNames = allPlayers.map((p) => p.name);

  return (
    <div className="app">
      <header className="header">
        <div className="header-inner">
          <div className="logo">
            <h1>NHL Scoring Predictor <span className="logo-sep">/</span> 2025–26</h1>
          </div>
          <div className="legend">
            <div className="legend-item"><span className="badge badge-blue">G/60</span> Efficiency (60%)</div>
            <div className="legend-item"><span className="badge badge-green">G/GP</span> Volume (40%)</div>
            <div className="legend-item"><span className="badge badge-orange">Opp</span> Defense mult.</div>
            <div className="legend-item"><span className="badge badge-purple">Line</span> Line mult.</div>
          </div>
        </div>
      </header>

      <main className="main">
        {loading && (
          <div className="state-box">
            <div className="spinner" />
            <p>Fetching NHL stats, today's schedule & standings…</p>
          </div>
        )}
        {error && (
          <div className="state-box error">
            <p>⚠️ Failed to load: {error}</p>
          </div>
        )}

        {!loading && !error && (
          <>
            {games.length > 0 && !showAllLeague && (
              <GameSelector
                games={games}
                selectedId={selectedGameId}
                onSelect={setSelectedGameId}
              />
            )}

            <ScreenshotImport
              allNames={allNames}
              onMatch={(names) => { setScreenshotNames(names); setSearch(''); }}
              onClear={() => setScreenshotNames(null)}
              active={screenshotNames !== null}
            />

            <div className="controls">
              <input
                className="search"
                type="text"
                placeholder="Search player or team…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <label className="filter-label">
                Min games:
                <input
                  type="number" min={1} max={82} value={minGames}
                  onChange={(e) => setMinGames(Number(e.target.value))}
                  className="games-input"
                />
              </label>
              <button
                className={`ctrl-btn ${showAllLeague ? 'active' : ''}`}
                onClick={() => { setShowAllLeague((v) => !v); setSelectedGameId(null); }}
              >
                {showAllLeague ? "Today's games" : 'All league'}
              </button>
              {screenshotNames && (
                <span className="screenshot-badge">{screenshotNames.length} from screenshot</span>
              )}
              <span className="count">{displayedPlayers.length} players</span>
            </div>

            {gameMode && !showAllLeague && (
              <div className="adj-formula">
                <strong>Adjusted Score</strong> = Base Score
                × <span className="f-opp">Opponent GA/G ÷ 3.0</span>
                × <span className="f-line">Line multiplier (L1 1.0 → L4 0.46)</span>
                × <span className="f-home">Home ice (+4%)</span>
              </div>
            )}

            {displayedPlayers.length > 0
              ? <PlayerTable players={displayedPlayers} gameMode={gameMode} />
              : <div className="state-box"><p>No players match the current filters.</p></div>
            }
          </>
        )}
      </main>
    </div>
  );
}
