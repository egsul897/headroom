/**
 * HEADROOM-6 — canonical body-anchor selection (TOC stub vs operative body).
 * Synthetic fixtures only; no WOR issuer-specific selectors.
 */
import { describe, expect, it } from "vitest";
import { createHash } from "crypto";
import {
  extractDefinedTermHints,
  isDefinitionsSectionNode,
  narrowDefinitionsSectionOperativeText,
  resolveCanonicalBodyAnchor,
} from "../../lib/contract-model/compiler/context-retrieval/body-anchor";
import { buildCovenantContextBundle } from "../../lib/contract-model/compiler/context-retrieval/pipeline";
import { RETRIEVAL_ALGORITHM_VERSION } from "../../lib/contract-model/compiler/context-retrieval/types";
import type { DiscoveredCandidate } from "../../lib/contract-model/compiler/discovery/types";
import { buildExactTermsByDocument, buildTestIndex, type TestDocument } from "./context-retrieval-test-utils";

function candidate(overrides: Partial<DiscoveredCandidate>): DiscoveredCandidate {
  return {
    discoveryId: "discovery-candidate:body-anchor",
    documentId: "doc1",
    structuralNodeKeys: [],
    structuralNodeIds: [],
    normalizedSourceRef: "6.01",
    families: ["INDEBTEDNESS"],
    role: "BASKET",
    roleRaw: "BASKET",
    roleNormalizationStatus: "VALID_CANONICAL",
    familiesRaw: ["INDEBTEDNESS"],
    familiesNormalizationStatus: "VALID_CANONICAL",
    description: "test",
    multipleRulesLikely: false,
    definedTermDependencyLikely: true,
    discoveryMethods: ["DETERMINISTIC_SIGNAL"],
    evidenceSignals: [],
    reviewStatus: "AUTO_ACCEPTED",
    confidence: 1,
    sourceCitation: "6.01",
    discoveryRunVersion: "test-v1",
    supersessionStatus: "UNKNOWN_SUPERSESSION_STATUS",
    supersessionReason: "test",
    ...overrides,
  };
}

/** Authentic EDGAR-style TOC stub + later operative body (same shape as WOR holdout, issuer-agnostic). */
const TOC_AND_BODY: TestDocument[] = [
  {
    documentId: "doc1",
    label: "CA",
    text: `TABLE OF CONTENTS

Section 6.01.

Limitation on Indebtedness

12

Section 6.02.

Restriction on Liens

13

ARTICLE VI
NEGATIVE COVENANTS

SECTION 6.01 Indebtedness. The Borrower will not, and will not permit any Restricted Subsidiary to, incur Indebtedness except:
(a) Indebtedness not exceeding $30,000,000 in the aggregate at any time;
(b) Indebtedness not in excess of 10% of Consolidated Net Tangible Assets.

SECTION 6.02 Liens. The Borrower will not create any Lien other than Permitted Liens.

SECTION 1.01 Defined Terms.
"Permitted Liens" means Liens securing Indebtedness permitted under Section 6.01(a).
"Consolidated Net Tangible Assets" means total assets minus intangibles.
"Restricted Subsidiary" means any Subsidiary that is not an Unrestricted Subsidiary.
"Indebtedness" means borrowed money.
"Subsidiary" means any subsidiary.
"Unrestricted Subsidiary" means a Subsidiary designated as unrestricted.
"Lien" means any lien or encumbrance.
"Borrower" means the company.
"Cash Equivalents" means cash and cash equivalents.
"Investment" means any investment.
`,
  },
];

