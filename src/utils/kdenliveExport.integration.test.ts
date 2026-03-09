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
  it("sets a_track to the track immediately below the score track", () => {
    // The tractor starts with 2 tracks (indices 0 and 1).
    // After adding the score track it becomes index 2.
    // a_track should be 1 (the track just below), not 0.
    const result = exportToKdenlive(buildAppState(), makeKdenliveXml());
    const doc = parseXml(result);

    const transitions = Array.from(doc.querySelectorAll("transition"));
    const scoreTransition = transitions.find((t) => {
      const service = Array.from(t.querySelectorAll("property")).find(
        (p) => p.getAttribute("name") === "mlt_service"
      );
      return service?.textContent === "qtblend";
    });
    expect(scoreTransition).not.toBeUndefined();

    const getVal = (t: Element, name: string) =>
      Array.from(t.querySelectorAll("property"))
        .find((p) => p.getAttribute("name") === name)
        ?.textContent ?? null;

    const bTrack = parseInt(getVal(scoreTransition!, "b_track") ?? "-1", 10);
    const aTrack = parseInt(getVal(scoreTransition!, "a_track") ?? "-1", 10);

    // b_track is the new score track (last track in tractor)
    expect(bTrack).toBeGreaterThan(0);
    // a_track must be the track directly below b_track, not 0
    expect(aTrack).toBe(bTrack - 1);
  });

  it("a_track is at least 0 when the score track is the only track", () => {
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
      return service?.textContent === "qtblend";
    });

    const getVal = (t: Element, name: string) =>
      Array.from(t.querySelectorAll("property"))
        .find((p) => p.getAttribute("name") === name)
        ?.textContent ?? null;

    const aTrack = parseInt(getVal(scoreTransition!, "a_track") ?? "-1", 10);
    expect(aTrack).toBeGreaterThanOrEqual(0);
  });
});
