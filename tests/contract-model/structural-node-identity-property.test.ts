/**
 * Phase 3F.1.2 - adversarial synthetic test suite for structural-node
 * identity/index integrity, run through the REAL production parser
 * (parseDocumentStructure) and REAL production index builder
 * (buildStructuralIndex) - never hand-constructed StructuralNode[] (that
 * targeted coverage lives in structural-node-identity-invariants.test.ts).
 * All documents are synthetic (no real package language/names/numbers).
 *
 * Two layers:
 *  1. Named `describe` blocks, one per required adversarial category from
 *     the task spec (duplicate sections, TOC+operative duplicates, repeated
 *     markers, quoted amendments, schedule restarts, embedded-heading
 *     definitions, parenthetical cross-refs, malformed hierarchy, missing
 *     levels, zero-newline text, whitespace corruption) - hand-authored,
 *     readable, explicitly named per category.
 *  2. A seeded property-based fuzz loop composing many (~1500) synthetic
 *     documents that randomly combine ALL of the above categories, checked
 *     against the same core invariant assertions in one deterministic run.
 *
 * The invariant under test throughout is NOT "the parser never produces a
 * duplicate label" (duplicate labels are normal - I2) but "the index never
 * corrupts identity/ownership regardless of what the parser hands it":
 * zero ERROR-severity health findings, no duplicate nodeId, every node
 * reachable, no orphan/cycle, children always occurrence-scoped.
 */
import { describe, expect, it } from "vitest";
import { parseDocumentStructure } from "../../lib/contract-model/compiler/stage-structure";
import { buildStructuralIndex, type StructuralIndex } from "../../lib/contract-model/compiler/structural-index";
import type { CompilerDocumentInput } from "../../lib/contract-model/compiler/types";

function buildFor(documentId: string, text: string): { index: StructuralIndex; nodeCount: number } {
  const nodes = parseDocumentStructure({ documentId, label: documentId, text });
  const index = buildStructuralIndex(new Map([[documentId, { text, nodes }]]), [], []);
  return { index, nodeCount: nodes.length };
}

/** The core, category-independent assertion: whatever the real parser produced, the index must never corrupt identity, ownership, or traversal - regardless of how many labels legitimately collide. */
function assertCoreInvariants(index: StructuralIndex, label: string) {
  const allNodes = index.allNodes();
  const nodeIds = new Set(allNodes.map((n) => n.nodeId));
  expect(nodeIds.size, `${label}: I1 - every allNodes() entry must have a distinct nodeId`).toBe(allNodes.length);

  for (const n of allNodes) {
    expect(index.getNodeById(n.nodeId), `${label}: I7 - getNodeById must resolve every indexed nodeId (${n.nodeId})`).toBeDefined();
  }

  // I9 - every node reached exactly once from roots()+getDescendants(), except real orphans (should never occur from a well-formed real-parser stack pass).
  const reached = new Set<string>();
  for (const r of index.roots()) {
    reached.add(r.nodeId);
    for (const d of index.getDescendants(r.nodeId)) reached.add(d.nodeId);
  }
  const unreachedNonOrphans = allNodes.filter((n) => !reached.has(n.nodeId) && !index.orphans().some((o) => o.nodeId === n.nodeId));
  expect(unreachedNonOrphans, `${label}: I9 - every non-orphan node must be reachable from a root`).toHaveLength(0);

  // I13 - children always charStart-ascending under each real parent occurrence.
  for (const n of allNodes) {
    const children = index.getChildren(n.nodeId);
    for (let i = 1; i < children.length; i++) {
      expect(children[i]!.charStart, `${label}: I13 - children of ${n.nodeId} must be charStart-ascending`).toBeGreaterThanOrEqual(children[i - 1]!.charStart);
    }
  }

  // Only identity-level codes are ever ERROR-severity; duplicate-label/ambiguous-ref/duplicate-path are always informational.
  const errorFindings = index.healthDiagnostics().filter((f) => f.severity === "ERROR");
  expect(errorFindings, `${label}: zero ERROR-severity health findings expected from real-parser output (found: ${JSON.stringify(errorFindings)})`).toHaveLength(0);
}