describe("HEADROOM-6 canonical body anchors", () => {
  it("never selects the TOC stub when a longer operative body exists for the same sectionRef", () => {
    const index = buildTestIndex(TOC_AND_BODY);
    const resolution = resolveCanonicalBodyAnchor(index, "doc1", "6.01");
    expect(resolution.hadDuplicates).toBe(true);
    expect(resolution.status).toBe("SELECTED_BODY");
    expect(resolution.tocCollisionResolved).toBe(true);
    expect(resolution.selected).not.toBeNull();
    const text = index.getNodeText(resolution.selected!.nodeId, "DESCENDANTS");
    expect(text).toMatch(/\$30,000,000/);
    expect(text).not.toMatch(/\.{3,}/);
    expect(resolution.candidates.some((c) => c.classification === "TOC_OR_FURNITURE")).toBe(true);
    expect(resolution.candidates.some((c) => c.classification === "OPERATIVE_BODY")).toBe(true);
  });

  it("preserves all duplicate candidates as ambiguity evidence (never first-match only)", () => {
    const index = buildTestIndex(TOC_AND_BODY);
    const resolution = resolveCanonicalBodyAnchor(index, "doc1", "6.02");
    expect(resolution.candidates.length).toBeGreaterThanOrEqual(2);
    const ids = resolution.candidates.map((c) => c.nodeId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("context bundle built from canonical body includes operative economic language", () => {
    const index = buildTestIndex(TOC_AND_BODY);
    const exactTermsByDocument = buildExactTermsByDocument(TOC_AND_BODY);
    const body = resolveCanonicalBodyAnchor(index, "doc1", "6.01");
    const node = body.selected!;
    const bundle = buildCovenantContextBundle(
      {
        candidate: candidate({
          structuralNodeKeys: [node.nodeKey],
          structuralNodeIds: [node.nodeId],
          normalizedSourceRef: "6.01",
        }),
        packageKey: "pkg",
        companyId: "co",
        instrumentKey: null,
      },
      { index, packageGraph: null, exactTermsByDocument },
    );
    const operative = bundle.items.find((i) => i.type === "OPERATIVE_SOURCE");
    expect(operative?.excerptText).toMatch(/\$30,000,000/);
    expect(bundle.retrievalAlgorithmVersion).toBe(RETRIEVAL_ALGORITHM_VERSION);
    expect(bundle.contextManifest?.sufficiencyClassification).toBe(bundle.sufficiencyState);
  });

  it("naive emission-order first SECTION match is the TOC stub (diagnostic contrast)", () => {
    const index = buildTestIndex(TOC_AND_BODY);
    const matches = index.findNodesByRef("doc1", "6.01").filter((n) => n.nodeType === "SECTION");
    expect(matches.length).toBeGreaterThanOrEqual(2);
    const first = matches[0]!;
    const firstText = index.getNodeText(first.nodeId, "DESCENDANTS");
    const body = resolveCanonicalBodyAnchor(index, "doc1", "6.01").selected!;
    expect(first.nodeId).not.toBe(body.nodeId);
    expect(firstText.length).toBeLessThan(index.getNodeText(body.nodeId, "DESCENDANTS").length / 2);
  });

  it("definitions-section narrowing uses DEFINED_TERM hints instead of the whole article dump", () => {
    const index = buildTestIndex(TOC_AND_BODY);
    const section = resolveCanonicalBodyAnchor(index, "doc1", "1.01").selected!;
    expect(isDefinitionsSectionNode(index, section.nodeId)).toBe(true);
    const hints = extractDefinedTermHints({ evidenceSignals: ["DEFINED_TERM:Permitted Liens"], description: "Definition of Permitted Liens" });
    expect(hints).toContain("Permitted Liens");
    const narrowed = narrowDefinitionsSectionOperativeText(index, "doc1", section.nodeId, hints);
    expect(narrowed?.term).toBe("Permitted Liens");
    expect(narrowed!.text.length).toBeLessThan(index.getNodeText(section.nodeId, "DESCENDANTS").length);
    expect(narrowed!.text).toMatch(/Permitted Liens/);

    const exactTermsByDocument = buildExactTermsByDocument(TOC_AND_BODY);
    const bundle = buildCovenantContextBundle(
      {
        candidate: candidate({
          structuralNodeKeys: [section.nodeKey],
          structuralNodeIds: [section.nodeId],
          normalizedSourceRef: "1.01",
          families: ["OTHER"],
          evidenceSignals: ["DEFINED_TERM:Permitted Liens"],
          description: "Definition of Permitted Liens",
        }),
        packageKey: "pkg",
        companyId: "co",
        instrumentKey: null,
      },
      { index, packageGraph: null, exactTermsByDocument },
    );
    const operative = bundle.items.find((i) => i.type === "OPERATIVE_SOURCE")!;
    expect(operative.excerptText.length).toBeLessThan(5_000);
    expect(bundle.stopReasons.some((r) => r.includes("maxTextBudgetChars"))).toBe(false);
  });

  it("body-anchor selection is deterministic across repeated calls", () => {
    const index = buildTestIndex(TOC_AND_BODY);
    const a = resolveCanonicalBodyAnchor(index, "doc1", "6.01");
    const b = resolveCanonicalBodyAnchor(index, "doc1", "6.01");
    expect(a.selected?.nodeId).toBe(b.selected?.nodeId);
    expect(a.candidates.map((c) => c.nodeId)).toEqual(b.candidates.map((c) => c.nodeId));
    const ha = createHash("sha256").update(JSON.stringify(a.candidates)).digest("hex");
    const hb = createHash("sha256").update(JSON.stringify(b.candidates)).digest("hex");
    expect(ha).toBe(hb);
  });
});
