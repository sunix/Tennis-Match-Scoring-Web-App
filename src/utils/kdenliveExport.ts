import type { AppState } from "../store/reducer";
import type { MatchConfig, MatchEvent, MatchState } from "../types";
import { computeState, getInitialState, pointLabel } from "../engine/scoring";

export interface ScoreSegment {
  startFrame: number;
  endFrame: number;
  state: MatchState;
}

/**
 * Build an ordered list of timed score segments from a list of events.
 * Each segment covers [startFrame, endFrame] (inclusive) and carries
 * the match state that should be displayed during that interval.
 *
 * @param events   Sorted match events (ascending by t_s).
 * @param config   Match configuration.
 * @param fps      Frames per second (from the kdenlive profile).
 * @param totalFrames  Total number of frames in the timeline.
 */
export function buildScoreSegments(
  events: MatchEvent[],
  config: MatchConfig,
  fps: number,
  totalFrames: number
): ScoreSegment[] {
  const initial = getInitialState(config);
  const sorted = [...events].sort((a, b) => a.t_s - b.t_s);
  const states = computeState(sorted, config);

  if (sorted.length === 0) {
    return [{ startFrame: 0, endFrame: Math.max(totalFrames - 1, 0), state: initial }];
  }

  const segments: ScoreSegment[] = [];
  let prevFrame = 0;

  for (let i = 0; i < sorted.length; i++) {
    const eventFrame = Math.round(sorted[i].t_s * fps);
    const nextFrame =
      i < sorted.length - 1
        ? Math.round(sorted[i + 1].t_s * fps) - 1
        : Math.max(totalFrames - 1, eventFrame);

    // Segment before this event (uses previous state / initial state)
    const prevState = i === 0 ? initial : states[i - 1];
    if (eventFrame > prevFrame) {
      segments.push({
        startFrame: prevFrame,
        endFrame: eventFrame - 1,
        state: prevState,
      });
    }

    // Segment starting at this event
    segments.push({
      startFrame: eventFrame,
      endFrame: nextFrame,
      state: states[i],
    });

    prevFrame = nextFrame + 1;
  }

  // Fill any remaining frames after the last event
  const last = sorted.length - 1;
  const lastEventFrame = Math.round(sorted[last].t_s * fps);
  if (prevFrame <= totalFrames - 1 && prevFrame > lastEventFrame) {
    segments.push({
      startFrame: prevFrame,
      endFrame: totalFrames - 1,
      state: states[last],
    });
  }

  return segments;
}

/**
 * Format a score line for one player row.
 */
function playerScoreLine(
  name: string,
  sets: number,
  games: number,
  isServer: boolean
): string {
  const indicator = isServer ? " ●" : "";
  return `${name}${indicator}   ${sets}   ${games}`;
}

/**
 * Build the kdenlivetitle XML string for the given match state.
 * This XML is stored (escaped) as the `resource` property of
 * a kdenlivetitle MLT producer.
 *
 * @param state   Current match state.
 * @param config  Match configuration.
 * @param width   Video width in pixels.
 * @param height  Video height in pixels.
 * @param durationFrames  Duration of this clip in frames.
 */
export function buildTitleContent(
  state: MatchState,
  config: MatchConfig,
  width: number,
  height: number,
  durationFrames: number
): string {
  // --- Score lines ---
  const lineA = playerScoreLine(
    config.playerA,
    state.setA,
    state.gameA,
    state.server === "A"
  );
  const lineB = playerScoreLine(
    config.playerB,
    state.setB,
    state.gameB,
    state.server === "B"
  );

  let pointLine = "";
  if (!state.matchWinner) {
    if (state.tbA !== null && state.tbB !== null) {
      pointLine = `TB  ${state.tbA} – ${state.tbB}`;
    } else {
      const pa = pointLabel(state.pointA, state.pointB);
      const pb = pointLabel(state.pointB, state.pointA);
      pointLine = `${pa} – ${pb}`;
    }
  } else {
    pointLine = `Winner: ${state.matchWinner === "A" ? config.playerA : config.playerB}`;
  }

  // --- Layout constants ---
  const fontSize = Math.round(height * 0.028); // ~30 px at 1080p
  const lineH = Math.round(fontSize * 1.4);
  const padding = Math.round(fontSize * 0.6);
  const bgW = Math.round(width * 0.32);
  const bgH = lineH * 3 + padding * 2;
  const bgX = padding * 2;
  const bgY = height - bgH - padding * 3;
  const textX = bgX + padding;

  const esc = (s: string) =>
    s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");

  const rectItem =
    `<item type="QGraphicsRectItem" z-value="0">` +
    `<position x="${bgX}" y="${bgY}">` +
    `<transform>1,0,0,0,1,0,0,0,1</transform>` +
    `</position>` +
    `<content width="${bgW}" height="${bgH}" ` +
    `brushcolor="#b2005500" pencolor="#00000000" penwidth="0"/>` +
    `</item>`;

  const textItem = (text: string, row: number, zValue: number) =>
    `<item type="QGraphicsTextItem" z-value="${zValue}">` +
    `<position x="${textX}" y="${bgY + padding + row * lineH}">` +
    `<transform>1,0,0,0,1,0,0,0,1</transform>` +
    `</position>` +
    `<content shadow="0;#64000000;2;2;2" font-pixel-size="${fontSize}" ` +
    `alignment="1" font-italic="0" font-weight="75" font="Sans Serif" ` +
    `font-underline="0" font-color="#ffffffff" font-outline="2" ` +
    `font-outline-color="#ff000000">${esc(text)}</content>` +
    `</item>`;

  const items =
    rectItem +
    textItem(lineA, 0, 1) +
    textItem(lineB, 1, 2) +
    textItem(pointLine, 2, 3);

  return (
    `<?xml version="1.0" encoding="utf-8"?>` +
    `<kdenlivetitle LC_NUMERIC="C" width="${width}" height="${height}" ` +
    `out="${durationFrames - 1}">` +
    items +
    `</kdenlivetitle>`
  );
}