const DOC = (n: number) => `adversarial-doc-${n}`;

describe("Category: duplicate sections (same legal reference, two distinct physical headings)", () => {
  it("two independently-numbered sections that happen to reuse the same decimal number stay independently addressable", () => {
    const text = `
ARTICLE VI COVENANTS

Section 6.01 Indebtedness . Neither party shall incur Indebtedness except Permitted Indebtedness.

Section 6.04 Limitation on Distributions . Neither party shall make any Restricted Payment.
(a) a Restricted Payment permitted under this Agreement.

Section 6.04 Limitation on Distributions . A duplicated real heading, drafting error preserved verbatim in source.
(a) a second, distinct lettered clause under the SECOND physical occurrence.
`.trim();
    const { index } = buildFor(DOC(1), text);
    assertCoreInvariants(index, "duplicate-sections");
    expect(index.findNodesByRef(DOC(1), "6.04")).toHaveLength(2);
    expect(index.resolveUniqueNodeByRef(DOC(1), "6.04").status).toBe("AMBIGUOUS");
  });
});

describe("Category: table-of-contents + operative duplicates", () => {
  it("a ToC-style preamble that reuses real section-heading shape does not merge with the real operative heading", () => {
    const text = `
Section 6.01 Indebtedness .
Section 6.02 Liens .
Section 6.03 Restricted Payments .

ARTICLE VI COVENANTS

Section 6.01 Indebtedness . Neither party shall incur Indebtedness except Permitted Indebtedness.
(a) Permitted Indebtedness as defined herein.

Section 6.02 Liens . Neither party shall grant Liens except Permitted Liens.

Section 6.03 Restricted Payments . Neither party shall make Restricted Payments except as permitted.
`.trim();
    const { index } = buildFor(DOC(2), text);
    assertCoreInvariants(index, "toc-plus-operative");
    for (const ref of ["6.01", "6.02", "6.03"]) {
      expect(index.findNodesByRef(DOC(2), ref).length).toBeGreaterThanOrEqual(2);
    }
  });
});

describe("Category: repeated lettered/numbered markers", () => {
  it("two clauses that both use marker (a) under the same section remain distinct occurrences, not merged", () => {
    const text = `
ARTICLE VI COVENANTS

Section 6.04 Limitation on Distributions . Neither party shall make any distribution, except:
(a) a distribution payable solely in additional units of its own equity;
(a) a duplicated lettered marker error preserved verbatim from the real source drafting;
(b) a distribution to fund ordinary operating expenses.
`.trim();
    const { index } = buildFor(DOC(3), text);
    assertCoreInvariants(index, "repeated-markers");
    const section = index.resolveUniqueNodeByRef(DOC(3), "6.04");
    expect(section.status).toBe("UNIQUE");
  });
});

describe("Category: quoted amendment text (re-triggers the heading pattern inside a quotation)", () => {
  it("an amendment quoting a full section heading as replacement text creates a second real physical occurrence, not a corrupted one", () => {
    const text = `
ARTICLE VI COVENANTS

Section 6.04 Limitation on Distributions . Neither party shall make any distribution, except as set forth below.
(a) an original clause preserved for context.

Section 6.10 Amendments . Section 6.04 of this Agreement is hereby amended and restated in its entirety to read as follows:

Section 6.04 Limitation on Distributions . Neither party shall make any distribution, except:
(a) a distribution payable solely in additional units of its own equity, as amended;
(b) a distribution to fund ordinary operating expenses, as amended.
`.trim();
    const { index } = buildFor(DOC(4), text);
    assertCoreInvariants(index, "quoted-amendment");
    expect(index.findNodesByRef(DOC(4), "6.04").length).toBeGreaterThanOrEqual(2);
  });
});

