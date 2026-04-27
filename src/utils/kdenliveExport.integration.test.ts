// @vitest-environment happy-dom
import { describe, it, expect } from "vitest";
import { exportToKdenlive } from "./kdenliveExport";
import type { AppState } from "../store/reducer";
import type { MatchConfig } from "../types";

const config: MatchConfig = {
  playerA: "Alice",
  playerB: "Bob",
  bestOf: 3,
  gamesPerSet: 6,
  tiebreakAt: 6,
  tiebreakPoints: 7,
  serverFirst: "A",
};

/** Minimal but valid kdenlive/MLT XML with a main_bin playlist and two video tracks. */
function makeKdenliveXml(extraTracks = ""): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<mlt version="7.0.0">
  <profile description="HD 1080p 25fps" width="1920" height="1080"
           frame_rate_num="25" frame_rate_den="1"/>
  <playlist id="main_bin">
    <property name="kdenlive:docproperties.decimalPoint">.</property>
  </playlist>
  <producer id="black" in="0" out="9999">
    <property name="mlt_service">color</property>
    <property name="color">black</property>
  </producer>
  <playlist id="video_track_0"/>
  <tractor id="main_tractor">
    <property name="kdenlive:projectTractor">1</property>
    <track producer="black"/>
    <track producer="video_track_0"/>
    ${extraTracks}
  </tractor>
</mlt>`;
}

function parseXml(xml: string): Document {
  return new DOMParser().parseFromString(xml, "application/xml");
}

function buildAppState(overrides: Partial<AppState> = {}): AppState {
  return {
    config,
    events: [
      { id: "e1", t_s: 10, type: "point", winner: "A" },
      { id: "e2", t_s: 20, type: "point", winner: "B" },
    ],
    videoInfo: { name: "match.mp4", duration_s: 60, fps_hint: 25 },
    ...overrides,
  } as AppState;
}

describe("exportToKdenlive – project bin registration", () => {
  it("adds each score producer to the main_bin playlist", () => {
    const result = exportToKdenlive(buildAppState(), makeKdenliveXml());
    const doc = parseXml(result);

    const mainBin = doc.querySelector('playlist[id="main_bin"]');
    expect(mainBin).not.toBeNull();

    const entries = Array.from(mainBin!.querySelectorAll("entry"));
    const producerIds = entries.map((e) => e.getAttribute("producer") ?? "");

    // At least one entry per score producer must be in the bin
    const scoreEntries = producerIds.filter((id) =>
      id.startsWith("kdenlive_scores_producer_")
    );
    expect(scoreEntries.length).toBeGreaterThan(0);

    // Verify the producers referenced from the bin actually exist in the document
    for (const id of scoreEntries) {
      const producer = doc.querySelector(`producer[id="${id}"]`);
      expect(producer).not.toBeNull();
    }
  });

  it("serializes score producers before the project bin playlist", () => {
    const result = exportToKdenlive(buildAppState(), makeKdenliveXml());
    const doc = parseXml(result);

    const firstScoreProducer = doc.querySelector("producer[id^='kdenlive_scores_producer_']");
    const mainBin = doc.querySelector('playlist[id="main_bin"]');

    expect(firstScoreProducer).not.toBeNull();
    expect(mainBin).not.toBeNull();

    const pos = firstScoreProducer!.compareDocumentPosition(mainBin!);
    expect((pos & Node.DOCUMENT_POSITION_FOLLOWING) !== 0).toBe(true);
  });

  it("registers every produced segment in the main_bin (no orphaned producers)", () => {
    const result = exportToKdenlive(buildAppState(), makeKdenliveXml());
    const doc = parseXml(result);

    const allProducers = Array.from(
      doc.querySelectorAll("producer[id^='kdenlive_scores_producer_']")
    ).map((p) => p.getAttribute("id")!);

    const mainBin = doc.querySelector('playlist[id="main_bin"]')!;
    const binEntryIds = Array.from(mainBin.querySelectorAll("entry")).map(
      (e) => e.getAttribute("producer")!
    );

    for (const producerId of allProducers) {
      expect(binEntryIds).toContain(producerId);
    }
  });

  it("uses timecode in/out values for score entries in main_bin", () => {
    const result = exportToKdenlive(buildAppState(), makeKdenliveXml());
    const doc = parseXml(result);

    const mainBin = doc.querySelector('playlist[id="main_bin"]')!;
    const scoreEntries = Array.from(mainBin.querySelectorAll("entry")).filter((e) =>
      (e.getAttribute("producer") ?? "").startsWith("kdenlive_scores_producer_")
    );

    expect(scoreEntries.length).toBeGreaterThan(0);
    for (const entry of scoreEntries) {
      expect(entry.getAttribute("in") ?? "").toMatch(/^\d{2}:\d{2}:\d{2}\.\d{3}$/);
      expect(entry.getAttribute("out") ?? "").toMatch(/^\d{2}:\d{2}:\d{2}\.\d{3}$/);
    }
  });

  it("creates a project bin when none exists", () => {
    // XML without any bin
    const xmlWithoutBin = `<?xml version="1.0" encoding="utf-8"?>
