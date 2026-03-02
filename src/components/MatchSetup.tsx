import React, { useState } from "react";
import type { MatchConfig } from "../types";

interface Props {
  onStart: (config: MatchConfig) => void;
}

export default function MatchSetup({ onStart }: Props) {
  const [playerA, setPlayerA] = useState("Player A");
  const [playerB, setPlayerB] = useState("Player B");
  const [bestOf, setBestOf] = useState<3 | 5 | 2>(3);
  const [gamesPerSet, setGamesPerSet] = useState(6);
  const [tiebreakAt, setTiebreakAt] = useState(6);
  const [tiebreakPoints, setTiebreakPoints] = useState(7);
  const [serverFirst, setServerFirst] = useState<"A" | "B">("A");
  const [fpsHint, setFpsHint] = useState(30);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onStart({
      playerA: playerA.trim() || "Player A",
      playerB: playerB.trim() || "Player B",
      bestOf,
      gamesPerSet,
      tiebreakAt,
      tiebreakPoints,
      serverFirst,
    });
  }

  return (
    <div className="setup-container">
      <div className="setup-card">
        <h1 className="setup-title">🎾 Tennis Match Scoring</h1>
        <form onSubmit={handleSubmit} className="setup-form">
          <div className="form-group">
            <label>Player A Name</label>
            <input
              type="text"
              value={playerA}
              onChange={(e) => setPlayerA(e.target.value)}
              placeholder="Player A"
            />
          </div>

          <div className="form-group">
            <label>Player B Name</label>
            <input
              type="text"
              value={playerB}
              onChange={(e) => setPlayerB(e.target.value)}
              placeholder="Player B"
            />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Format</label>
              <select
                value={bestOf}
                onChange={(e) => setBestOf(Number(e.target.value) as 3 | 5 | 2)}
              >
                <option value={3}>Best of 3</option>
                <option value={5}>Best of 5</option>
                <option value={2}>Best of 2 + Super Tiebreak</option>
              </select>
            </div>

            <div className="form-group">
              <label>Games per Set</label>
              <input
                type="number"
                value={gamesPerSet}
                min={1}
                max={12}
                onChange={(e) => setGamesPerSet(Number(e.target.value))}
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Tiebreak At</label>
              <input
                type="number"
                value={tiebreakAt}
                min={1}
                max={12}
                onChange={(e) => setTiebreakAt(Number(e.target.value))}
              />
            </div>

            <div className="form-group">
              <label>Tiebreak Points</label>
              <input
                type="number"
                value={tiebreakPoints}
                min={5}
                max={15}
                onChange={(e) => setTiebreakPoints(Number(e.target.value))}
              />
            </div>
          </div>

          <div className="form-group">
            <label>First Server</label>
            <div className="radio-group">
              <label className="radio-label">
                <input
                  type="radio"
                  name="server"
                  checked={serverFirst === "A"}
                  onChange={() => setServerFirst("A")}
                />
                {playerA || "Player A"}
              </label>
              <label className="radio-label">
                <input
                  type="radio"
                  name="server"
                  checked={serverFirst === "B"}
                  onChange={() => setServerFirst("B")}
                />
                {playerB || "Player B"}
              </label>
            </div>
          </div>

          <div className="form-group">
            <label>FPS Hint (for frame nudge)</label>
            <select
              value={fpsHint}
              onChange={(e) => setFpsHint(Number(e.target.value))}
            >
              <option value={24}>24 fps</option>
              <option value={30}>30 fps</option>
              <option value={50}>50 fps</option>
              <option value={60}>60 fps</option>
            </select>
          </div>

          <button type="submit" className="btn-start">
            Start Match
          </button>
        </form>
      </div>
    </div>
  );
}