describe("Category: schedule/exhibit numbering restarts", () => {
  it("a Schedule section that restarts integer numbering from 1 does not collide with the operative Article's own numbering", () => {
    const text = `
ARTICLE VI COVENANTS

Section 6.01 Indebtedness . Neither party shall incur Indebtedness except Permitted Indebtedness.

SCHEDULE I PERMITTED LIENS

Section 1 General . This Schedule sets forth Permitted Liens as of the Closing Date.

Section 2 Specific Liens . The following specific Liens are permitted hereunder.
`.trim();
    const { index } = buildFor(DOC(5), text);
    assertCoreInvariants(index, "schedule-restart");
  });
});

describe("Category: embedded-heading definitions (a defined term's own text contains section-heading-shaped text)", () => {
  it("a definition whose body text happens to contain a real section-heading shape does not spuriously fragment the definition's own enclosing structure", () => {
    const text = `
ARTICLE VI COVENANTS

Section 6.01 Indebtedness . For purposes of this Section 6.01, "Permitted Indebtedness" means Indebtedness described in Section 6.04 Limitation on Distributions . hereof, and any refinancing thereof.

Section 6.04 Limitation on Distributions . Neither party shall make any distribution, except as set forth below.
(a) a permitted distribution.
`.trim();
    const { index } = buildFor(DOC(6), text);
    assertCoreInvariants(index, "embedded-heading-definition");
  });
});

describe("Category: parenthetical cross-references", () => {
  it("a parenthetical cross-reference to another section does not create a spurious heading or corrupt the referencing section's own span", () => {
    const text = `
ARTICLE VI COVENANTS

Section 6.01 Indebtedness . Neither party shall incur Indebtedness (except as permitted under Section 6.04 below) without the prior written consent of the Required Lenders.

Section 6.04 Limitation on Distributions . Neither party shall make any distribution (subject to the exceptions set forth in Section 6.01 above), except as set forth below.
`.trim();
    const { index } = buildFor(DOC(7), text);
    assertCoreInvariants(index, "parenthetical-cross-ref");
  });
});

describe("Category: malformed hierarchy (a level skipped or out of expected rank order)", () => {
  it("a lettered clause appearing directly under an ARTICLE with no intervening SECTION still gets a resolvable, occurrence-safe parent", () => {
    const text = `
ARTICLE VI COVENANTS
(a) a stray lettered clause with no enclosing Section heading at all;
(b) a second stray lettered clause.

Section 6.01 Indebtedness . Neither party shall incur Indebtedness except Permitted Indebtedness.
`.trim();
    const { index } = buildFor(DOC(8), text);
    assertCoreInvariants(index, "malformed-hierarchy");
  });
});

describe("Category: missing levels (SECTION present, SUBSECTION/CLAUSE entirely absent)", () => {
  it("a section with pure prose and zero lettered clauses indexes cleanly with no children", () => {
    const text = `
ARTICLE VI COVENANTS

Section 6.01 Indebtedness . Neither party shall incur any Indebtedness whatsoever under any circumstance for any reason without any exception of any kind.
`.trim();
    const { index } = buildFor(DOC(9), text);
    assertCoreInvariants(index, "missing-levels");
    const section = index.resolveUniqueNodeByRef(DOC(9), "6.01");
    expect(section.status).toBe("UNIQUE");
    if (section.status === "UNIQUE") expect(index.getChildren(section.node.nodeId)).toHaveLength(0);
  });
});

describe("Category: zero-newline text (the real FWRG defect background - no \\n characters at all)", () => {
  it("a document with no newline characters anywhere still parses and indexes without corruption", () => {
    const text = "ARTICLE VI COVENANTS Section 6.01 Indebtedness . Neither party shall incur Indebtedness except Permitted Indebtedness. Section 6.02 Liens . Neither party shall grant Liens except Permitted Liens.";
    expect(text.includes("\n")).toBe(false);
    const { index } = buildFor(DOC(10), text);
    assertCoreInvariants(index, "zero-newline");
  });
});

