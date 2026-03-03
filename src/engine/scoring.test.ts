import { describe, it, expect, beforeEach } from "vitest";
import { computeState } from "./scoring";
import type { MatchConfig, MatchEvent } from "../types";

const bestOf2Config: MatchConfig = {
  playerA: "Alice",
  playerB: "Bob",
  bestOf: 2,
  gamesPerSet: 6,
  tiebreakAt: 6,
  tiebreakPoints: 7,
  serverFirst: "A",
};

let eventId = 0;
function point(winner: "A" | "B"): MatchEvent {
  return { id: String(eventId++), t_s: eventId, type: "point", winner };
}

/** Generate events for one player winning a game (4 straight points). */
function winGame(winner: "A" | "B"): MatchEvent[] {
  return [point(winner), point(winner), point(winner), point(winner)];
}

/** Generate events for one player winning a set 6-0. */
function winSet6_0(winner: "A" | "B"): MatchEvent[] {
  const events: MatchEvent[] = [];
  for (let i = 0; i < 6; i++) events.push(...winGame(winner));
  return events;
}

/**
 * Generate events for a super tiebreak won by `winner`.
 * winner scores 10 straight points.
 */
function winSuperTiebreak(winner: "A" | "B"): MatchEvent[] {
  const events: MatchEvent[] = [];
  for (let i = 0; i < 10; i++) events.push(point(winner));
  return events;
}

describe("bestOf=2 super-tiebreak format", () => {
  beforeEach(() => {
    eventId = 0;
  });

  it("does NOT declare a match winner after player A wins the first set (1-0)", () => {
    const events = winSet6_0("A");
    const states = computeState(events, bestOf2Config);
    const last = states[states.length - 1];

    expect(last.setA).toBe(1);
    expect(last.setB).toBe(0);
    expect(last.matchWinner).toBeNull();
  });

  it("does NOT declare a match winner after player B wins the first set (0-1)", () => {
    const events = winSet6_0("B");
    const states = computeState(events, bestOf2Config);
    const last = states[states.length - 1];

    expect(last.setA).toBe(0);
    expect(last.setB).toBe(1);
    expect(last.matchWinner).toBeNull();
  });

  it("declares player A the winner when A wins both sets 2-0", () => {
    const events = [...winSet6_0("A"), ...winSet6_0("A")];
    const states = computeState(events, bestOf2Config);
    const last = states[states.length - 1];

    expect(last.setA).toBe(2);
    expect(last.setB).toBe(0);
    expect(last.matchWinner).toBe("A");
  });

  it("declares player B the winner when B wins both sets 0-2", () => {
    const events = [...winSet6_0("B"), ...winSet6_0("B")];
    const states = computeState(events, bestOf2Config);
    const last = states[states.length - 1];

    expect(last.setA).toBe(0);
    expect(last.setB).toBe(2);
    expect(last.matchWinner).toBe("B");
  });

  it("triggers a super tiebreak at 1-1 (no winner yet after each player wins a set)", () => {
    const events = [...winSet6_0("A"), ...winSet6_0("B")];
    const states = computeState(events, bestOf2Config);
    const last = states[states.length - 1];

    expect(last.setA).toBe(1);
    expect(last.setB).toBe(1);
    expect(last.matchWinner).toBeNull();
    // tbA/tbB are null until the first super tiebreak point is played
    expect(last.tbA).toBeNull();
    expect(last.tbB).toBeNull();
  });

  it("declares player A the winner after winning the super tiebreak at 1-1", () => {
    const events = [
      ...winSet6_0("A"),
      ...winSet6_0("B"),
      ...winSuperTiebreak("A"),
    ];
    const states = computeState(events, bestOf2Config);
    const last = states[states.length - 1];

    expect(last.setA).toBe(2);
    expect(last.setB).toBe(1);
    expect(last.matchWinner).toBe("A");
  });

  it("declares player B the winner after winning the super tiebreak at 1-1", () => {
    const events = [
      ...winSet6_0("A"),
      ...winSet6_0("B"),
      ...winSuperTiebreak("B"),
    ];
    const states = computeState(events, bestOf2Config);
    const last = states[states.length - 1];

    expect(last.setA).toBe(1);
    expect(last.setB).toBe(2);
    expect(last.matchWinner).toBe("B");
  });
});
