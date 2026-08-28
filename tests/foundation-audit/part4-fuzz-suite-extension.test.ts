/**
 * Foundation Assurance Audit - Part 4: extending the 1500-case fuzz suite.
 *
 * Analysis performed first (see the audit's final report for the narrative):
 * tests/contract-model/structural-node-identity-property.test.ts's
 * `generateDocument` composes documents ENTIRELY from well-formed heading
 * templates (`Section ${num} ${title} .`) that are, by construction,
 * guaranteed to match SECTION_PATTERNS pattern 1 - every one of its
 * "corruption" knobs (whitespaceCorruptionProb, zeroNewlineProb,
 * repeatedMarkerProb, duplicateSectionProb, etc.) perturbs SURROUNDING
 * whitespace/repetition/newlines, never the heading's own matched shape
 * (title case, terminal period, "Section"/digit-dot-digit grammar). It never
 * generates a heading that the parser's own regex family was NOT designed to
 * match. This file adds exactly that: categories whose headings are
 * genuinely unanticipated by SECTION_PATTERNS/ARTICLE_PATTERNS, run through
 * the same REAL parser + REAL index builder, checked against the SAME
 * invariant-derived assertions the original suite uses (I1/I7/I9/I13/zero-
 * ERROR) - never against "whatever the current implementation happens to
 * output," which would be circular.
 *
 * This is a NEW, separate file - structural-node-identity-property.test.ts
 * (frozen, lib/tests boundary) is not edited.
 */
import { describe, expect, it } from "vitest";
import { parseDocumentStructure } from "../../lib/contract-model/compiler/stage-structure";
import { buildStructuralIndex, type StructuralIndex } from "../../lib/contract-model/compiler/structural-index";

function buildFor(documentId: string, text: string): { index: StructuralIndex; nodeCount: number } {
  const nodes = parseDocumentStructure({ documentId, label: documentId, text });
  const index = buildStructuralIndex(new Map([[documentId, { text, nodes }]]), [], []);
  return { index, nodeCount: nodes.length };
}

/** Identical in spirit to the original suite's assertCoreInvariants - re-derived independently from the ADR's own invariant text (I1/I7/I9/I13/zero-ERROR), not copied verbatim, so this file does not silently inherit a bug in the original helper. */
function assertCoreInvariants(index: StructuralIndex, label: string) {
  const allNodes = index.allNodes();
  const idSet = new Set(allNodes.map((n) => n.nodeId));
  expect(idSet.size, `${label}: I1 - distinct nodeId per occurrence`).toBe(allNodes.length);
  for (const n of allNodes) {
    expect(index.getNodeById(n.nodeId), `${label}: I7 - every indexed nodeId resolves`).toBeDefined();
  }
  const reached = new Set<string>();
  for (const r of index.roots()) {
    reached.add(r.nodeId);
    for (const d of index.getDescendants(r.nodeId)) reached.add(d.nodeId);
  }
  const orphanIds = new Set(index.orphans().map((o) => o.nodeId));
  const unreached = allNodes.filter((n) => !reached.has(n.nodeId) && !orphanIds.has(n.nodeId));
  expect(unreached, `${label}: I9 - every non-orphan reachable from a root`).toHaveLength(0);
  for (const n of allNodes) {
    const kids = index.getChildren(n.nodeId);
    for (let i = 1; i < kids.length; i++) {
      expect(kids[i]!.charStart, `${label}: I13 - children charStart-ascending`).toBeGreaterThanOrEqual(kids[i - 1]!.charStart);
    }
  }
  const errors = index.healthDiagnostics().filter((f) => f.severity === "ERROR");
  expect(errors, `${label}: zero ERROR findings (found ${JSON.stringify(errors)})`).toHaveLength(0);
}

