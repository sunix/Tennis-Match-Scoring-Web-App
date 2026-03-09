import { describe, it, expect } from "vitest";
import { buildScoreSegments, buildTitleContent } from "./kdenliveExport";
import type { MatchConfig, MatchEvent, MatchState } from "../types";
import { getInitialState, computeState } from "../engine/scoring";

const config: MatchConfig = {
  playerA: "Alice",
  playerB: "Bob",
  bestOf: 3,
  gamesPerSet: 6,
  tiebreakAt: 6,
  tiebreakPoints: 7,
  serverFirst: "A",
};

const FPS = 25;
const TOTAL_FRAMES = 1000;

function makeEvent(id: string, t_s: number, winner: "A" | "B"): MatchEvent {
  return { id, t_s, type: "point", winner };
}

// ── buildScoreSegments ────────────────────────────────────────────────────────

describe("buildScoreSegments", () => {
  it("returns a single segment covering the whole timeline when there are no events", () => {
    const segments = buildScoreSegments([], config, FPS, TOTAL_FRAMES);

    expect(segments).toHaveLength(1);
    expect(segments[0].startFrame).toBe(0);
    expect(segments[0].endFrame).toBe(TOTAL_FRAMES - 1);
    // State must be the initial state
    const initial = getInitialState(config);
    expect(segments[0].state).toEqual(initial);
  });

  it("creates segments before and after a single event", () => {
    const events = [makeEvent("e1", 10, "A")]; // 10s × 25fps = frame 250
    const segments = buildScoreSegments(events, config, FPS, TOTAL_FRAMES);

    // Should have two segments: [0..249] and [250..999]
    expect(segments.length).toBeGreaterThanOrEqual(2);

    const before = segments.find((s) => s.startFrame === 0);
    expect(before).toBeDefined();
    expect(before!.endFrame).toBe(249);
    expect(before!.state).toEqual(getInitialState(config));

    const after = segments.find((s) => s.startFrame === 250);
    expect(after).toBeDefined();
    expect(after!.endFrame).toBe(TOTAL_FRAMES - 1);
    // After one point won by A, pointA should be 1
    expect(after!.state.pointA).toBe(1);
    expect(after!.state.pointB).toBe(0);
  });

  it("creates a segment for each event gap when multiple events are present", () => {
    const events = [
      makeEvent("e1", 4, "A"), // frame 100
      makeEvent("e2", 8, "B"), // frame 200
      makeEvent("e3", 12, "A"), // frame 300
    ];
    const segments = buildScoreSegments(events, config, FPS, TOTAL_FRAMES);

    // Frames: 0-99 (initial), 100-199 (after e1), 200-299 (after e2), 300-999 (after e3)
    expect(segments.length).toBeGreaterThanOrEqual(4);

    const startsAt = (f: number) => segments.find((s) => s.startFrame === f);
    expect(startsAt(0)).toBeDefined();
    expect(startsAt(100)).toBeDefined();
    expect(startsAt(200)).toBeDefined();
    expect(startsAt(300)).toBeDefined();

    // State after e2 (B scored, then A scored): pointA=1, pointB=1
    const afterE2 = startsAt(200);
    const [, s2] = computeState(events.slice(0, 2), config);
    expect(afterE2!.state).toEqual(s2);
  });

  it("segments are contiguous – no gap between end of one and start of next", () => {
    const events = [
      makeEvent("e1", 2, "A"),
      makeEvent("e2", 6, "B"),
    ];
    const segments = buildScoreSegments(events, config, FPS, TOTAL_FRAMES);

    // Sort by start frame
    const sorted = [...segments].sort((a, b) => a.startFrame - b.startFrame);
    for (let i = 1; i < sorted.length; i++) {
      expect(sorted[i].startFrame).toBe(sorted[i - 1].endFrame + 1);
    }
  });

  it("covers the full timeline – first segment starts at 0, last ends at totalFrames-1", () => {
    const events = [makeEvent("e1", 5, "A")];
    const segments = buildScoreSegments(events, config, FPS, TOTAL_FRAMES);

    const sorted = [...segments].sort((a, b) => a.startFrame - b.startFrame);
    expect(sorted[0].startFrame).toBe(0);
    expect(sorted[sorted.length - 1].endFrame).toBe(TOTAL_FRAMES - 1);
  });

  it("handles totalFrames=1 with no events", () => {
    const segments = buildScoreSegments([], config, FPS, 1);
    expect(segments).toHaveLength(1);
    expect(segments[0].startFrame).toBe(0);
    expect(segments[0].endFrame).toBe(0);
  });
});

// ── buildTitleContent ─────────────────────────────────────────────────────────

