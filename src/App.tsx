import { useReducer } from "react";
import { reducer, initialAppState } from "./store/reducer";
import type { MatchConfig, VideoInfo } from "./types";
import MatchSetup from "./components/MatchSetup";
import VideoPlayer from "./components/VideoPlayer";
import ScoringPanel from "./components/ScoringPanel";
import EventList from "./components/EventList";
import Scoreboard from "./components/Scoreboard";
import { getInitialState } from "./engine/scoring";
import { exportProject, importProject } from "./utils/exportImport";
import "./App.css";

export default function App() {
  const [state, dispatch] = useReducer(reducer, initialAppState);

  function handleStart(config: MatchConfig) {
    dispatch({ type: "SET_CONFIG", payload: config });
  }

  function handleVideoInfo(info: VideoInfo) {
    dispatch({ type: "SET_VIDEO_INFO", payload: info });
  }

  function handlePoint(winner: "A" | "B") {
    const t_s = Date.now() / 1000;
    dispatch({
      type: "ADD_EVENT",
      payload: {
        id: crypto.randomUUID(),
        t_s,
        type: "point",
        winner,
      },
    });
  }

  function handleUndo() {
    dispatch({ type: "UNDO" });
  }

  function handleDelete(id: string) {
    dispatch({ type: "DELETE_EVENT", payload: id });
  }

  function handleEditTimestamp(id: string, t_s: number) {
    dispatch({ type: "EDIT_EVENT_TIMESTAMP", payload: { id, t_s } });
  }

  function handleExport() {
    exportProject(state);
  }

  function handleImport() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json,application/json";
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const imported = importProject(reader.result as string);
          // First import raw state, then recompute by setting config
          dispatch({ type: "IMPORT", payload: imported });
          if (imported.config) {
            dispatch({ type: "SET_CONFIG", payload: imported.config });
          }
        } catch (e) {
          alert("Failed to import: " + (e instanceof Error ? e.message : String(e)));
        }
      };
      reader.readAsText(file);
    };
    input.click();
  }

  if (!state.config) {
    return <MatchSetup onStart={handleStart} />;
  }

  const currentState =
    state.snapshots.length > 0
      ? state.snapshots[state.snapshots.length - 1]
      : getInitialState(state.config);

  const matchOver = !!currentState.matchWinner;
  const fpsHint = state.videoInfo?.fps_hint ?? 30;

  return (
    <div className="app-layout">
      <header className="app-header">
        <h1 className="app-title">🎾 Tennis Match Scoring</h1>
        <div className="header-actions">
          <button className="btn-secondary" onClick={handleExport}>
            ⬇ Export
          </button>
          <button className="btn-secondary" onClick={handleImport}>
            ⬆ Import
          </button>
          <button
            className="btn-secondary btn-new"
            onClick={() => dispatch({ type: "IMPORT", payload: initialAppState })}
          >
            New Match
          </button>
        </div>
      </header>

      <main className="app-main">
        <section className="left-panel">
          <VideoPlayer onVideoInfo={handleVideoInfo} fpsHint={fpsHint} />
          <Scoreboard config={state.config} state={currentState} />
          <ScoringPanel
            playerA={state.config.playerA}
            playerB={state.config.playerB}
            onPoint={handlePoint}
            onUndo={handleUndo}
            disabled={matchOver}
          />
        </section>

        <section className="right-panel">
          <EventList
            events={state.events}
            snapshots={state.snapshots}
            config={state.config}
            onDelete={handleDelete}
            onEditTimestamp={handleEditTimestamp}
          />
        </section>
      </main>
    </div>
  );
}
