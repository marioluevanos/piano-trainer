import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { songMetadata, storedMetadata } from "./metadata.ts";

const score = (head: string) =>
  `<?xml version="1.0"?><score-partwise><work>${head}</work></score-partwise>`;

describe("songMetadata", () => {
  it("reads the title and composer", () => {
    const xml = `<score-partwise><work><work-title>Pr&#xE9;lude in E Minor</work-title></work>
      <identification><creator type="composer">Fr&#233;d&#233;ric Chopin</creator></identification></score-partwise>`;
    assert.deepEqual(songMetadata(xml, "file"), {
      title: "Prélude in E Minor",
      artist: "Frédéric Chopin",
    });
  });

  it("falls back to the movement title, then the file name", () => {
    assert.deepEqual(
      songMetadata(
        "<score-partwise><movement-title> Nocturne </movement-title></score-partwise>",
        "f",
      ),
      { title: "Nocturne" },
    );
    assert.deepEqual(
      songMetadata(score("<work-title> </work-title>"), "clair-de-lune"),
      {
        title: "clair-de-lune",
      },
    );
  });

  it("leaves the artist out when the score names no composer", () => {
    const meta = songMetadata(score("<work-title>Glasswork</work-title>"), "f");
    assert.equal("artist" in meta, false);
  });
});

describe("storedMetadata", () => {
  it("keeps a stored artist", () => {
    assert.deepEqual(storedMetadata("Clair de Lune", "Claude Debussy"), {
      title: "Clair de Lune",
      artist: "Claude Debussy",
    });
  });

  it("splits a legacy 'Title — Artist' title", () => {
    assert.deepEqual(storedMetadata("Prélude in E Minor — Frédéric Chopin"), {
      title: "Prélude in E Minor",
      artist: "Frédéric Chopin",
    });
  });

  it("leaves plain titles and hyphenated titles alone", () => {
    assert.deepEqual(
      storedMetadata("Philip Glass - Glasswork - Opening No. 1"),
      {
        title: "Philip Glass - Glasswork - Opening No. 1",
      },
    );
    assert.deepEqual(storedMetadata("Solo — "), { title: "Solo — " });
    assert.deepEqual(storedMetadata(" — Nobody"), { title: " — Nobody" });
  });
});