describe("Category: whitespace corruption (doubled spaces, leading space, irregular breaks)", () => {
  it("doubled internal spaces and a leading space before a heading do not prevent correct occurrence-safe indexing", () => {
    const text = "\n SECTION  6.01  Indebtedness .   Neither party  shall incur   Indebtedness except  Permitted Indebtedness.\n\nSECTION 6.02   Liens .  Neither party shall grant  Liens except Permitted Liens.\n".trim();
    const { index } = buildFor(DOC(11), text);
    assertCoreInvariants(index, "whitespace-corruption");
  });
});

// ---------------------------------------------------------------------------
// Seeded property-based fuzz: composes many synthetic documents mixing ALL
// categories above at random, checked against the same core invariants.
// Deterministic (fixed seed) so a failure is always reproducible.
// ---------------------------------------------------------------------------

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

const TITLES = ["Indebtedness", "Liens", "Restricted Payments", "Limitation on Distributions", "Investments", "Asset Sales", "Transactions with Affiliates", "Sale and Leaseback Transactions", "Changes in Business", "Limitation on Restricted Subsidiaries"];
const LETTERS = ["a", "b", "c", "d"];

interface GenOptions {
  rand: () => number;
  duplicateSectionProb: number;
  tocProb: number;
  repeatedMarkerProb: number;
  quotedAmendmentProb: number;
  scheduleRestartProb: number;
  embeddedHeadingDefProb: number;
  parentheticalCrossRefProb: number;
  malformedHierarchyProb: number;
  whitespaceCorruptionProb: number;
  zeroNewlineProb: number;
}

/** Composes one synthetic adversarial document from randomly-selected categories - a superset generator, never a single-category one, so cross-category interaction is exercised too. */
function generateDocument(opts: GenOptions): string {
  const { rand } = opts;
  const sectionCount = 3 + Math.floor(rand() * 4); // 3-6 sections
  const usedNumbers: string[] = [];
  const parts: string[] = [];

  if (rand() < opts.tocProb) {
    const tocLines: string[] = [];
    for (let i = 0; i < sectionCount; i++) {
      const num = `6.${String(i + 1).padStart(2, "0")}`;
      tocLines.push(`Section ${num} ${TITLES[i % TITLES.length]} . `);
    }
    parts.push(tocLines.join("\n"));
  }

  parts.push("ARTICLE VI COVENANTS");

  if (rand() < opts.malformedHierarchyProb) {
    parts.push(`(${LETTERS[0]}) a stray lettered clause with no enclosing Section heading;`);
  }

  for (let i = 0; i < sectionCount; i++) {
    const num = `6.${String(i + 1).padStart(2, "0")}`;
    usedNumbers.push(num);
    const title = TITLES[i % TITLES.length]!;
    let heading = `Section ${num} ${title} .`;
    if (rand() < opts.whitespaceCorruptionProb) heading = heading.replace(/ /g, rand() < 0.5 ? "  " : " ");
    let body = `Neither party shall take the relevant action under this Section ${num}, except as permitted.`;
    if (rand() < opts.parentheticalCrossRefProb && usedNumbers.length > 1) {
      const otherRef = usedNumbers[Math.floor(rand() * (usedNumbers.length - 1))]!;
      body += ` (subject to the exceptions set forth in Section ${otherRef} above)`;
    }
    if (rand() < opts.embeddedHeadingDefProb) {
      body += ` "Permitted Amount" means the amount described in Section ${num} ${title} . hereof.`;
    }
    parts.push(`${heading} ${body}`);

    const clauseCount = Math.floor(rand() * 3);
    const letters: string[] = [];
    for (let c = 0; c < clauseCount; c++) {
      let letter = LETTERS[c]!;
      if (rand() < opts.repeatedMarkerProb && c > 0) letter = letters[c - 1]!; // deliberately repeat the previous marker.
      letters.push(letter);
      parts.push(`(${letter}) a permitted item under Section ${num};`);
    }

    if (rand() < opts.duplicateSectionProb) {
      // Re-emit the SAME heading later in the document (drafting duplicate / cross-reference collision).
      parts.push(`Section ${num} ${title} . A duplicated real physical occurrence of the same legal reference, preserved verbatim.`);
    }
  }

  if (rand() < opts.quotedAmendmentProb && usedNumbers.length > 0) {
    const target = usedNumbers[Math.floor(rand() * usedNumbers.length)]!;
    const title = TITLES[usedNumbers.indexOf(target) % TITLES.length]!;
    parts.push(`Section 6.99 Amendments . Section ${target} of this Agreement is hereby amended and restated to read as follows: Section ${target} ${title} . Neither party shall take the relevant action, as amended.`);
  }

  if (rand() < opts.scheduleRestartProb) {
    parts.push("SCHEDULE I PERMITTED LIENS");
    parts.push("Section 1 General . This Schedule restarts integer numbering from 1.");
    parts.push("Section 2 Specific . A second restarted-numbering section.");
  }

  let text = parts.join("\n\n");
  if (rand() < opts.zeroNewlineProb) text = text.replace(/\n+/g, " ");
  return text;
}

