import { describe, it, expect } from "vitest";
import { formatSRTTime, formatScoreText, generateSRTContent, exportSRT } from "./exportImport";
import { computeState } from "../engine/scoring";
import type { MatchConfig, MatchEvent } from "../types";
import type { AppState } from "../store/reducer";

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

describe("formatSRTTime", () => {
  it("formats zero seconds", () => {
    expect(formatSRTTime(0)).toBe("00:00:00,000");
  });

  it("formats seconds with milliseconds", () => {
    expect(formatSRTTime(5.5)).toBe("00:00:05,500");
  });

  it("formats minutes and seconds", () => {
    expect(formatSRTTime(90.25)).toBe("00:01:30,250");
  });

  it("formats hours, minutes, and seconds", () => {
    expect(formatSRTTime(3723)).toBe("01:02:03,000");
  });
});

describe("formatScoreText", () => {
  it("shows 0-0 initial score for player A serving", () => {
    const state = {
      setA: 0, setB: 0,
      gameA: 0, gameB: 0,
      pointA: 0, pointB: 0,
      tbA: null, tbB: null,
      server: "A" as const,
      matchWinner: null,
    };
    const text = formatScoreText(state, config);
    expect(text).toContain("Alice");
    expect(text).toContain("Bob");
    expect(text).toContain("●"); // server dot on Alice's line
    const lines = text.split("\n");
    expect(lines[0]).toContain("●"); // Alice is serving
    expect(lines[1]).not.toContain("●"); // Bob is not serving
  });

  it("shows tiebreak points when in tiebreak", () => {
    const state = {
      setA: 0, setB: 0,
      gameA: 0, gameB: 0,
      pointA: 0, pointB: 0,
      tbA: 5, tbB: 3,
      server: "B" as const,
      matchWinner: null,
    };
    const text = formatScoreText(state, config);
    expect(text).toContain("5");
    expect(text).toContain("3");
  });

  it("shows winner line when match is over", () => {
    const state = {
      setA: 2, setB: 0,
      gameA: 0, gameB: 0,
      pointA: 0, pointB: 0,
      tbA: null, tbB: null,
      server: "A" as const,
      matchWinner: "A" as const,
    };
    const text = formatScoreText(state, config);
    expect(text).toContain("Winner: Alice");
  });
});

describe("generateSRTContent", () => {
  it("returns null when there are no events", () => {
    const state: AppState = { config, videoInfo: null, events: [], snapshots: [] };
    expect(generateSRTContent(state)).toBeNull();
  });

  it("returns null when config is null", () => {
    const state: AppState = { config: null, videoInfo: null, events: [point("A", 5)], snapshots: [] };
    expect(generateSRTContent(state)).toBeNull();
  });

  it("generates one SRT entry per event", () => {
    const events = [point("A", 5), point("B", 10)];
    const snapshots = computeState(events, config);
    const state: AppState = {
      config,
      videoInfo: { name: "match.mp4", duration_s: 60, fps_hint: 30 },
      events,
      snapshots,
    };

    const srt = generateSRTContent(state);
    expect(srt).not.toBeNull();

    // Two entries separated by a blank line
    const entries = srt!.trim().split("\n\n");
    expect(entries).toHaveLength(2);
  });

  it("first entry starts at the first event timestamp", () => {
    const events = [point("A", 5), point("B", 10)];
    const snapshots = computeState(events, config);
    const state: AppState = {
      config,
      videoInfo: { name: "match.mp4", duration_s: 60, fps_hint: 30 },
      events,
      snapshots,
    };

    const srt = generateSRTContent(state)!;
    expect(srt).toContain("00:00:05,000 -->");
  });

  it("last entry ends at video duration when provided", () => {
    const events = [point("A", 5)];
    const snapshots = computeState(events, config);
    const state: AppState = {
      config,
      videoInfo: { name: "match.mp4", duration_s: 60, fps_hint: 30 },
      events,
      snapshots,
    };

    const srt = generateSRTContent(state)!;
    expect(srt).toContain("--> 00:01:00,000");
  });

  it("last entry ends 5 s after the event when no video duration", () => {
    const events = [point("A", 5)];
    const snapshots = computeState(events, config);
    const state: AppState = { config, videoInfo: null, events, snapshots };

    const srt = generateSRTContent(state)!;
    expect(srt).toContain("--> 00:00:10,000");
  });

  it("entries contain player names", () => {
    const events = [point("A", 5)];
    const snapshots = computeState(events, config);
    const state: AppState = { config, videoInfo: null, events, snapshots };

    const srt = generateSRTContent(state)!;
    expect(srt).toContain("Alice");
    expect(srt).toContain("Bob");
  });
});

describe("exportSRT", () => {
  it("does nothing when there are no events", () => {
    const state: AppState = { config, videoInfo: null, events: [], snapshots: [] };
    expect(() => exportSRT(state)).not.toThrow();
  });
});
