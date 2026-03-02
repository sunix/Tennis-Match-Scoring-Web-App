import type { MatchConfig, MatchState } from "../types";
import { pointLabel } from "../engine/scoring";

interface Props {
  config: MatchConfig;
  state: MatchState;
}

export default function Scoreboard({ config, state }: Props) {
  const serverIndicator = "●";

  function renderPoints(snap: MatchState): { a: string; b: string } {
    if (snap.tbA !== null && snap.tbB !== null) {
      return { a: String(snap.tbA), b: String(snap.tbB) };
    }
    const pA = pointLabel(snap.pointA, snap.pointB);
    const pB = pointLabel(snap.pointB, snap.pointA);
    // If deuce, show for both
    if (pA === "Deuce") return { a: "Deuce", b: "Deuce" };
    return { a: pA, b: pB };
  }

  const pts = renderPoints(state);
  const inTb = state.tbA !== null;

  return (
    <div className="scoreboard">
      {state.matchWinner && (
        <div className="match-winner-banner">
          🏆 {state.matchWinner === "A" ? config.playerA : config.playerB} wins the match!
        </div>
      )}
      <table className="scoreboard-table">
        <thead>
          <tr>
            <th className="sb-name">Player</th>
            <th className="sb-sets">Sets</th>
            <th className="sb-games">Games</th>
            <th className="sb-points">{inTb ? "TB" : "Points"}</th>
          </tr>
        </thead>
        <tbody>
          <tr className={state.server === "A" ? "serving-row" : ""}>
            <td className="sb-name">
              {state.server === "A" && (
                <span className="server-dot" title="Serving">
                  {serverIndicator}
                </span>
              )}
              {config.playerA}
            </td>
            <td className="sb-sets sb-val">{state.setA}</td>
            <td className="sb-games sb-val">{state.gameA}</td>
            <td className="sb-points sb-val">{pts.a}</td>
          </tr>
          <tr className={state.server === "B" ? "serving-row" : ""}>
            <td className="sb-name">
              {state.server === "B" && (
                <span className="server-dot" title="Serving">
                  {serverIndicator}
                </span>
              )}
              {config.playerB}
            </td>
            <td className="sb-sets sb-val">{state.setB}</td>
            <td className="sb-games sb-val">{state.gameB}</td>
            <td className="sb-points sb-val">{pts.b}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