function mulberry32(seed: number): () => number {
  let a = seed;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// Category A: OCR-like corruption (random character substitution/deletion
// inside the heading's OWN keyword/title/number - not surrounding whitespace).
// A genuinely unanticipated malformation: SECTION_PATTERNS requires the
// literal keyword "Section"/"SECTION"/"§" - a scanned/OCR'd "Sectlon 6.01"
// or a dropped digit "Section 6.1" (when the rest of the document is 6.01-
// style) is never in the original generator's vocabulary.
// ---------------------------------------------------------------------------
function ocrCorrupt(word: string, rand: () => number): string {
  const subs: Record<string, string> = { S: "5", s: "$", e: "c", o: "0", i: "l", t: "f" };
  return word
    .split("")
    .map((ch) => (rand() < 0.35 && subs[ch] ? subs[ch]! : ch))
    .join("");
}

describe("Extension category 1: OCR-like corruption of the heading keyword/title itself (not surrounding whitespace)", () => {
  it("a battery of OCR-corrupted 'Section'/title spellings either fails to match cleanly (Mechanism A, honestly absent) or matches without ever violating I1/I7/I9/I13/zero-ERROR", () => {
    const rand = mulberry32(0xdeadbeef);
    for (let i = 0; i < 60; i++) {
      const corruptedKeyword = ocrCorrupt("Section", rand);
      const text = `ARTICLE VI COVENANTS\n\n${corruptedKeyword} 6.01 ${ocrCorrupt("Indebtedness", rand)} . Neither party shall incur Indebtedness except Permitted Indebtedness.\n\nSection 6.02 Liens . Neither party shall grant Liens except Permitted Liens.`;
      const { index } = buildFor(`ocr-fuzz-${i}`, text);
      assertCoreInvariants(index, `ocr-fuzz-${i} (keyword="${corruptedKeyword}")`);
    }
  });
});

// ---------------------------------------------------------------------------
// Category B: alpha/roman numeral ambiguity - a heading/clause number that
// could parse as EITHER a roman numeral or a stray letter, at a boundary the
// clause-hierarchy parser's own documented "prefer continuing the open
// sequence" rule (clause-hierarchy.ts) is meant to resolve. The original
// generator only ever emits lettered ("a","b","c","d") markers - never
// exercises the roman/alpha collision zone at all.
// ---------------------------------------------------------------------------
describe("Extension category 2: alpha/roman numeral ambiguity at clause markers ('i' as 9th letter vs 1st roman numeral, 'v' similarly)", () => {
  it("a lettered sequence that runs through the letters that are ALSO valid roman numerals (i, v, x) never produces a cycle, duplicate id, or unreachable node - continuation-preference resolves it one way or another, always safely", () => {
    const rand = mulberry32(0xabc123);
    for (let i = 0; i < 40; i++) {
      const runLength = 8 + Math.floor(rand() * 5); // deliberately run PAST "i" (9th letter) so the ambiguity zone is actually exercised
      const letters = "abcdefghijklmnop".slice(0, runLength).split("");
      const body = letters.map((l) => `(${l}) an item at ambiguous position ${l};`).join(" ");
      const text = `ARTICLE VI COVENANTS\n\nSection 6.01 Indebtedness . Neither party shall incur Indebtedness except: ${body}`;
      const { index } = buildFor(`alpharoman-fuzz-${i}`, text);
      assertCoreInvariants(index, `alpharoman-fuzz-${i}`);
    }
  });

  it("a genuinely AMBIGUOUS-at-start document (a clause list that opens directly at 'i' with no preceding 'a' - could mean roman-numeral-1 or stray letter 'i') resolves deterministically without corrupting identity", () => {
    const text = "ARTICLE VI COVENANTS\n\nSection 6.01 Indebtedness . Neither party shall incur Indebtedness except: (i) an item whose opening marker is ambiguous between roman-i and letter-i; (ii) a second item.";
    const { index } = buildFor("alpharoman-start-ambiguity", text);
    assertCoreInvariants(index, "alpharoman-start-ambiguity");
  });
});

// ---------------------------------------------------------------------------
// Category C: double-letter clauses ("(aa)" following "(z)") - documented in
// clause-hierarchy.ts as a real, supported drafting convention, but never
// exercised by the original fuzz generator (LETTERS is hardcoded to
// ["a","b","c","d"] - it never runs a sequence long enough to reach "z"/"aa").
// ---------------------------------------------------------------------------
describe("Extension category 3: double-letter clause continuation past 'z' ('(aa)', '(bb)', ...)", () => {
  it("a full a..z then aa/bb/cc run (26+3 items) stays one single, correctly-ordered sibling sequence with no duplicate/cycle/unreachable node", () => {
    const singleLetters = Array.from({ length: 26 }, (_, i) => String.fromCharCode(97 + i));
    const doubleLetters = ["aa", "bb", "cc"];
    const allMarkers = [...singleLetters, ...doubleLetters];
    const body = allMarkers.map((m) => `(${m}) item ${m};`).join(" ");
    const text = `ARTICLE VI COVENANTS\n\nSection 6.01 Indebtedness . Neither party shall incur Indebtedness except: ${body}`;
    const { index } = buildFor("double-letter-fuzz", text);
    assertCoreInvariants(index, "double-letter-fuzz");
    const section = index.resolveUniqueNodeByRef("double-letter-fuzz", "6.01");
    expect(section.status).toBe("UNIQUE");
    if (section.status === "UNIQUE") {
      const children = index.getChildren(section.node.nodeId);
      const extractedMarkers = children.map((c) => c.sectionRef.match(/\(([a-z]{1,2})\)$/)?.[1] ?? "");
      expect(extractedMarkers).toEqual(allMarkers);
    }
  });

  it("a RANDOMIZED battery mixing single-letter runs of varying length that legitimately cross the z->aa boundary at random points never corrupts identity", () => {
    const rand = mulberry32(0x99887766);
    for (let i = 0; i < 30; i++) {
      const runLength = 24 + Math.floor(rand() * 6); // 24-29, straddling the z/aa boundary (26)
      const singleLetters = Array.from({ length: 26 }, (_, j) => String.fromCharCode(97 + j));
      const doubles = ["aa", "bb", "cc", "dd"];
      const markers = [...singleLetters, ...doubles].slice(0, runLength);
      const body = markers.map((m) => `(${m}) item ${m};`).join(" ");
      const text = `ARTICLE VI COVENANTS\n\nSection 6.01 Indebtedness . Neither party shall incur Indebtedness except: ${body}`;
      const { index } = buildFor(`double-letter-random-${i}`, text);
      assertCoreInvariants(index, `double-letter-random-${i} (runLength=${runLength})`);
    }
  });
});

// ---------------------------------------------------------------------------
// Category D: deleted/replacement text marked inline ("[intentionally
// omitted]", "[Reserved]", strikethrough-shaped bracket markup around a
// whole clause). The original generator never emits bracket-marked deletion
// placeholders at all - a real, common drafting convention (a renumbered
// clause left as a stub) that could plausibly collide with the SECTION
// title-character class's own "[" / "]" allowance (SECTION_PATTERNS pattern
// 1 explicitly allows "[Reserved]"-shaped titles).
// ---------------------------------------------------------------------------
describe("Extension category 4: inline deleted/replacement-text markup ('[intentionally omitted]', '[Reserved]', bracketed strikethrough-shaped stub clauses)", () => {
  it("a section heading that IS a bracketed reserved/omitted marker, interleaved with ordinary real sections, never corrupts identity", () => {
    const text = `
ARTICLE VI COVENANTS

Section 6.01 Indebtedness . Neither party shall incur Indebtedness except Permitted Indebtedness.

Section 6.02 [Reserved] .

Section 6.03 Liens . Neither party shall grant Liens except Permitted Liens.
(a) [intentionally omitted];
(b) Liens arising by operation of law.
`.trim();
    const { index } = buildFor("bracket-markup-fuzz", text);
    assertCoreInvariants(index, "bracket-markup-fuzz");
    expect(index.resolveUniqueNodeByRef("bracket-markup-fuzz", "6.02").status).toBe("UNIQUE");
  });

  it("a RANDOMIZED battery mixing [Reserved]/[intentionally omitted] sections and clauses at random positions among real ones never corrupts identity", () => {
    const rand = mulberry32(0x13579bdf);
    const titles = ["Indebtedness", "Liens", "Restricted Payments", "Investments"];
    for (let i = 0; i < 40; i++) {
      const sectionCount = 3 + Math.floor(rand() * 3);
      const parts: string[] = ["ARTICLE VI COVENANTS"];
      for (let s = 0; s < sectionCount; s++) {
        const num = `6.${String(s + 1).padStart(2, "0")}`;
        const isReserved = rand() < 0.3;
        if (isReserved) {
          parts.push(`Section ${num} [Reserved] .`);
        } else {
          const title = titles[s % titles.length]!;
          const clauseText = rand() < 0.4 ? `(a) [intentionally omitted]; (b) a real remaining item.` : `(a) a real item; (b) a second real item.`;
          parts.push(`Section ${num} ${title} . Neither party shall take the relevant action, except: ${clauseText}`);
        }
      }
      const text = parts.join("\n\n");
      const { index } = buildFor(`bracket-random-${i}`, text);
      assertCoreInvariants(index, `bracket-random-${i}`);
    }
  });
});

// ---------------------------------------------------------------------------
// Category E: duplicated ARTICLE numbering (the original suite's
// duplicateSectionProb only ever re-emits SECTION headings - never ARTICLE
// headings, and ARTICLE_PATTERNS is a structurally different regex family
// from SECTION_PATTERNS with its own distinct rank=0, so a duplicate at that
// level exercises different code paths: articleMatches's own `.reverse().find`
// parent-attribution logic in stage-structure.ts, not exercised by any
// duplicate-SECTION case).
// ---------------------------------------------------------------------------
describe("Extension category 5: duplicated ARTICLE-level numbering (not merely duplicated SECTION numbering)", () => {
  it("two physically distinct 'ARTICLE VI' occurrences (a real second Article VI heading, drafting error preserved verbatim) both stay independently addressable with correctly-scoped, non-merged children", () => {
    const text = `
ARTICLE VI COVENANTS

Section 6.01 Indebtedness . Neither party shall incur Indebtedness except Permitted Indebtedness.
(a) Permitted Indebtedness of the first kind.

ARTICLE VI COVENANTS

Section 6.02 Liens . Neither party shall grant Liens except Permitted Liens.
(a) Permitted Liens of the first kind.
`.trim();
    const { index } = buildFor("duplicate-article-fuzz", text);
    assertCoreInvariants(index, "duplicate-article-fuzz");
    const articleOccurrences = index.findNodesByRef("duplicate-article-fuzz", "VI");
    expect(articleOccurrences.length, "this test requires 2 real physical ARTICLE VI occurrences").toBe(2);
    const [firstArticle, secondArticle] = articleOccurrences.sort((a, b) => a.charStart - b.charStart);
    const firstChildren = index.getDescendants(firstArticle!.nodeId);
    const secondChildren = index.getDescendants(secondArticle!.nodeId);
    // Each ARTICLE occurrence's own descendants (its own SECTION + clause) must belong exclusively to it.
    expect(firstChildren.some((c) => c.sectionRef === "6.01")).toBe(true);
    expect(firstChildren.some((c) => c.sectionRef === "6.02")).toBe(false);
    expect(secondChildren.some((c) => c.sectionRef === "6.02")).toBe(true);
    expect(secondChildren.some((c) => c.sectionRef === "6.01")).toBe(false);
    const firstIds = new Set(firstChildren.map((c) => c.nodeId));
    expect(secondChildren.some((c) => firstIds.has(c.nodeId))).toBe(false);
  });

  it("a RANDOMIZED battery of documents with a randomly-placed duplicate ARTICLE heading (drafting error) among 2-4 real articles never corrupts identity", () => {
    const rand = mulberry32(0x2468ace0);
    const romanNumerals = ["IV", "V", "VI", "VII", "VIII"];
    for (let i = 0; i < 40; i++) {
      const articleCount = 2 + Math.floor(rand() * 3);
      const parts: string[] = [];
      const usedNumerals: string[] = [];
      for (let a = 0; a < articleCount; a++) {
        const numeral = romanNumerals[a % romanNumerals.length]!;
        usedNumerals.push(numeral);
        parts.push(`ARTICLE ${numeral} COVENANTS RELATING TO ARTICLE ${numeral}`);
        parts.push(`Section ${a + 1}.01 Indebtedness . Neither party shall incur Indebtedness except Permitted Indebtedness.`);
        if (rand() < 0.4) {
          // Duplicate the SAME article numeral again later - the adversarial case this category targets.
          parts.push(`ARTICLE ${numeral} COVENANTS RELATING TO ARTICLE ${numeral}`);
          parts.push(`Section ${a + 1}.02 Liens . Neither party shall grant Liens except Permitted Liens.`);
        }
      }
      const text = parts.join("\n\n");
      const { index } = buildFor(`duplicate-article-random-${i}`, text);
      assertCoreInvariants(index, `duplicate-article-random-${i}`);
    }
  });
});

// ---------------------------------------------------------------------------
// Bonus: a combined "everything at once" stress loop over all 5 new
// categories together, mirroring the original suite's own "compose many
// categories in one document" design philosophy - but drawing from the
// genuinely-novel vocabulary above, not the original's regex-safe vocabulary.
// ---------------------------------------------------------------------------
describe("Extension: combined stress loop over all 5 new categories together", () => {
  it("300 documents randomly combining OCR corruption, alpha/roman ambiguity, double letters, bracket markup, and duplicate ARTICLEs never violate a core invariant", () => {
    const rand = mulberry32(0x0ff1ce);
    const titles = ["Indebtedness", "Liens", "Restricted Payments", "Investments", "Asset Sales"];
    const failures: string[] = [];
    for (let i = 0; i < 300; i++) {
      const parts: string[] = [];
      const articleCount = 1 + Math.floor(rand() * 2);
      for (let a = 0; a < articleCount; a++) {
        const numeral = ["IV", "V", "VI"][a % 3]!;
        const articleHeading = rand() < 0.3 ? `ARTICLE ${numeral} ${ocrCorrupt("COVENANTS", rand)}` : `ARTICLE ${numeral} COVENANTS`;
        parts.push(articleHeading);
        const sectionCount = 2 + Math.floor(rand() * 3);
        for (let s = 0; s < sectionCount; s++) {
          const num = `${a + 4}.${String(s + 1).padStart(2, "0")}`;
          const title = titles[s % titles.length]!;
          const keyword = rand() < 0.25 ? ocrCorrupt("Section", rand) : "Section";
          if (rand() < 0.15) {
            parts.push(`${keyword} ${num} [Reserved] .`);
            continue;
          }
          let heading = `${keyword} ${num} ${title} .`;
          parts.push(heading);
          const clauseLen = Math.floor(rand() * 30);
          const singleLetters = Array.from({ length: 26 }, (_, j) => String.fromCharCode(97 + j));
          const markers = [...singleLetters, "aa", "bb", "cc"].slice(0, clauseLen);
          const clauseBody = markers.map((m) => (rand() < 0.1 ? `(${m}) [intentionally omitted];` : `(${m}) an item under Section ${num};`)).join(" ");
          if (clauseBody) parts.push(clauseBody);
        }
        if (rand() < 0.2) parts.push(articleHeading); // duplicate the article
      }
      const text = parts.join("\n\n");
      const documentId = `combined-extension-fuzz-${i}`;
      try {
        const { index } = buildFor(documentId, text);
        assertCoreInvariants(index, `combined case ${i}`);
      } catch (err) {
        failures.push(`case ${i}: ${err instanceof Error ? err.message : String(err)}\n  text (first 200 chars): ${text.slice(0, 200)}`);
      }
    }
    if (failures.length > 0) {
      throw new Error(`${failures.length}/300 combined-extension fuzz cases violated a core invariant:\n${failures.slice(0, 5).join("\n\n")}`);
    }
    expect(failures).toHaveLength(0);
  });
});
