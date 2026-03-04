import type { MatchConfig, MatchState } from "../types";
import { pointLabel } from "../engine/scoring";
import type { AppState } from "../store/reducer";

export interface ExportData {
  version: 1;
  video: { name: string; duration_s: number; fps_hint: number } | null;
  match: AppState["config"];
  events: Array<{ id: string; t_s: number; type: "point"; winner: "A" | "B" }>;
}

export function exportProject(state: AppState): void {
  const data: ExportData = {
    version: 1,
    video: state.videoInfo
      ? {
          name: state.videoInfo.name,
          duration_s: state.videoInfo.duration_s,
          fps_hint: state.videoInfo.fps_hint,
        }
      : null,
    match: state.config,
    events: state.events.map((e) => ({
      id: e.id,
      t_s: e.t_s,
      type: e.type,
      winner: e.winner,
    })),
  };

  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "tennis-match.json";
  a.click();
  URL.revokeObjectURL(url);
}

/** Format seconds as an SRT timestamp: HH:MM:SS,mmm */
export function formatSRTTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.round((seconds % 1) * 1000);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")},${String(ms).padStart(3, "0")}`;
}

/** Format a match state as a two-line score string suitable for subtitles. */
export function formatScoreText(state: MatchState, config: MatchConfig): string {
  let pA: string;
  let pB: string;

  if (state.tbA !== null && state.tbB !== null) {
    pA = String(state.tbA);
    pB = String(state.tbB);
  } else {
    pA = pointLabel(state.pointA, state.pointB);
    pB = pointLabel(state.pointB, state.pointA);
    if (pA === "Deuce") pB = "Deuce";
  }

  const srvA = state.server === "A" ? " \u25cf" : "";
  const srvB = state.server === "B" ? " \u25cf" : "";

  const line1 = `${config.playerA}${srvA}  ${state.setA}  ${state.gameA}  ${pA}`;
  const line2 = `${config.playerB}${srvB}  ${state.setB}  ${state.gameB}  ${pB}`;

  if (state.matchWinner) {
    const winner = state.matchWinner === "A" ? config.playerA : config.playerB;
    return `${line1}\n${line2}\nWinner: ${winner}`;
  }

  return `${line1}\n${line2}`;
}

/**
 * Export the match as an SRT subtitle file.
 * Each subtitle entry shows the score from the moment a point is logged until
 * the next point (or until the end of the video if it is the last point).
 * The generated .srt file can be imported directly into Kdenlive as a subtitle
 * track, giving an automatic score overlay channel.
 */
export function generateSRTContent(state: AppState): string | null {
  if (!state.config || state.events.length === 0) return null;

  const { config, events, snapshots, videoInfo } = state;
  const duration = videoInfo?.duration_s ?? 0;

  const entries: string[] = [];

  for (let i = 0; i < events.length; i++) {
    const snap = snapshots[i];
    if (!snap) continue;

    const startT = events[i].t_s;
    const nextT = i + 1 < events.length ? events[i + 1].t_s - 0.1 : null;
    const rawEnd = nextT !== null ? nextT : duration > 0 ? duration : startT + 5.0;
    const endT = Math.max(startT + 0.1, rawEnd);

    const text = formatScoreText(snap, config);
    entries.push(`${i + 1}\n${formatSRTTime(startT)} --> ${formatSRTTime(endT)}\n${text}`);
  }

  return entries.join("\n\n") + "\n";
}

export function exportSRT(state: AppState): void {
  const srt = generateSRTContent(state);
  if (!srt) return;

  const blob = new Blob([srt], { type: "text/srt" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "tennis-score.srt";
  a.click();
  URL.revokeObjectURL(url);
}

export function importProject(json: string): AppState {
  const data: ExportData = JSON.parse(json);

  if (data.version !== 1) throw new Error("Unsupported version");
  if (!data.match) throw new Error("Missing match config");

  return {
    config: data.match,
    videoInfo: data.video
      ? {
          name: data.video.name,
          duration_s: data.video.duration_s,
          fps_hint: data.video.fps_hint,
        }
      : null,
    events: (data.events || []).map((e) => ({
      id: e.id,
      t_s: e.t_s,
      type: e.type,
      winner: e.winner,
    })),
    snapshots: [],
  };
}