<mlt version="7.0.0">
  <profile description="HD 1080p 25fps" width="1920" height="1080"
           frame_rate_num="25" frame_rate_den="1"/>
  <producer id="black" in="0" out="9999">
    <property name="mlt_service">color</property>
  </producer>
  <playlist id="video_track_0"/>
  <tractor id="main_tractor">
    <property name="kdenlive:projectTractor">1</property>
    <track producer="black"/>
    <track producer="video_track_0"/>
  </tractor>
</mlt>`;

    const result = exportToKdenlive(buildAppState(), xmlWithoutBin);
    const doc = parseXml(result);
    
    // Should create a main_bin
    const mainBin = doc.querySelector('playlist[id="main_bin"]');
    expect(mainBin).not.toBeNull();
    
    // Should contain score producer entries
    const entries = Array.from(mainBin!.querySelectorAll("entry"));
    const scoreEntries = entries.filter(e => 
      e.getAttribute("producer")?.startsWith("kdenlive_scores_producer_")
    );
    expect(scoreEntries.length).toBeGreaterThan(0);
  });

  it("finds project bin with alternative IDs", () => {
    // Test with project_bin instead of main_bin
    const xmlWithProjectBin = `<?xml version="1.0" encoding="utf-8"?>
<mlt version="7.0.0">
  <profile description="HD 1080p 25fps" width="1920" height="1080"
           frame_rate_num="25" frame_rate_den="1"/>
  <playlist id="project_bin">
    <property name="kdenlive:docproperties.decimalPoint">.</property>
  </playlist>
  <producer id="black" in="0" out="9999">
    <property name="mlt_service">color</property>
  </producer>
  <playlist id="video_track_0"/>
  <tractor id="main_tractor">
    <property name="kdenlive:projectTractor">1</property>
    <track producer="black"/>
    <track producer="video_track_0"/>
  </tractor>
</mlt>`;

    const result = exportToKdenlive(buildAppState(), xmlWithProjectBin);
    const doc = parseXml(result);
    
    // Should use the existing project_bin 
    const projectBin = doc.querySelector('playlist[id="project_bin"]');
    expect(projectBin).not.toBeNull();
    
    // Should contain score producer entries
    const entries = Array.from(projectBin!.querySelectorAll("entry"));
    const scoreEntries = entries.filter(e => 
      e.getAttribute("producer")?.startsWith("kdenlive_scores_producer_")
    );
    expect(scoreEntries.length).toBeGreaterThan(0);
  });

  it("works correctly even when main_bin is absent (no crash)", () => {
    const xmlWithoutBin = `<?xml version="1.0" encoding="utf-8"?>
<mlt version="7.0.0">
  <profile description="HD 1080p 25fps" width="1920" height="1080"
           frame_rate_num="25" frame_rate_den="1"/>
  <producer id="black" in="0" out="9999">
    <property name="mlt_service">color</property>
  </producer>
  <playlist id="video_track_0"/>
  <tractor id="main_tractor">
    <property name="kdenlive:projectTractor">1</property>
    <track producer="black"/>
    <track producer="video_track_0"/>
  </tractor>
</mlt>`;

    // Should not throw even without a main_bin playlist
    expect(() =>
      exportToKdenlive(buildAppState(), xmlWithoutBin)
    ).not.toThrow();
  });
});

describe("exportToKdenlive – transition a_track", () => {
  it("uses cairoblend from track 0 to the appended score track", () => {
    const result = exportToKdenlive(buildAppState(), makeKdenliveXml());
    const doc = parseXml(result);

    const transitions = Array.from(doc.querySelectorAll("transition"));
    const scoreTransition = transitions.find((t) => {
      const service = Array.from(t.querySelectorAll("property")).find(
        (p) => p.getAttribute("name") === "mlt_service"
      );
      return service?.textContent === "frei0r.cairoblend";
    });
    expect(scoreTransition).not.toBeUndefined();

    const getVal = (t: Element, name: string) =>
      Array.from(t.querySelectorAll("property"))
        .find((p) => p.getAttribute("name") === name)
        ?.textContent ?? null;

    const bTrack = parseInt(getVal(scoreTransition!, "b_track") ?? "-1", 10);
    const aTrack = parseInt(getVal(scoreTransition!, "a_track") ?? "-1", 10);

    const tracks = Array.from(doc.querySelectorAll('tractor[id="main_tractor"] > track'));
    const expectedScoreTrackIndex = tracks.length - 1;

    // b_track is the new score track (last track in tractor)
    expect(bTrack).toBeGreaterThan(0);
    expect(bTrack).toBe(expectedScoreTrackIndex);
    // a_track follows Kdenlive overlay convention in reference files
    expect(aTrack).toBe(0);
  });

  it("keeps a_track at 0 when adding score track to minimal tractor", () => {
    const xmlSingleTrack = `<?xml version="1.0" encoding="utf-8"?>
