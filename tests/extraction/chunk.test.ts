/**
 * lib/extraction/chunk.ts - section/heading-aware chunking + provenance.
 */
import { describe, expect, it } from "vitest";
import { chunkDocument } from "../../lib/extraction/chunk";
import type { ParsedDocument } from "../../lib/extraction/parse";

function fixture(text: string, pageTexts?: string[]): ParsedDocument {
  if (pageTexts) {
    let cursor = 0;
    const pages = pageTexts.map((t, i) => {
      const p = { pageNumber: i + 1, text: t };
      cursor += t.length + 2;
      return p;
    });
    return { pages, fullText: pageTexts.join("\n\n") };
  }
  return { pages: [{ pageNumber: 1, text }], fullText: text };
}

describe("chunkDocument", () => {
  it("segments Article/Section boundaries with correct articleRef/sectionRef/heading provenance", () => {
    const text = ["ARTICLE I", "DEFINITIONS", "", 'SECTION 1.01. Defined Terms. "Consolidated EBITDA" means...', "", "ARTICLE VI", "NEGATIVE COVENANTS", "", "SECTION 6.01. Indebtedness. The Borrower will not incur Indebtedness.", "", "SECTION 6.02. Liens. The Borrower will not create a Lien."].join("\n");

    const chunks = chunkDocument(fixture(text));

    const definitionsChunk = chunks.find((c) => c.sectionRef === "1.01");
    expect(definitionsChunk).toBeDefined();
    expect(definitionsChunk!.articleRef).toBe("Article I");
    expect(definitionsChunk!.text).toContain("Consolidated EBITDA");

    const indebtednessChunk = chunks.find((c) => c.sectionRef === "6.01");
    expect(indebtednessChunk).toBeDefined();
    expect(indebtednessChunk!.articleRef).toBe("Article VI");
    expect(indebtednessChunk!.text).toContain("Indebtedness");

    const liensChunk = chunks.find((c) => c.sectionRef === "6.02");
    expect(liensChunk).toBeDefined();
    expect(liensChunk!.articleRef).toBe("Article VI");
  });

  it("resets sectionRef (but not articleRef persistence logic) when a new Article begins", () => {
    const text = ["ARTICLE I", "SECTION 1.01. First.", "ARTICLE VI", "NEGATIVE COVENANTS", "SECTION 6.01. Indebtedness."].join("\n");
    const chunks = chunkDocument(fixture(text));
    const negCovenants = chunks.find((c) => c.heading === "NEGATIVE COVENANTS");
    expect(negCovenants).toBeDefined();
    // The stale "1.01" from Article I must not leak into Article VI's un-sectioned preamble.
    expect(negCovenants!.sectionRef).toBeNull();
    expect(negCovenants!.articleRef).toBe("Article VI");
  });

  it("assigns chunkIndex sequentially and preserves char offsets that round-trip against the source text", () => {
    const text = "ARTICLE I\nSECTION 1.01. Alpha.\nSECTION 1.02. Beta.";
    const parsed = fixture(text);
    const chunks = chunkDocument(parsed);
    chunks.forEach((c, i) => expect(c.chunkIndex).toBe(i));
    for (const c of chunks) {
      expect(parsed.fullText.slice(c.charStart, c.charEnd)).toBe(c.text);
    }
  });

  it("sub-splits an oversized section with overlap while preserving its section identity", () => {
    const bigBody = "x".repeat(15000);
    const text = `ARTICLE VI\nSECTION 6.01. Indebtedness. ${bigBody}\nSECTION 6.02. Liens. short.`;
    const chunks = chunkDocument(fixture(text));

    const section601Chunks = chunks.filter((c) => c.sectionRef === "6.01");
    expect(section601Chunks.length).toBeGreaterThan(1);
    for (const c of section601Chunks) {
      expect(c.text.length).toBeLessThanOrEqual(6000);
    }
    // Consecutive sub-split windows overlap - the tail of one reappears at the head of the next.
    const first = section601Chunks[0]!;
    const second = section601Chunks[1]!;
    const overlapCandidate = first.text.slice(-400);
    expect(second.text.startsWith(overlapCandidate.slice(0, 100))).toBe(true);
  });

  it("assigns page numbers from the source ParsedDocument's page boundaries", () => {
    const parsed = fixture("", ["ARTICLE I\nSECTION 1.01. On page one.", "ARTICLE VI\nSECTION 6.01. On page two."]);
    const chunks = chunkDocument(parsed);
    const page1Chunk = chunks.find((c) => c.sectionRef === "1.01");
    const page2Chunk = chunks.find((c) => c.sectionRef === "6.01");
    expect(page1Chunk!.page).toBe(1);
    expect(page2Chunk!.page).toBe(2);
  });

  it("falls back to fixed windows (no crash, no data loss) when the text has no recognizable headings", () => {
    const text = "just a flat paragraph of prose with no Article or Section markers at all.";
    const chunks = chunkDocument(fixture(text));
    expect(chunks).toHaveLength(1);
    expect(chunks[0]!.text).toBe(text);
    expect(chunks[0]!.articleRef).toBeNull();
    expect(chunks[0]!.sectionRef).toBeNull();
  });

  it("keeps un-headed preamble text before the first boundary instead of dropping it", () => {
    const text = "Recitals: this agreement is entered into as of...\nARTICLE I\nSECTION 1.01. Term.";
    const chunks = chunkDocument(fixture(text));
    expect(chunks[0]!.text).toContain("Recitals");
    expect(chunks[0]!.articleRef).toBeNull();
  });
});