describe("buildTitleContent", () => {
  const baseState: MatchState = {
    setA: 1,
    setB: 0,
    gameA: 3,
    gameB: 2,
    pointA: 2,
    pointB: 1,
    tbA: null,
    tbB: null,
    server: "A",
    matchWinner: null,
  };

  it("returns a string containing the kdenlivetitle root element", () => {
    const xml = buildTitleContent(baseState, config, 1920, 1080, 250);
    expect(xml).toContain("<kdenlivetitle");
    expect(xml).toContain("</kdenlivetitle>");
  });

  it("includes player names in the output", () => {
    const xml = buildTitleContent(baseState, config, 1920, 1080, 250);
    expect(xml).toContain("Alice");
    expect(xml).toContain("Bob");
  });

  it("includes set and game scores in the output", () => {
    const xml = buildTitleContent(baseState, config, 1920, 1080, 250);
    // Sets: 1-0
    expect(xml).toContain("1");
    expect(xml).toContain("0");
    // Games: 3-2
    expect(xml).toContain("3");
    expect(xml).toContain("2");
  });

  it("includes a point score label (e.g. '30') when not in tiebreak", () => {
    const xml = buildTitleContent(baseState, config, 1920, 1080, 250);
    // pointA=2 → "30"
    expect(xml).toContain("30");
  });

  it("includes tiebreak score when tbA/tbB are set", () => {
    const tbState: MatchState = {
      ...baseState,
      tbA: 5,
      tbB: 4,
    };
    const xml = buildTitleContent(tbState, config, 1920, 1080, 250);
    expect(xml).toContain("TB");
    expect(xml).toContain("5");
    expect(xml).toContain("4");
  });

  it("shows match winner label when matchWinner is set", () => {
    const wonState: MatchState = {
      ...baseState,
      matchWinner: "A",
    };
    const xml = buildTitleContent(wonState, config, 1920, 1080, 250);
    expect(xml).toContain("Winner");
    expect(xml).toContain("Alice");
  });

  it("marks the server with a bullet indicator", () => {
    const xml = buildTitleContent(baseState, config, 1920, 1080, 250);
    // server is "A" so Alice's line should have the bullet ●
    expect(xml).toContain("●");
  });

  it("renders the serve-indicator bullet in orange/yellow, not white", () => {
    const xml = buildTitleContent(baseState, config, 1920, 1080, 250);
    // The bullet item must have a non-white font-color (orange/amber)
    const bulletItemMatch = xml.match(/font-color="([^"]+)"[^>]*>●/);
    expect(bulletItemMatch).not.toBeNull();
    expect(bulletItemMatch![1]).not.toBe("#ffffffff");
  });

  it("places the point score on each player's row (not a third row)", () => {
    // baseState: pointA=2 → "30", pointB=1 → "15"
    const xml = buildTitleContent(baseState, config, 1920, 1080, 250);
    // Both point labels must appear somewhere in the output
    expect(xml).toContain("30");
    expect(xml).toContain("15");
    // The layout uses only 2 rows; we verify by counting QGraphicsTextItem blocks
    const itemCount = (xml.match(/type="QGraphicsTextItem"/g) ?? []).length;
    // 2 rows × (name + set + game + point) = 8 text items always,
    // plus 1 bullet for the serving player = 9 items when server is defined
    expect(itemCount).toBeLessThanOrEqual(9);
    expect(itemCount).toBeGreaterThanOrEqual(8); // at least 8 (no bullet for non-server)
  });

  it("does not render a separate third row for the point score", () => {
    // The old layout had a 3rd row "40 – 15"; the new layout puts each score on its row.
    const xml = buildTitleContent(baseState, config, 1920, 1080, 250);
    // "–" (en-dash separator) should no longer appear as it was only in the old point row
    expect(xml).not.toContain(" – ");
  });

  it("encodes special XML characters in player names", () => {
    const specialConfig: MatchConfig = {
      ...config,
      playerA: "A & B",
      playerB: "C > D",
    };
    const xml = buildTitleContent(baseState, specialConfig, 1920, 1080, 250);
    expect(xml).toContain("A &amp; B");
    expect(xml).toContain("C &gt; D");
    // Raw characters must NOT appear unescaped inside an attribute-free text node
    // (except within already-escaped content)
    // The raw & inside attribute values should be escaped
    expect(xml).not.toContain('content="A & B"');
  });

  it("sets the `out` attribute to durationFrames - 1", () => {
    const xml = buildTitleContent(baseState, config, 1920, 1080, 100);
    expect(xml).toContain('out="99"');
  });

  it("sets the correct width and height on the root element", () => {
    const xml = buildTitleContent(baseState, config, 1280, 720, 50);
    expect(xml).toContain('width="1280"');
    expect(xml).toContain('height="720"');
  });
});
