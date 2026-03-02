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