<mlt version="7.0.0">
  <profile description="HD 1080p 25fps" width="1920" height="1080"
           frame_rate_num="25" frame_rate_den="1"/>
  <playlist id="main_bin"/>
  <producer id="black" in="0" out="9999">
    <property name="mlt_service">color</property>
  </producer>
  <tractor id="main_tractor">
    <property name="kdenlive:projectTractor">1</property>
    <track producer="black"/>
  </tractor>
</mlt>`;

    const result = exportToKdenlive(buildAppState(), xmlSingleTrack);
    const doc = parseXml(result);

    const transitions = Array.from(doc.querySelectorAll("transition"));
    const scoreTransition = transitions.find((t) => {
      const service = Array.from(t.querySelectorAll("property")).find(
        (p) => p.getAttribute("name") === "mlt_service"
      );
      return service?.textContent === "frei0r.cairoblend";
    });

    const getVal = (t: Element, name: string) =>
      Array.from(t.querySelectorAll("property"))
        .find((p) => p.getAttribute("name") === name)
        ?.textContent ?? null;

    const aTrack = parseInt(getVal(scoreTransition!, "a_track") ?? "-1", 10);
    expect(aTrack).toBe(0);
  });
});

// ── New Kdenlive format (≥7.37, chain-based) ─────────────────────────────────

/**
 * Minimal Kdenlive 7.37+ XML.
 * Key differences from the old format:
 *  - Uses <chain> elements for media clips (triggers "new format" detection)
 *  - The projectTractor (tractor1) wraps the sequence tractor (tractor0)
 *  - The sequence tractor has kdenlive:sequenceproperties.tracks
 *  - main_bin playlist is at the end of the document
 */
function makeNewKdenliveXml(): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<mlt LC_NUMERIC="en_US.UTF-8" producer="main_bin" version="7.37.0">
 <profile description="4K UHD 2160p 59.94 fps" frame_rate_den="1001" frame_rate_num="60000" height="2160" progressive="1" width="3840"/>
 <chain id="chain0" out="00:01:00.000">
  <property name="length">3602</property>
  <property name="mlt_service">avformat-novalidate</property>
  <property name="kdenlive:id">4</property>
 </chain>
 <producer id="producer0" in="00:00:00.000" out="00:30:00.000">
  <property name="mlt_service">color</property>
  <property name="kdenlive:id">1</property>
 </producer>
 <playlist id="playlist0"/>
 <playlist id="playlist1"/>
 <tractor id="tractor0" in="00:00:00.000" out="01:00:00.000">
  <property name="kdenlive:sequenceproperties.tracks">2</property>
  <property name="kdenlive:clipname">Sequence 1</property>
  <track producer="producer0"/>
  <track hide="audio" producer="playlist0"/>
  <track hide="audio" producer="playlist1"/>
  <transition id="transition0">
   <property name="a_track">0</property>
   <property name="b_track">1</property>
   <property name="compositing">0</property>
   <property name="distort">0</property>
   <property name="rotate_center">0</property>
   <property name="mlt_service">qtblend</property>
   <property name="kdenlive_id">qtblend</property>
   <property name="internal_added">237</property>
   <property name="always_active">1</property>
  </transition>
 </tractor>
 <playlist id="main_bin">
  <property name="kdenlive:docproperties.documentid">1234</property>
  <entry in="00:00:00.000" out="01:00:00.000" producer="chain0"/>
 </playlist>
 <tractor id="tractor1" in="00:00:00.000" out="01:00:00.000">
  <property name="kdenlive:projectTractor">1</property>
  <track in="00:00:00.000" out="01:00:00.000" producer="tractor0"/>
 </tractor>
</mlt>`;
}

