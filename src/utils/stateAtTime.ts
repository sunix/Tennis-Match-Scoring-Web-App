import type { MatchConfig, MatchEvent, MatchState } from "../types";
import { getInitialState } from "../engine/scoring";

/**
 * Returns the match state corresponding to the last event whose timestamp is
 * at or before `videoTime`. If no events have occurred yet (or no events exist
 * before `videoTime`), the initial state is returned.
 */
export function stateAtTime(
  events: MatchEvent[],
  snapshots: MatchState[],
  videoTime: number,
  config: MatchConfig
): MatchState {
  const initial = getInitialState(config);
  let lastIdx = -1;
  for (let i = 0; i < events.length; i++) {
    if (events[i].t_s <= videoTime) {
      lastIdx = i;
    }
  }
  if (lastIdx === -1) return initial;
  return snapshots[lastIdx] ?? initial;
}