/** Seconds added after the last event when no video duration is known. */
const DEFAULT_BUFFER_SECONDS = 30;
/** Default timeline duration (seconds) when there are no events and no video. */
const DEFAULT_DURATION_SECONDS = 60;



function setProp(doc: Document, parent: Element, name: string, value: string) {
  const p = doc.createElement("property");
  p.setAttribute("name", name);
  p.textContent = value;
  parent.appendChild(p);
}

function getPropValue(element: Element, name: string): string | null {
  for (const child of Array.from(element.children)) {
    if (
      child.tagName === "property" &&
      child.getAttribute("name") === name
    ) {
      return child.textContent;
    }
  }
  return null;
}

/**
 * Find the main project tractor in the kdenlive/MLT document.
 * Prefers the tractor with `kdenlive:projectTractor = 1`,
 * otherwise falls back to the tractor with the most `<track>` children.
 */
function findMainTractor(doc: Document): Element {
  const tractors = Array.from(doc.querySelectorAll("tractor"));
  const projectTractor = tractors.find(
    (t) => getPropValue(t, "kdenlive:projectTractor") === "1"
  );
  if (projectTractor) return projectTractor;

  // Fallback: tractor with the most tracks (likely the main timeline)
  return tractors.reduce((best, t) =>
    t.querySelectorAll("track").length > best.querySelectorAll("track").length
      ? t
      : best
  );
}

/**
 * Parse frame rate from MLT profile attributes.
 * MLT stores it as `frame_rate_num / frame_rate_den`.
 */
function profileFps(profile: Element): number {
  const num = parseFloat(profile.getAttribute("frame_rate_num") ?? "25");
  const den = parseFloat(profile.getAttribute("frame_rate_den") ?? "1");
  return den > 0 ? num / den : 25;
}

// ── Main export function ─────────────────────────────────────────────────────

/**
 * Inject live score overlays into an existing kdenlive (MLT XML) file.
 *
 * The function:
 *  1. Parses the uploaded kdenlive XML.
 *  2. Extracts the FPS, width and height from the `<profile>`.
 *  3. Divides the timeline into segments — one per scoring event —
 *     each carrying the match state active during that interval.
 *  4. Creates a `kdenlivetitle` producer for every segment.
 *  5. Groups them into a new `<playlist>` (= track).
 *  6. Adds that track to the main tractor and wires a composite
 *     transition so the scoreboard is rendered on top of the video.
 *  7. Serialises the modified document and returns the XML string.
 *
 * @param appState    Current application state (config + events).
 * @param kdenliveXml The raw XML text of the .kdenlive file to modify.
 * @returns           Modified XML text ready for download.
 */