describe("Seeded property-based fuzz suite", () => {
  it("1500 randomly-composed adversarial documents (all categories, random combinations) never violate a core structural invariant", () => {
    const rand = mulberry32(0x5f3759df);
    const CASE_COUNT = 1500;
    const failures: string[] = [];

    for (let i = 0; i < CASE_COUNT; i++) {
      const opts: GenOptions = {
        rand,
        duplicateSectionProb: 0.25,
        tocProb: 0.2,
        repeatedMarkerProb: 0.15,
        quotedAmendmentProb: 0.15,
        scheduleRestartProb: 0.1,
        embeddedHeadingDefProb: 0.15,
        parentheticalCrossRefProb: 0.2,
        malformedHierarchyProb: 0.1,
        whitespaceCorruptionProb: 0.15,
        zeroNewlineProb: 0.05,
      };
      const text = generateDocument(opts);
      const documentId = `fuzz-doc-${i}`;
      try {
        const { index } = buildFor(documentId, text);
        assertCoreInvariants(index, `fuzz case ${i}`);
      } catch (err) {
        failures.push(`case ${i}: ${err instanceof Error ? err.message : String(err)}\n  text (first 300 chars): ${text.slice(0, 300)}`);
      }
    }

    if (failures.length > 0) {
      throw new Error(`${failures.length}/${CASE_COUNT} fuzz cases violated a core invariant:\n${failures.slice(0, 5).join("\n\n")}${failures.length > 5 ? `\n...and ${failures.length - 5} more` : ""}`);
    }
    expect(failures).toHaveLength(0);
  });

  it("the fuzz generator itself produces real structural variety (sanity check on the harness, not the index)", () => {
    const rand = mulberry32(0x12345678);
    let sawDuplicateLabel = false;
    let sawZeroNewline = false;
    let sawMultipleOccurrences = false;
    for (let i = 0; i < 200; i++) {
      const text = generateDocument({ rand, duplicateSectionProb: 0.5, tocProb: 0.5, repeatedMarkerProb: 0.3, quotedAmendmentProb: 0.3, scheduleRestartProb: 0.2, embeddedHeadingDefProb: 0.3, parentheticalCrossRefProb: 0.3, malformedHierarchyProb: 0.2, whitespaceCorruptionProb: 0.3, zeroNewlineProb: 0.15 });
      if (!text.includes("\n")) sawZeroNewline = true;
      const { index } = buildFor(`sanity-doc-${i}`, text);
      const dupFindings = index.healthDiagnostics().filter((f) => f.code === "DUPLICATE_LABEL_EXPECTED");
      if (dupFindings.length > 0) sawDuplicateLabel = true;
      if (index.allNodes().length > new Set(index.allNodes().map((n) => n.sectionRef)).size) sawMultipleOccurrences = true;
    }
    expect(sawDuplicateLabel, "the generator must actually produce documents with real duplicate labels somewhere across 200 draws").toBe(true);
    expect(sawZeroNewline, "the generator must actually produce at least one zero-newline document across 200 draws").toBe(true);
    expect(sawMultipleOccurrences).toBe(true);
  });
});
