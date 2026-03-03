import type { AppState } from "../store/reducer";

export interface SavedMatch {
  id: string;
  savedAt: number;
  config: AppState["config"];
  videoInfo: AppState["videoInfo"];
  events: AppState["events"];
}

const STORAGE_KEY = "tennis-saved-matches";

export function listSavedMatches(): SavedMatch[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
  } catch {
    return [];
  }
}

export function saveMatch(id: string, state: AppState): void {
  if (!state.config) return;
  const matches = listSavedMatches();
  const idx = matches.findIndex((m) => m.id === id);
  const entry: SavedMatch = {
    id,
    savedAt: Date.now(),
    config: state.config,
    videoInfo: state.videoInfo,
    events: state.events,
  };
  if (idx >= 0) {
    matches[idx] = entry;
  } else {
    matches.unshift(entry);
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(matches));
}

export function deleteMatch(id: string): void {
  const matches = listSavedMatches().filter((m) => m.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(matches));
}
