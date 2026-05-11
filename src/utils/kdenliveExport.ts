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
 * - Supports both legacy (≤7.10) and modern (≥7.37) Kdenlive formats
 * - Legacy format: frei0r.cairoblend composite, playlist-based score track
 * - Modern format: qtblend composite, tractor-based score track, chain detection
 * - Template-based title content using score_tennis_compact_4k.kdenlivetitle
 * - Robust project bin detection (supports multiple Kdenlive versions)
 * - Automatic bin creation if missing
 * - Debug utilities for troubleshooting bin issues
 */

// ── Embedded kdenlivetitle template ──────────────────────────────────────────

/**
 * Embedded content of score_tennis_compact_4k.kdenlivetitle.
 * This template is designed for 4K (3840×2160) and contains named placeholder
 * text items: Player1, Player2, S1, S2, G1, G2, P1, P2.
 * The ● bullet at z-index=15 acts as the serve indicator for Player1's row.
 */
const SCORE_TITLE_TEMPLATE = `<kdenlivetitle LC_NUMERIC="C" duration="250" height="2160" out="250" width="3840">
 <item type="QGraphicsTextItem" z-index="19">
  <position x="168" y="1837">
   <transform>1,0,0,0,1,0,0,0,1</transform>
  </position>
  <content alignment="1" box-height="36" box-width="95" font="Tahoma" font-color="255,255,255,255" font-italic="0" font-pixel-size="30" font-underline="0" font-weight="50" letter-spacing="0" shadow="0;#ff000000;0;0;0" tab-width="80" typewriter="0;2;1;0;0">Players</content>
 </item>
 <item type="QGraphicsTextItem" z-index="18">
  <position x="584" y="1837">
   <transform>1,0,0,0,1,0,0,0,1</transform>
  </position>
  <content alignment="1" box-height="36" box-width="56" font="Tahoma" font-color="255,255,255,255" font-italic="0" font-pixel-size="30" font-underline="0" font-weight="50" letter-spacing="0" shadow="0;#ff000000;0;0;0" tab-width="80" typewriter="0;2;1;0;0">Sets</content>
 </item>
 <item type="QGraphicsTextItem" z-index="17">
  <position x="766" y="1837">
   <transform>1,0,0,0,1,0,0,0,1</transform>
  </position>
  <content alignment="1" box-height="36" box-width="90" font="Tahoma" font-color="255,255,255,255" font-italic="0" font-pixel-size="30" font-underline="0" font-weight="50" letter-spacing="0" shadow="0;#ff000000;0;0;0" tab-width="80" typewriter="0;2;1;0;0">Games</content>
 </item>
 <item type="QGraphicsTextItem" z-index="16">
  <position x="948" y="1837">
   <transform>1,0,0,0,1,0,0,0,1</transform>
  </position>
  <content alignment="1" box-height="36" box-width="80" font="Tahoma" font-color="255,255,255,255" font-italic="0" font-pixel-size="30" font-underline="0" font-weight="50" letter-spacing="0" shadow="0;#ff000000;0;0;0" tab-width="80" typewriter="0;2;1;0;0">Points</content>
 </item>
 <item type="QGraphicsTextItem" z-index="15">
  <position x="132" y="1887">
   <transform>1,0,0,0,1,0,0,0,1</transform>
  </position>
  <content alignment="1" box-height="46" box-width="23" font="Tahoma" font-color="255,221,0,255" font-italic="0" font-pixel-size="38" font-underline="0" font-weight="75" letter-spacing="0" shadow="0;#ff000000;0;0;0" tab-width="80" typewriter="0;2;1;0;0">●</content>
 </item>
 <item type="QGraphicsTextItem" z-index="14">
  <position x="168" y="1890">
   <transform>1,0,0,0,1,0,0,0,1</transform>
  </position>
  <content alignment="1" box-height="48" box-width="129" font="Tahoma" font-color="255,255,255,255" font-italic="0" font-pixel-size="40" font-underline="0" font-weight="50" letter-spacing="0" shadow="0;#ff000000;0;0;0" tab-width="80" typewriter="0;2;1;0;0">Player1</content>
 </item>
 <item type="QGraphicsTextItem" z-index="13">
  <position x="584" y="1890">
   <transform>1,0,0,0,1,0,0,0,1</transform>
  </position>
  <content alignment="1" box-height="53" box-width="49" font="Tahoma" font-color="255,255,255,255" font-italic="0" font-pixel-size="44" font-underline="0" font-weight="75" letter-spacing="0" shadow="0;#ff000000;0;0;0" tab-width="80" typewriter="0;2;1;0;0">S1</content>
 </item>
 <item type="QGraphicsTextItem" z-index="12">
  <position x="766" y="1890">
   <transform>1,0,0,0,1,0,0,0,1</transform>
  </position>
  <content alignment="1" box-height="53" box-width="53" font="Tahoma" font-color="255,255,255,255" font-italic="0" font-pixel-size="44" font-underline="0" font-weight="75" letter-spacing="0" shadow="0;#ff000000;0;0;0" tab-width="80" typewriter="0;2;1;0;0">G1</content>
 </item>
 <item type="QGraphicsTextItem" z-index="11">
  <position x="948" y="1890">
   <transform>1,0,0,0,1,0,0,0,1</transform>
  </position>
  <content alignment="1" box-height="53" box-width="48" font="Tahoma" font-color="255,255,255,255" font-italic="0" font-pixel-size="44" font-underline="0" font-weight="75" letter-spacing="0" shadow="0;#ff000000;0;0;0" tab-width="80" typewriter="0;2;1;0;0">P1</content>
 </item>
 <item type="QGraphicsTextItem" z-index="10">
  <position x="168" y="1958">
   <transform>1,0,0,0,1,0,0,0,1</transform>
  </position>
  <content alignment="1" box-height="48" box-width="129" font="Tahoma" font-color="255,255,255,255" font-italic="0" font-pixel-size="40" font-underline="0" font-weight="50" letter-spacing="0" shadow="0;#ff000000;0;0;0" tab-width="80" typewriter="0;2;1;0;0">Player2</content>
 </item>
 <item type="QGraphicsTextItem" z-index="9">
  <position x="584" y="1958">
   <transform>1,0,0,0,1,0,0,0,1</transform>
  </position>
  <content alignment="1" box-height="53" box-width="49" font="Tahoma" font-color="255,255,255,255" font-italic="0" font-pixel-size="44" font-underline="0" font-weight="75" letter-spacing="0" shadow="0;#ff000000;0;0;0" tab-width="80" typewriter="0;2;1;0;0">S2</content>
 </item>
 <item type="QGraphicsTextItem" z-index="8">
  <position x="766" y="1958">
   <transform>1,0,0,0,1,0,0,0,1</transform>
  </position>
  <content alignment="1" box-height="53" box-width="53" font="Tahoma" font-color="255,255,255,255" font-italic="0" font-pixel-size="44" font-underline="0" font-weight="75" letter-spacing="0" shadow="0;#ff000000;0;0;0" tab-width="80" typewriter="0;2;1;0;0">G2</content>
 </item>
 <item type="QGraphicsTextItem" z-index="7">
  <position x="948" y="1958">
   <transform>1,0,0,0,1,0,0,0,1</transform>
  </position>
  <content alignment="1" box-height="53" box-width="48" font="Tahoma" font-color="255,255,255,255" font-italic="0" font-pixel-size="44" font-underline="0" font-weight="75" letter-spacing="0" shadow="0;#ff000000;0;0;0" tab-width="80" typewriter="0;2;1;0;0">P2</content>
 </item>
 <item type="QGraphicsRectItem" z-index="6">
  <position x="93" y="1884">
   <transform zoom="100">1,0,0,0,1,0,0,0,1</transform>
  </position>
  <content brushcolor="255,255,255,70" pencolor="0,0,0,255" penwidth="0" rect="0,0,986,2"/>
 </item>
 <item type="QGraphicsRectItem" z-index="5">
  <position x="554" y="1858">
   <transform zoom="100">1,0,0,0,1,0,0,0,1</transform>
  </position>
  <content brushcolor="255,255,255,70" pencolor="0,0,0,255" penwidth="0" rect="0,0,2,151"/>
 </item>
 <item type="QGraphicsRectItem" z-index="4">
  <position x="736" y="1858">
   <transform zoom="100">1,0,0,0,1,0,0,0,1</transform>
  </position>
  <content brushcolor="255,255,255,70" pencolor="0,0,0,255" penwidth="0" rect="0,0,2,151"/>
 </item>
 <item type="QGraphicsRectItem" z-index="3">
  <position x="918" y="1858">
   <transform zoom="100">1,0,0,0,1,0,0,0,1</transform>
  </position>
  <content brushcolor="255,255,255,70" pencolor="0,0,0,255" penwidth="0" rect="0,0,2,151"/>
 </item>
 <item type="QGraphicsRectItem" z-index="0">
  <position x="99" y="1821">
   <transform zoom="100">1,0,0,0,1,0,0,0,1</transform>
  </position>
  <content brushcolor="30,30,30,191" pencolor="0,0,0,255" penwidth="0" rect="0,0,986,205"/>
 </item>
 <startviewport rect="0,0,3840,2160"/>
 <endviewport rect="0,0,3840,2160"/>
 <background color="0,0,0,0"/>
</kdenlivetitle>`;

