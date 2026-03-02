import type { MatchConfig, MatchEvent, MatchState, VideoInfo } from "../types";
import { computeState, getInitialState } from "../engine/scoring";

export interface AppState {
  config: MatchConfig | null;
  videoInfo: VideoInfo | null;
  events: MatchEvent[];
  snapshots: MatchState[];
}

export type Action =
  | { type: "SET_CONFIG"; payload: MatchConfig }
  | { type: "SET_VIDEO_INFO"; payload: VideoInfo }
  | { type: "ADD_EVENT"; payload: MatchEvent }
  | { type: "DELETE_EVENT"; payload: string }
  | { type: "EDIT_EVENT_TIMESTAMP"; payload: { id: string; t_s: number } }
  | { type: "UNDO" }
  | { type: "IMPORT"; payload: AppState };

export const initialAppState: AppState = {
  config: null,
  videoInfo: null,
  events: [],
  snapshots: [],
};

function recompute(events: MatchEvent[], config: MatchConfig): MatchState[] {
  return computeState(events, config);
}

export function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case "SET_CONFIG": {
      const config = action.payload;
      const snapshots = recompute(state.events, config);
      return { ...state, config, snapshots };
    }
    case "SET_VIDEO_INFO": {
      return { ...state, videoInfo: action.payload };
    }
    case "ADD_EVENT": {
      if (!state.config) return state;
      // Check if match is already over
      if (state.snapshots.length > 0) {
        const last = state.snapshots[state.snapshots.length - 1];
        if (last.matchWinner) return state;
      } else {
        const init = getInitialState(state.config);
        if (init.matchWinner) return state;
      }
      const events = [...state.events, action.payload];
      const snapshots = recompute(events, state.config);
      return { ...state, events, snapshots };
    }
    case "DELETE_EVENT": {
      if (!state.config) return state;
      const events = state.events.filter((e) => e.id !== action.payload);
      const snapshots = recompute(events, state.config);
      return { ...state, events, snapshots };
    }
    case "EDIT_EVENT_TIMESTAMP": {
      if (!state.config) return state;
      const events = state.events.map((e) =>
        e.id === action.payload.id ? { ...e, t_s: action.payload.t_s } : e
      );
      const snapshots = recompute(events, state.config);
      return { ...state, events, snapshots };
    }
    case "UNDO": {
      if (!state.config || state.events.length === 0) return state;
      const events = state.events.slice(0, -1);
      const snapshots = recompute(events, state.config);
      return { ...state, events, snapshots };
    }
    case "IMPORT": {
      return action.payload;
    }
    default:
      return state;
  }
}