describe("exportToKdenlive – new Kdenlive format (≥7.37)", () => {
  it("detects new format and uses qtblend composite transition", () => {
    const result = exportToKdenlive(buildAppState(), makeNewKdenliveXml());
    const doc = parseXml(result);

    const transitions = Array.from(doc.querySelectorAll("transition"));
    const scoreTransition = transitions.find((t) => {
      const service = Array.from(t.querySelectorAll("property")).find(
        (p) => p.getAttribute("name") === "mlt_service"
      );
      return service?.textContent === "qtblend";
    });
    // Should use qtblend, not frei0r.cairoblend
    expect(scoreTransition).not.toBeUndefined();

    const frei0rTransition = transitions.find((t) => {
      const service = Array.from(t.querySelectorAll("property")).find(
        (p) => p.getAttribute("name") === "mlt_service"
      );
      return service?.textContent === "frei0r.cairoblend";
    });
    expect(frei0rTransition).toBeUndefined();
  });

  it("adds score producers before the first playlist element", () => {
    const result = exportToKdenlive(buildAppState(), makeNewKdenliveXml());
    const doc = parseXml(result);

    const firstScoreProducer = doc.querySelector("producer[id^='kdenlive_scores_producer_']");
    const firstPlaylist = doc.querySelector("playlist");

    expect(firstScoreProducer).not.toBeNull();
    expect(firstPlaylist).not.toBeNull();

    // The score producer must come before any playlist
    const pos = firstScoreProducer!.compareDocumentPosition(firstPlaylist!);
    expect((pos & Node.DOCUMENT_POSITION_FOLLOWING) !== 0).toBe(true);
  });

  it("wraps the score playlist in a sub-tractor for the new format", () => {
    const result = exportToKdenlive(buildAppState(), makeNewKdenliveXml());
    const doc = parseXml(result);

    // Score tractor should exist
    const scoreTractor = doc.querySelector('tractor[id="tractor_kdenlive_scores"]');
    expect(scoreTractor).not.toBeNull();

    // Score tractor should reference the score playlist via a track element
    const scoreTrack = Array.from(
      scoreTractor!.querySelectorAll("track")
    ).find((t) => t.getAttribute("producer") === "playlist_kdenlive_scores");
    expect(scoreTrack).not.toBeUndefined();
  });

  it("adds score sub-tractor as a track in the sequence tractor", () => {
    const result = exportToKdenlive(buildAppState(), makeNewKdenliveXml());
    const doc = parseXml(result);

    // The sequence tractor (tractor0) should reference tractor_kdenlive_scores
    const sequenceTractor = doc.querySelector(
      'tractor[id="tractor0"]'
    );
    expect(sequenceTractor).not.toBeNull();

    const scoreTrack = Array.from(
      sequenceTractor!.querySelectorAll(":scope > track")
    ).find((t) => t.getAttribute("producer") === "tractor_kdenlive_scores");
    expect(scoreTrack).not.toBeUndefined();
  });

  it("registers score producers in the main_bin", () => {
    const result = exportToKdenlive(buildAppState(), makeNewKdenliveXml());
    const doc = parseXml(result);

    const mainBin = doc.querySelector('playlist[id="main_bin"]');
    expect(mainBin).not.toBeNull();

    const scoreEntries = Array.from(mainBin!.querySelectorAll("entry")).filter(
      (e) => (e.getAttribute("producer") ?? "").startsWith("kdenlive_scores_producer_")
    );
    expect(scoreEntries.length).toBeGreaterThan(0);
  });

  it("uses the template-based title content (contains kdenlivetitle with z-index)", () => {
    const result = exportToKdenlive(buildAppState(), makeNewKdenliveXml());
    // Template uses z-index (not z-value used by the programmatic builder)
    expect(result).toContain("z-index=");
  });

  it("assigns a unique transition id (new format convention)", () => {
    const result = exportToKdenlive(buildAppState(), makeNewKdenliveXml());
    const doc = parseXml(result);

    // All transitions in the sequence tractor should have id attributes
    const sequenceTractor = doc.querySelector('tractor[id="tractor0"]')!;
    const transitions = Array.from(sequenceTractor.querySelectorAll("transition"));
    const scoreTransition = transitions.find((t) => {
      const service = Array.from(t.querySelectorAll("property")).find(
        (p) => p.getAttribute("name") === "mlt_service"
      );
      return service?.textContent === "qtblend" &&
        Array.from(t.querySelectorAll("property")).some(
          (p) => p.getAttribute("name") === "b_track" &&
                 parseInt(p.textContent ?? "0", 10) > 0
        );
    });
    expect(scoreTransition).not.toBeUndefined();
    expect(scoreTransition!.getAttribute("id")).toMatch(/^transition\d+$/);
  });
});