/**
 * Y-coordinate of the Player1 name row in the embedded template (z-index=14).
 */
const TEMPLATE_PLAYER1_ROW_Y = 1890;
/**
 * Y-coordinate of the Player2 name row in the embedded template (z-index=10).
 */
const TEMPLATE_PLAYER2_ROW_Y = 1958;
/**
 * Pixel distance between the two player rows in the template.
 * Both the player-name items and the serve-indicator bullet maintain the same
 * vertical gap between row 1 and row 2, so this single offset can be applied
 * to the bullet Y to move it from the Player1 row to the Player2 row.
 */
const TEMPLATE_ROW_OFFSET = TEMPLATE_PLAYER2_ROW_Y - TEMPLATE_PLAYER1_ROW_Y; // 68
/** Y-coordinate of the serve-indicator bullet in the template (z-index=15). */
const TEMPLATE_BULLET_Y = 1887;

export interface ScoreSegment {
  startFrame: number;
  endFrame: number;
  state: MatchState;
}

export interface ExportToKdenliveOptions {
  /**
   * When true, only inject score producers into the project bin.
   * No score track/playlist/transition is added to the timeline.
   */
  binOnly?: boolean;
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

/**
 * Build the kdenlivetitle XML string for the given match state using the
 * embedded `score_tennis_compact_4k.kdenlivetitle` template.
 *
 * The template placeholders are replaced:
 *   Player1 → playerA name, Player2 → playerB name,
 *   S1/S2 → sets, G1/G2 → games, P1/P2 → point labels.
 * The serve-indicator bullet (z-index=15) is repositioned to the correct
 * player row.
 *
 * @param state          Current match state.
 * @param config         Match configuration.
 * @param durationFrames Duration of this clip in frames.
 */
export function buildTitleContentFromTemplate(
  state: MatchState,
  config: MatchConfig,
  durationFrames: number
): string {
  const outFrame = Math.max(durationFrames - 1, 0);

  const esc = (s: string) =>
    s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

  // --- Per-player point labels ---
  let pointA = "";
  let pointB = "";
  if (!state.matchWinner) {
    if (state.tbA !== null && state.tbB !== null) {
      pointA = `TB ${state.tbA}`;
      pointB = `TB ${state.tbB}`;
    } else {
      pointA = pointLabel(state.pointA, state.pointB);
      pointB = pointLabel(state.pointB, state.pointA);
    }
  } else {
    if (state.matchWinner === "A") pointA = "Winner";
    else pointB = "Winner";
  }

  let xml = SCORE_TITLE_TEMPLATE;

  // Update duration / out on the <kdenlivetitle> root element
  xml = xml.replace(/(<kdenlivetitle\b[^>]*?\s)duration="[^"]*"/, `$1duration="${durationFrames}"`);
  xml = xml.replace(/(<kdenlivetitle\b[^>]*?\s)out="[^"]*"/, `$1out="${outFrame}"`);

  // Replace placeholder text content
  xml = xml.replace(/>Player1<\/content>/, `>${esc(config.playerA)}</content>`);
  xml = xml.replace(/>Player2<\/content>/, `>${esc(config.playerB)}</content>`);
  xml = xml.replace(/>S1<\/content>/, `>${String(state.setA)}</content>`);
  xml = xml.replace(/>S2<\/content>/, `>${String(state.setB)}</content>`);
  xml = xml.replace(/>G1<\/content>/, `>${String(state.gameA)}</content>`);
  xml = xml.replace(/>G2<\/content>/, `>${String(state.gameB)}</content>`);
  xml = xml.replace(/>P1<\/content>/, `>${esc(pointA)}</content>`);
  xml = xml.replace(/>P2<\/content>/, `>${esc(pointB)}</content>`);

  // Reposition the serve-indicator bullet (z-index=15) to the correct player row.
  // The template places it on Player1's row (y=TEMPLATE_BULLET_Y).
  // When Player2 is serving, shift it down by TEMPLATE_ROW_OFFSET.
  if (state.server === "B") {
    const newY = TEMPLATE_BULLET_Y + TEMPLATE_ROW_OFFSET;
    // Match the position element inside the z-index=15 item and change its y attribute.
    xml = xml.replace(
      /(z-index="15"[\s\S]*?<position\s[^>]*?)y="(\d+)"/,
      `$1y="${newY}"`
    );
  }

  return xml;
}

/** Seconds added after the last event when no video duration is known. */
const DEFAULT_BUFFER_SECONDS = 30;
/** Default timeline duration (seconds) when there are no events and no video. */
const DEFAULT_DURATION_SECONDS = 60;

function stripXmlDeclaration(xml: string): string {
  return xml.replace(/^\s*<\?xml[^>]*\?>\s*/i, "");
}

function makeSimpleUUID(): string {
  // Generate UUID format for Kdenlive: {xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx}
  const hex = (len: number): string => {
    let out = "";
    for (let i = 0; i < len; i++) {
      out += Math.floor(Math.random() * 16).toString(16);
    }
    return out;
  };

  return `{${hex(8)}-${hex(4)}-${hex(4)}-${hex(4)}-${hex(12)}}`;
}

function makeSimpleHash(): string {
  // Generate a simple MD5-like hash string (32 hex chars) for Kdenlive file_hash property
  const chars = "0123456789abcdef";
  let hash = "";
  for (let i = 0; i < 32; i++) {
    hash += chars[Math.floor(Math.random() * 16)];
  }
  return hash;
}

function timecodeToFrame(timecode: string, fps: number): number {
  const m = timecode.match(/^(\d+):(\d+):(\d+)\.(\d{1,3})$/);
  if (!m) return 0;
  const hours = Number.parseInt(m[1], 10);
  const minutes = Number.parseInt(m[2], 10);
  const seconds = Number.parseInt(m[3], 10);
  const millis = Number.parseInt(m[4].padEnd(3, "0"), 10);
  const totalMs = ((hours * 60 + minutes) * 60 + seconds) * 1000 + millis;
  return Math.max(0, Math.round((totalMs * fps) / 1000));
}

function timelineTotalFrames(sequenceTractor: Element, fps: number): number | null {
  const outTc = sequenceTractor.getAttribute("out");
  const inTc = sequenceTractor.getAttribute("in") ?? "00:00:00.000";
  if (!outTc) return null;
  const outFrame = timecodeToFrame(outTc, fps);
  const inFrame = timecodeToFrame(inTc, fps);
  const duration = outFrame - inFrame + 1;
  return duration > 0 ? duration : null;
}



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
  const idProps = Array.from(doc.querySelectorAll('property[name="kdenlive:id"]'));
  for (const prop of idProps) {
    const n = Number.parseInt(prop.textContent ?? "", 10);
    if (Number.isFinite(n) && n > maxId) maxId = n;
  }
  return maxId + 1;
}