export function exportToKdenlive(
  appState: AppState,
  kdenliveXml: string
): string {
  const { config, events, videoInfo } = appState;
  if (!config) throw new Error("No match configuration found.");

  // --- Parse the existing file ---
  const parser = new DOMParser();
  const doc = parser.parseFromString(kdenliveXml, "application/xml");

  const parseError = doc.querySelector("parsererror");
  if (parseError) {
    throw new Error("Failed to parse the kdenlive file: " + parseError.textContent);
  }

  // --- Read profile metadata ---
  const profile =
    doc.querySelector("mlt > profile") ?? doc.querySelector("profile");
  const fps = profile ? profileFps(profile) : 25;
  const width = profile
    ? parseInt(profile.getAttribute("width") ?? "1920", 10)
    : 1920;
  const height = profile
    ? parseInt(profile.getAttribute("height") ?? "1080", 10)
    : 1080;

  // --- Determine total timeline length ---
  const totalDuration_s =
    videoInfo?.duration_s ??
    (events.length > 0
      ? events[events.length - 1].t_s + DEFAULT_BUFFER_SECONDS
      : DEFAULT_DURATION_SECONDS);
  const totalFrames = Math.max(Math.ceil(totalDuration_s * fps), 1);

  // --- Build score segments ---
  const segments = buildScoreSegments(events, config, fps, totalFrames);

  // --- Find insertion point (main tractor) ---
  const mainTractor = findMainTractor(doc);
  const root = mainTractor.parentNode!;

  // --- Locate the Kdenlive project bin so producers can be registered ---
  // Kdenlive stores the project bin as <playlist id="main_bin">.
  // Every producer must have an <entry> there; otherwise Kdenlive reports
  // "Clip … not found in project bin" and treats the project as corrupted.
  const mainBin = doc.querySelector('playlist[id="main_bin"]');

  // --- Create one kdenlivetitle producer per segment ---
  const producerIds: string[] = [];

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const durationFrames = seg.endFrame - seg.startFrame + 1;
    const id = `kdenlive_scores_producer_${i}`;

    const producer = doc.createElement("producer");
    producer.setAttribute("id", id);
    producer.setAttribute("in", "0");
    producer.setAttribute("out", String(durationFrames - 1));

    const titleXml = buildTitleContent(
      seg.state,
      config,
      width,
      height,
      durationFrames
    );

    setProp(doc, producer, "mlt_service", "kdenlivetitle");
    setProp(doc, producer, "resource", titleXml);
    setProp(doc, producer, "kdenlive:clipname", `Score segment ${i + 1}`);
    setProp(doc, producer, "kdenlive:id", id);
    setProp(doc, producer, "length", String(durationFrames));
    setProp(doc, producer, "eof", "pause");
    setProp(doc, producer, "transparency", "1");

    // Insert each producer just before the main tractor
    root.insertBefore(producer, mainTractor);
    producerIds.push(id);

    // Register this producer in the project bin so Kdenlive can find it
    if (mainBin) {
      const binEntry = doc.createElement("entry");
      binEntry.setAttribute("producer", id);
      binEntry.setAttribute("in", "0");
      binEntry.setAttribute("out", String(durationFrames - 1));
      mainBin.appendChild(binEntry);
    }
  }

  // --- Build a playlist that assembles the segments in timeline order ---
  const playlistId = "playlist_kdenlive_scores";
  const playlist = doc.createElement("playlist");
  playlist.setAttribute("id", playlistId);

  let cursor = 0;
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];

    // Gap before this segment
    if (seg.startFrame > cursor) {
      const blank = doc.createElement("blank");
      blank.setAttribute("length", String(seg.startFrame - cursor));
      playlist.appendChild(blank);
    }

    const durationFrames = seg.endFrame - seg.startFrame + 1;
    const entry = doc.createElement("entry");
    entry.setAttribute("producer", producerIds[i]);
    entry.setAttribute("in", "0");
    entry.setAttribute("out", String(durationFrames - 1));
    playlist.appendChild(entry);

    cursor = seg.endFrame + 1;
  }

  root.insertBefore(playlist, mainTractor);

  // --- Add the playlist as a new track in the main tractor ---
  const newTrack = doc.createElement("track");
  newTrack.setAttribute("producer", playlistId);
  mainTractor.appendChild(newTrack);

  // The new track's index is the count of <track> children after appending
  const trackIndex =
    Array.from(mainTractor.children).filter((c) => c.tagName === "track")
      .length - 1;

  // --- Add a composite transition so the score overlay renders on top ---
  // a_track must be the track directly below b_track (not track 0 / the
  // black background) to avoid Kdenlive's "Invalid composition" warning.
  const aTrack = Math.max(trackIndex - 1, 0);
  const transition = doc.createElement("transition");
  setProp(doc, transition, "mlt_service", "qtblend");
  setProp(doc, transition, "a_track", String(aTrack));
  setProp(doc, transition, "b_track", String(trackIndex));
  setProp(doc, transition, "compositing", "0");
  setProp(doc, transition, "distort", "0");
  setProp(doc, transition, "rotate_center", "0");
  setProp(doc, transition, "ox", "0%");
  setProp(doc, transition, "oy", "0%");
  setProp(doc, transition, "always_active", "1");
  setProp(doc, transition, "automatic", "1");
  mainTractor.appendChild(transition);

  // --- Serialise and return ---
  return new XMLSerializer().serializeToString(doc);
}

/**
 * Trigger a browser download of `xmlContent` as a .kdenlive file.
 */
export function downloadKdenliveFile(
  xmlContent: string,
  filename = "tennis-match.kdenlive"
): void {
  const blob = new Blob([xmlContent], { type: "application/xml" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
