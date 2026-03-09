import type { AppState } from "../store/reducer";
import type { MatchConfig, MatchEvent, MatchState } from "../types";
import { computeState, getInitialState, pointLabel } from "../engine/scoring";

/**
 * Kdenlive Export Module
 * 
 * This module handles exporting tennis match scores as overlay graphics
 * to Kdenlive video editing projects. It creates kdenlivetitle producers
 * and properly registers them in the project bin to avoid corruption errors.
 * 
 * Key features:
 * - Robust project bin detection (supports multiple Kdenlive versions)
 * - Automatic bin creation if missing
 * - Enhanced producer properties for maximum compatibility
 * - Debug utilities for troubleshooting bin issues
 */

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
 * Build the kdenlivetitle XML string for the given match state.
 * Kdenlive writes title clips in the `xmldata` producer property.
 *
 * Layout (table-like, 2 rows):
 *   ● Alice   1  3  40
 *     Bob     1  2  15
 *
 * Each column is a separate QGraphicsTextItem positioned at a fixed x
 * coordinate so scores stay aligned regardless of name length.
 * The serve-indicator bullet (●) is rendered in orange; all other text is white.
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
  // --- Layout constants ---
  const fontSize = Math.round(height * 0.028); // ~30 px at 1080p
  const lineH = Math.round(fontSize * 1.4);
  const padding = Math.round(fontSize * 0.6);
  const bgW = Math.round(width * 0.40);   // wider to fit 5 columns
  const bgH = lineH * 2 + padding * 2;   // 2 player rows
  const bgX = padding * 2;
  const bgY = height - bgH - padding * 3;

  // Column x positions (bullet | name | set | game | point)
  const colBullet = bgX + padding;
  const bulletW   = fontSize;
  const colName   = colBullet + bulletW;
  const nameW     = Math.round(bgW * 0.38);
  const colSet    = colName + nameW;
  const colW      = Math.round(bgW * 0.12);
  const colGame   = colSet + colW;
  const colPoint  = colGame + colW;

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

  const textItem = (text: string, x: number, row: number, zValue: number, color = "#ffffffff") =>
    `<item type="QGraphicsTextItem" z-value="${zValue}">` +
    `<position x="${x}" y="${bgY + padding + row * lineH}">` +
    `<transform>1,0,0,0,1,0,0,0,1</transform>` +
    `</position>` +
    `<content shadow="0;#64000000;2;2;2" font-pixel-size="${fontSize}" ` +
    `alignment="1" font-italic="0" font-weight="75" font="MS Shell Dlg 2" ` +
    `font-underline="0" font-color="${color}" font-outline="2" ` +
    `font-outline-color="#ff000000">${esc(text)}</content>` +
    `</item>`;

  // --- Per-player point labels ---
  let pointA = "";
  let pointB = "";
  if (!state.matchWinner) {
    if (state.tbA !== null && state.tbB !== null) {
      // Prefix "TB" on both rows so viewers know it's a tiebreak
      pointA = `TB ${state.tbA}`;
      pointB = `TB ${state.tbB}`;
    } else {
      pointA = pointLabel(state.pointA, state.pointB);
      pointB = pointLabel(state.pointB, state.pointA);
    }
  } else {
    // Show "Winner" in the point column of the winning player's row
    if (state.matchWinner === "A") pointA = "Winner";
    else pointB = "Winner";
  }

  // --- Assemble items ---
  // Orange bullet for the serving player; all other text is white.
  const BULLET_COLOR = "#ffff8c00";
  let zVal = 1;
  let items = rectItem;

  // Row 0 – Player A
  if (state.server === "A") items += textItem("●", colBullet, 0, zVal++, BULLET_COLOR);
  items += textItem(config.playerA, colName,  0, zVal++);
  items += textItem(String(state.setA),  colSet,   0, zVal++);
  items += textItem(String(state.gameA), colGame,  0, zVal++);
  items += textItem(pointA,              colPoint, 0, zVal++);

  // Row 1 – Player B
  if (state.server === "B") items += textItem("●", colBullet, 1, zVal++, BULLET_COLOR);
  items += textItem(config.playerB, colName,  1, zVal++);
  items += textItem(String(state.setB),  colSet,   1, zVal++);
  items += textItem(String(state.gameB), colGame,  1, zVal++);
  items += textItem(pointB,              colPoint, 1, zVal++);

  return (
    `<kdenlivetitle duration="${durationFrames}" LC_NUMERIC="C" width="${width}" ` +
    `height="${height}" out="${durationFrames - 1}">` +
    items +
    `<startviewport rect="0,0,${width},${height}"/>` +
    `<endviewport rect="0,0,${width},${height}"/>` +
    `<background color="0,0,0,0"/>` +
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
 * Find the project bin playlist in the kdenlive document.
 * Different Kdenlive versions may use different IDs for the bin.
 */
function findProjectBin(doc: Document): Element | null {
  // Try common bin IDs used by different Kdenlive versions
  const binIds = ["main_bin", "project_bin", "bin"];
  
  for (const id of binIds) {
    const bin = doc.querySelector(`playlist[id="${id}"]`);
    if (bin) return bin;
  }
  
  // Look for a playlist with kdenlive bin-related properties
  const playlists = Array.from(doc.querySelectorAll("playlist"));
  for (const playlist of playlists) {
    const props = Array.from(playlist.querySelectorAll("property"));
    const hasDocProperties = props.some(p => 
      p.getAttribute("name")?.includes("kdenlive:docproperties") || 
      p.getAttribute("name")?.includes("kdenlive:clipfolderid")
    );
    if (hasDocProperties) return playlist;
  }
  
  return null;
}

/**
 * Create a new project bin playlist if one doesn't exist.
 */
function createProjectBin(doc: Document, root: Element): Element {
  const bin = doc.createElement("playlist");
  bin.setAttribute("id", "main_bin");
  
  // Add standard kdenlive bin properties
  const docProp = doc.createElement("property");
  docProp.setAttribute("name", "kdenlive:docproperties.decimalPoint");
  docProp.textContent = ".";
  bin.appendChild(docProp);
  
  // Insert the bin at the beginning of the document (before any producers)
  const firstProducer = root.querySelector("producer");
  if (firstProducer) {
    root.insertBefore(bin, firstProducer);
  } else {
    // If no producers exist, insert after profile
    const profile = root.querySelector("profile");
    if (profile && profile.nextSibling) {
      root.insertBefore(bin, profile.nextSibling);
    } else {
      root.appendChild(bin);
    }
  }
  
  return bin;
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

function frameToTimecode(frame: number, fps: number): string {
  const safeFrame = Math.max(frame, 0);
  const totalMs = Math.round((safeFrame * 1000) / fps);
  const hours = Math.floor(totalMs / 3_600_000);
  const minutes = Math.floor((totalMs % 3_600_000) / 60_000);
  const seconds = Math.floor((totalMs % 60_000) / 1000);
  const millis = totalMs % 1000;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(
    seconds
  ).padStart(2, "0")}.${String(millis).padStart(3, "0")}`;
}

function nextKdenliveClipId(doc: Document): number {
  let maxId = 0;
  const producers = Array.from(doc.querySelectorAll("producer"));
  for (const producer of producers) {
    const idValue = getPropValue(producer, "kdenlive:id");
    if (!idValue) continue;
    const n = Number.parseInt(idValue, 10);
    if (Number.isFinite(n) && n > maxId) maxId = n;
  }
  return maxId + 1;
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
  const root = mainTractor.parentElement;
  if (!root) {
    throw new Error("Invalid kdenlive structure: main tractor has no parent element.");
  }

  // --- Locate the Kdenlive project bin so producers can be registered ---
  // Kdenlive stores the project bin as a playlist. Different versions use different IDs.
  // Every producer must have an <entry> there; otherwise Kdenlive reports
  // "Clip … not found in project bin" and treats the project as corrupted.
  let mainBin = findProjectBin(doc);
  
  // If no bin exists, create one
  if (!mainBin) {
    mainBin = createProjectBin(doc, root);
  }

  // Keep score producers in the producer block before the project bin when possible.
  // Some Kdenlive versions are strict about this ordering while resolving bin entries.
  const producerInsertAnchor = mainBin ?? mainTractor;

  // --- Create one kdenlivetitle producer per segment ---
  const producerIds: string[] = [];
  const firstGeneratedClipId = nextKdenliveClipId(doc);

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const durationFrames = seg.endFrame - seg.startFrame + 1;
    const outFrame = Math.max(durationFrames - 1, 0);
    const id = `kdenlive_scores_producer_${i}`;
    const clipId = String(firstGeneratedClipId + i);

    const producer = doc.createElement("producer");
    producer.setAttribute("id", id);
    producer.setAttribute("in", frameToTimecode(0, fps));
    producer.setAttribute("out", frameToTimecode(outFrame, fps));

    const titleXml = buildTitleContent(
      seg.state,
      config,
      width,
      height,
      durationFrames
    );

    // Match Kdenlive's native title producer shape as closely as possible.
    setProp(doc, producer, "length", String(durationFrames));
    setProp(doc, producer, "eof", "pause");
    setProp(doc, producer, "resource", "");
    setProp(doc, producer, "progressive", "1");
    setProp(doc, producer, "aspect_ratio", "1");
    setProp(doc, producer, "seekable", "1");
    setProp(doc, producer, "mlt_service", "kdenlivetitle");
    setProp(doc, producer, "kdenlive:duration", String(durationFrames));
    setProp(doc, producer, "kdenlive:clipname", `Score segment ${i + 1}`);
    setProp(doc, producer, "xmldata", titleXml);
    setProp(doc, producer, "kdenlive:id", clipId);
    setProp(doc, producer, "kdenlive:folderid", "-1");
    setProp(doc, producer, "kdenlive:clip_type", "2");
    setProp(doc, producer, "force_reload", "0");
    setProp(doc, producer, "meta.media.width", String(width));
    setProp(doc, producer, "meta.media.height", String(height));
    setProp(doc, producer, "transparency", "1");
    setProp(doc, producer, "mlt_type", "producer");

    // Insert each producer before the bin (or before main tractor as fallback).
    root.insertBefore(producer, producerInsertAnchor);
    producerIds.push(id);

    // Register this producer in the project bin so Kdenlive can find it
    const binEntry = doc.createElement("entry");
    binEntry.setAttribute("producer", id);
    binEntry.setAttribute("in", frameToTimecode(0, fps));
    binEntry.setAttribute("out", frameToTimecode(outFrame, fps));
    mainBin.appendChild(binEntry);
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
    const outFrame = Math.max(durationFrames - 1, 0);
    const entry = doc.createElement("entry");
    entry.setAttribute("producer", producerIds[i]);
    entry.setAttribute("in", frameToTimecode(0, fps));
    entry.setAttribute("out", frameToTimecode(outFrame, fps));

    const clipIdProp = doc.createElement("property");
    clipIdProp.setAttribute("name", "kdenlive:id");
    clipIdProp.textContent = String(firstGeneratedClipId + i);
    entry.appendChild(clipIdProp);

    playlist.appendChild(entry);

    cursor = seg.endFrame + 1;
  }

  root.insertBefore(playlist, mainTractor);

  // --- Add the playlist as a new track in the main tractor ---
  const newTrack = doc.createElement("track");
  newTrack.setAttribute("producer", playlistId);
  mainTractor.appendChild(newTrack);

  // The new track's index is the last direct <track> child after appending.
  const trackIndex =
    Array.from(mainTractor.children).filter(
      (c) => c.tagName.toLowerCase() === "track"
    ).length - 1;

  // --- Add a composite transition so the score overlay renders on top ---
  // Match Kdenlive's native overlay composition style from known-good files.
  const aTrack = 0;
  const transition = doc.createElement("transition");
  setProp(doc, transition, "a_track", String(aTrack));
  setProp(doc, transition, "b_track", String(trackIndex));
  setProp(doc, transition, "version", "0.1");
  setProp(doc, transition, "mlt_service", "frei0r.cairoblend");
  setProp(doc, transition, "always_active", "1");
  setProp(doc, transition, "internal_added", "237");
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

/**
 * Debug function to analyze a kdenlive XML for potential bin issues.
 * Useful for troubleshooting "not found in project bin" errors.
 */
export function analyzeKdenliveFile(kdenliveXml: string): {
  hasProjectBin: boolean;
  binId: string | null;
  binEntryCount: number;
  producerCount: number;
  orphanedProducers: string[];
  suggestions: string[];
} {
  const parser = new DOMParser();
  const doc = parser.parseFromString(kdenliveXml, "application/xml");
  
  const bin = findProjectBin(doc);
  const producers = Array.from(doc.querySelectorAll("producer"));
  const binEntries = bin ? Array.from(bin.querySelectorAll("entry")) : [];
  const binProducerIds = new Set(binEntries.map(e => e.getAttribute("producer")).filter(Boolean));
  
  const orphanedProducers: string[] = [];
  const suggestions: string[] = [];
  
  for (const producer of producers) {
    const id = producer.getAttribute("id");
    if (id && !binProducerIds.has(id) && !id.startsWith("black") && !id.includes("track")) {
      orphanedProducers.push(id);
    }
  }
  
  if (!bin) {
    suggestions.push("No project bin found - consider creating one");
  }
  
  if (orphanedProducers.length > 0) {
    suggestions.push(`${orphanedProducers.length} producers not registered in bin`);
  }
  
  if (binEntries.length === 0 && producers.length > 0) {
    suggestions.push("Empty project bin but producers exist");
  }
  
  return {
    hasProjectBin: bin !== null,
    binId: bin?.getAttribute("id") || null,
    binEntryCount: binEntries.length,
    producerCount: producers.length,
    orphanedProducers,
    suggestions
  };
}