/**
 * Return `true` when the document was saved by Kdenlive ≥ 7.37 (or any version
 * that uses `<chain>` elements for media clips instead of `<producer>`).
 * In this "new" format the score overlay track must be wrapped in a sub-tractor
 * and the composite transition must be `qtblend` rather than `frei0r.cairoblend`.
 */
export function isNewKdenliveFormat(doc: Document): boolean {
  return doc.querySelector("chain") !== null;
}

/**
 * Find the actual sequence (timeline) tractor in a Kdenlive document.
 *
 * Modern Kdenlive (≥7.37) wraps the timeline in two levels:
 *   tractor5 (projectTractor=1) → tractor4 (sequence, has sequenceproperties.*)
 * Older Kdenlive uses a single tractor with projectTractor=1.
 *
 * This function returns the innermost sequence tractor so that tracks and
 * transitions are added to the correct element.
 */
function findSequenceTractor(doc: Document): Element {
  const tractors = Array.from(doc.querySelectorAll("tractor"));

  // New format: look for a tractor that carries sequence properties
  const sequenceTractor = tractors.find(
    (t) => getPropValue(t, "kdenlive:sequenceproperties.tracks") !== null
  );
  if (sequenceTractor) return sequenceTractor;

  // Fallback: use the legacy main-tractor finder (old format)
  return findMainTractor(doc);
}

