import { describe, it, expect } from "vitest";
import { stateAtTime } from "./stateAtTime";
import { computeState, getInitialState } from "../engine/scoring";
import type { MatchConfig, MatchEvent } from "../types";

const config: MatchConfig = {
  playerA: "Alice",
  playerB: "Bob",
  bestOf: 3,
  gamesPerSet: 6,
  tiebreakAt: 6,
  tiebreakPoints: 7,
  serverFirst: "A",
};

function point(winner: "A" | "B", t_s: number): MatchEvent {
  return { id: String(t_s), t_s, type: "point", winner };
}

describe("stateAtTime", () => {
  it("returns initial state when videoTime is before all events", () => {
    const events = [point("A", 10), point("B", 20)];
    const snapshots = computeState(events, config);

    const result = stateAtTime(events, snapshots, 5, config);
    expect(result).toEqual(getInitialState(config));
  });

  it("returns state after first event when videoTime is between first and second event", () => {
    const events = [point("A", 10), point("B", 20)];
    const snapshots = computeState(events, config);

    const result = stateAtTime(events, snapshots, 15, config);
    expect(result).toEqual(snapshots[0]);
  });

  it("returns state after last event when videoTime is at or after all events", () => {
    const events = [point("A", 10), point("B", 20), point("A", 30)];
    const snapshots = computeState(events, config);

    const result = stateAtTime(events, snapshots, 30, config);
    expect(result).toEqual(snapshots[2]);

    const resultAfter = stateAtTime(events, snapshots, 999, config);
    expect(resultAfter).toEqual(snapshots[2]);
  });

  it("returns initial state when there are no events", () => {
    const result = stateAtTime([], [], 100, config);
    expect(result).toEqual(getInitialState(config));
  });

  it("includes events whose timestamp exactly matches videoTime", () => {
    const events = [point("A", 10), point("B", 20)];
    const snapshots = computeState(events, config);

    const result = stateAtTime(events, snapshots, 20, config);
    expect(result).toEqual(snapshots[1]);
  });

  it("reflects the correct score when going backward in time", () => {
    // Simulate: two points scored at t=10 and t=20; going back to t=12 should
    // show state after only the first point (pointA=1, not pointA=0 and pointB=1)
    const events = [point("A", 10), point("B", 20)];
    const snapshots = computeState(events, config);

    // At t=12, only the first event (t=10) has occurred
    const atT12 = stateAtTime(events, snapshots, 12, config);
    expect(atT12.pointA).toBe(1);
    expect(atT12.pointB).toBe(0);

    // At t=25, both events have occurred
    const atT25 = stateAtTime(events, snapshots, 25, config);
    expect(atT25.pointA).toBe(1);
    expect(atT25.pointB).toBe(1);
  });
});