/**
 * Return the next available numeric transition id suffix for new-format
 * Kdenlive files (e.g. returns 4 when the highest existing id is "transition3").
 */
function nextTransitionIndex(doc: Document): number {
  let max = -1;
  for (const t of Array.from(doc.querySelectorAll("transition[id]"))) {
    const m = (t.getAttribute("id") ?? "").match(/^transition(\d+)$/);
    if (m) {
      const n = parseInt(m[1], 10);
      if (n > max) max = n;
    }
  }
  return max + 1;
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
  kdenliveXml: string,
  options?: ExportToKdenliveOptions
): string {
  const { config, events, videoInfo } = appState;
  if (!config) throw new Error("No match configuration found.");
  const binOnly = options?.binOnly === true;

  // --- Parse the existing file ---
  const parser = new DOMParser();
  const doc = parser.parseFromString(stripXmlDeclaration(kdenliveXml), "application/xml");

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

  // --- Detect format ---
  const newFormat = isNewKdenliveFormat(doc);

  // --- Find insertion point ---
  // For new format, the projectTractor is a wrapper; we need the sequence tractor.
  // For old format, mainTractor is the sequence tractor.
  const mainTractor = findMainTractor(doc);
  const sequenceTractor = newFormat ? findSequenceTractor(doc) : mainTractor;
  const root = mainTractor.parentElement;
  if (!root) {
    throw new Error("Invalid kdenlive structure: main tractor has no parent element.");
  }

  // --- Determine total timeline length ---
  // Prefer the timeline duration from the sequence tractor so we never generate
  // score clips that extend beyond the project timeline.
  const sequenceFrames = timelineTotalFrames(sequenceTractor, fps);
  const totalDuration_s =
    videoInfo?.duration_s ??
    (events.length > 0
      ? events[events.length - 1].t_s + DEFAULT_BUFFER_SECONDS
      : DEFAULT_DURATION_SECONDS);
  const fallbackFrames = Math.max(Math.ceil(totalDuration_s * fps), 1);
  const totalFrames = sequenceFrames ?? fallbackFrames;

  // --- Build score segments ---
  const segments = buildScoreSegments(events, config, fps, totalFrames);

  // --- Locate the Kdenlive project bin so producers can be registered ---
  // Kdenlive stores the project bin as a playlist. Different versions use different IDs.
  // Every producer must have an <entry> there; otherwise Kdenlive reports
  // "Clip … not found in project bin" and treats the project as corrupted.
  let mainBin = findProjectBin(doc);
  
  // Keep generated title clips at root bin level to match known-good exports.
  const validFolderId = "-1";

  // If no bin exists, create one
  if (!mainBin) {
    mainBin = createProjectBin(doc, root);
  }

  // --- Choose the anchor for producer insertion ---
  // For new-format files (chain-based), producers must come before playlists/tractors.
  // For legacy files, insert before the bin as before.
  let producerInsertAnchor: Element;
  if (newFormat) {
    // Find the first playlist or tractor child of root to insert producers before it
    const firstPlaylistOrTractor = Array.from(root.children).find(
      (c) => c.tagName === "playlist" || c.tagName === "tractor"
    ) ?? mainBin;
    producerInsertAnchor = firstPlaylistOrTractor;
  } else {
    producerInsertAnchor = mainBin ?? mainTractor;
  }

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

    // Build title XML: use the embedded template for new-format files (optimised for
    // the correct kdenlivetitle attribute names used by Kdenlive ≥7.37), or fall back
    // to the programmatic builder for legacy files.
    const titleXml = newFormat
      ? buildTitleContentFromTemplate(seg.state, config, durationFrames)
      : buildTitleContent(seg.state, config, width, height, durationFrames);

    // Core producer properties (shared between both formats)
    // Property order matters in practice for compatibility with some Kdenlive imports.
    setProp(doc, producer, "length", String(durationFrames));
    setProp(doc, producer, "eof", "pause");
    setProp(doc, producer, "resource", "");
    setProp(doc, producer, "meta.media.progressive", "1");
    setProp(doc, producer, "aspect_ratio", "1");
    setProp(doc, producer, "seekable", "1");
    setProp(doc, producer, "mlt_service", "kdenlivetitle");
    setProp(doc, producer, "kdenlive:clip_type", "2");
    setProp(doc, producer, "force_reload", "0");
    setProp(doc, producer, "xmldata", titleXml);
    setProp(doc, producer, "kdenlive:id", clipId);
    setProp(doc, producer, "kdenlive:clipname", `Score segment ${i + 1}`);
    setProp(doc, producer, "meta.media.width", String(width));
    setProp(doc, producer, "meta.media.height", String(height));
    setProp(doc, producer, "kdenlive:duration", frameToTimecode(durationFrames, fps));
    setProp(doc, producer, "xml", "was here");
    setProp(doc, producer, "kdenlive:folderid", validFolderId);
    setProp(doc, producer, "kdenlive:monitorPosition", "0");
    setProp(doc, producer, "kdenlive:control_uuid", makeSimpleUUID());
    setProp(doc, producer, "kdenlive:uniqueId", makeSimpleUUID());
    setProp(doc, producer, "kdenlive:file_hash", makeSimpleHash());

    if (newFormat) {
      // New-format properties already set above
    } else {
      // Legacy-format additional properties (Kdenlive ≤7.10)
      setProp(doc, producer, "progressive", "1");
      setProp(doc, producer, "transparency", "1");
      setProp(doc, producer, "mlt_type", "producer");
    }

    // Insert each producer at the correct position
    root.insertBefore(producer, producerInsertAnchor);
    producerIds.push(id);

    // Register this producer in the project bin so Kdenlive can find it
    const binEntry = doc.createElement("entry");
    binEntry.setAttribute("producer", id);
    binEntry.setAttribute("in", frameToTimecode(0, fps));
    binEntry.setAttribute("out", frameToTimecode(outFrame, fps));
    if (!newFormat) {
      // Legacy format includes the clip id as a child property on the bin entry
      const clipIdProp = doc.createElement("property");
      clipIdProp.setAttribute("name", "kdenlive:id");
      clipIdProp.textContent = clipId;
      binEntry.appendChild(clipIdProp);
    }
    mainBin.appendChild(binEntry);
  }

  if (!binOnly) {
    // --- Build the score track playlist ---
    // In modern Kdenlive projects, prefer writing into an existing empty timeline
    // playlist so clips are directly visible/editable in the timeline UI.
    let scorePlaylistId = "playlist_kdenlive_scores";
    let scorePlaylist: Element = doc.createElement("playlist");
    let reuseExistingTimelinePlaylist = false;

    if (newFormat) {
      const existingTimelinePlaylist = doc.querySelector('playlist[id="playlist6"]');
      if (existingTimelinePlaylist && existingTimelinePlaylist.querySelectorAll("entry").length === 0) {
        scorePlaylist = existingTimelinePlaylist;
        scorePlaylistId = "playlist6";
        reuseExistingTimelinePlaylist = true;
      }
    }

    if (!reuseExistingTimelinePlaylist) {
      scorePlaylist.setAttribute("id", scorePlaylistId);
    } else {
      while (scorePlaylist.firstChild) {
        scorePlaylist.removeChild(scorePlaylist.firstChild);
      }
    }

  let cursor = 0;
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];

    // Gap before this segment
    if (seg.startFrame > cursor) {
      const blank = doc.createElement("blank");
      blank.setAttribute("length", String(seg.startFrame - cursor));
      scorePlaylist.appendChild(blank);
    }

    const durationFrames = seg.endFrame - seg.startFrame + 1;
    const outFrame = Math.max(durationFrames - 1, 0);
    const entry = doc.createElement("entry");
    entry.setAttribute("producer", producerIds[i]);
    entry.setAttribute("in", frameToTimecode(0, fps));
    entry.setAttribute("out", frameToTimecode(outFrame, fps));

    if (!newFormat) {
      // Legacy format: include the clip id as a child property
      const clipIdProp = doc.createElement("property");
      clipIdProp.setAttribute("name", "kdenlive:id");
      clipIdProp.textContent = String(firstGeneratedClipId + i);
      entry.appendChild(clipIdProp);
    }

    scorePlaylist.appendChild(entry);
    cursor = seg.endFrame + 1;
  }

  if (newFormat) {
    if (reuseExistingTimelinePlaylist) {
      // Reusing playlist6: no extra score tractor/track/transition needed.
    } else {
    // New format: score track is a sub-tractor with the score playlist +
    // an empty companion playlist (needed by the Kdenlive tractor-per-track model).
    const scoreAuxPlaylistId = "playlist_kdenlive_scores_aux";
    const scoreAuxPlaylist = doc.createElement("playlist");
    scoreAuxPlaylist.setAttribute("id", scoreAuxPlaylistId);

    const scoreTractorId = "tractor_kdenlive_scores";
    const scoreTractor = doc.createElement("tractor");
    scoreTractor.setAttribute("id", scoreTractorId);
    scoreTractor.setAttribute("in", "00:00:00.000");
    scoreTractor.setAttribute("out", frameToTimecode(totalFrames - 1, fps));
    setProp(doc, scoreTractor, "kdenlive:trackheight", "67");
    setProp(doc, scoreTractor, "kdenlive:timeline_active", "1");
    setProp(doc, scoreTractor, "kdenlive:collapsed", "0");
    setProp(doc, scoreTractor, "kdenlive:thumbs_format", "");
    setProp(doc, scoreTractor, "kdenlive:audio_rec", "");

    const trackVideo = doc.createElement("track");
    trackVideo.setAttribute("hide", "audio");
    trackVideo.setAttribute("producer", scorePlaylistId);
    scoreTractor.appendChild(trackVideo);

    const trackAux = doc.createElement("track");
    trackAux.setAttribute("hide", "audio");
    trackAux.setAttribute("producer", scoreAuxPlaylistId);
    scoreTractor.appendChild(trackAux);

    // Insert before the bin (which is at the end of the document in new format)
    root.insertBefore(scorePlaylist, mainBin);
    root.insertBefore(scoreAuxPlaylist, mainBin);
    root.insertBefore(scoreTractor, mainBin);

    // Add the score sub-tractor as a new track in the sequence tractor
    const newTrack = doc.createElement("track");
    newTrack.setAttribute("producer", scoreTractorId);
    sequenceTractor.appendChild(newTrack);

    const scoreTrackIndex =
      Array.from(sequenceTractor.children).filter(
        (c) => c.tagName.toLowerCase() === "track"
      ).length - 1;

    // Wire a qtblend composite transition for the new score track
    const transitionId = `transition${nextTransitionIndex(doc)}`;
    const transition = doc.createElement("transition");
    transition.setAttribute("id", transitionId);
    setProp(doc, transition, "a_track", "0");
    setProp(doc, transition, "b_track", String(scoreTrackIndex));
    setProp(doc, transition, "compositing", "0");
    setProp(doc, transition, "distort", "0");
    setProp(doc, transition, "rotate_center", "0");
    setProp(doc, transition, "mlt_service", "qtblend");
    setProp(doc, transition, "kdenlive_id", "qtblend");
    setProp(doc, transition, "internal_added", "237");
    setProp(doc, transition, "always_active", "1");
    sequenceTractor.appendChild(transition);
    }
  } else {
    // Legacy format: insert the playlist directly before the main tractor and
    // add it as a plain track with a frei0r.cairoblend composite transition.
    root.insertBefore(scorePlaylist, mainTractor);

    const newTrack = doc.createElement("track");
    newTrack.setAttribute("producer", scorePlaylistId);
    mainTractor.appendChild(newTrack);

    const trackIndex =
      Array.from(mainTractor.children).filter(
        (c) => c.tagName.toLowerCase() === "track"
      ).length - 1;

    const transition = doc.createElement("transition");
    setProp(doc, transition, "a_track", "0");
    setProp(doc, transition, "b_track", String(trackIndex));
    setProp(doc, transition, "version", "0.1");
    setProp(doc, transition, "mlt_service", "frei0r.cairoblend");
    setProp(doc, transition, "always_active", "1");
    setProp(doc, transition, "internal_added", "237");
    mainTractor.appendChild(transition);
  }

  }

  // --- Serialise and return ---
  const serializer = new XMLSerializer();
  let xmlString = serializer.serializeToString(doc);
  
  // Ensure XML declaration is present for Kdenlive compatibility
  if (!xmlString.startsWith('<?xml')) {
    xmlString = `<?xml version="1.0" encoding="utf-8"?>\n${xmlString}`;
  }
  
  return xmlString;
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
  const doc = parser.parseFromString(stripXmlDeclaration(kdenliveXml), "application/xml");
  
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
