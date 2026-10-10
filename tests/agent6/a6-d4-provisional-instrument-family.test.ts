/**
 * A6-D4 — REVIEW_REQUIRED amendments associate into the correct instrument
 * family without being treated as operatively confirmed.
 */
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { buildPackageGraph } from "@/lib/contract-model/compiler/package-graph/pipeline";
import {
  groupPackageIntoInstruments,
  isAssociativeGroupingEdge,
  isLegallyConfirmedAmendmentChain,
  isTrustedGroupingEdge,
  mayConsolidateOperativeAgreement,
} from "@/lib/contract-model/compiler/package-graph/instrument-grouping";
import type { DocumentClassification, RelationshipCandidate } from "@/lib/contract-model/compiler/package-graph/types";

const ROOT = "tests/fixtures/authentic-packages";

function loadPackage(companyKey: string) {
  const manifest = JSON.parse(readFileSync(join(ROOT, companyKey, "package-manifest.json"), "utf8")) as {
    documents: Array<{ documentId: string; file: string; label: string }>;
  };
  return manifest.documents.map((d) => ({
    documentId: d.documentId,
    label: d.label,
    text: readFileSync(join(ROOT, companyKey, "extracted-text", d.file), "utf8"),
  }));
}

const ca: DocumentClassification = {
  documentId: "ca",
  type: "CREDIT_AGREEMENT",
  confidence: 0.9,
  evidence: [],
  resolutionMethod: "DETERMINISTIC_TITLE_PATTERN",
};
const am: DocumentClassification = {
  documentId: "am",
  type: "AMENDMENT",
  confidence: 0.9,
  evidence: [],
  resolutionMethod: "DETERMINISTIC_TITLE_PATTERN",
};

describe("A6-D4 provisional instrument family association", () => {
  it("REVIEW_REQUIRED + SUPPORTING AMENDS associates amendment with base and marks PROVISIONAL_FAMILY", () => {
    const rels: RelationshipCandidate[] = [
      {
        sourceDocumentId: "am",
        targetDocumentId: "ca",
        targetHint: "Credit Agreement dated as of May 31, 2023",
        relationshipType: "AMENDS",
        sourceCitation: "WHEREAS",
        confidence: 0.6,
        status: "REVIEW_REQUIRED",
        unresolvedReason: "supporting-strength WHEREAS evidence",
        resolutionMethod: "DETERMINISTIC_TITLE_DATE_MATCH",
        evidenceClass: "SUPPORTING_TARGET_EVIDENCE",
      },
    ];
    expect(isTrustedGroupingEdge(rels[0]!)).toBe(false);
    expect(isAssociativeGroupingEdge(rels[0]!)).toBe(true);

    const result = groupPackageIntoInstruments(["ca", "am"], [ca, am], [], rels);
    expect(result).toHaveLength(1);
    expect(result[0]!.documentIds.sort()).toEqual(["am", "ca"]);
    expect(result[0]!.baseDocumentId).toBe("ca");
    expect(result[0]!.reviewStatus).toBe("REVIEW_REQUIRED");
    expect(result[0]!.associationKind).toBe("PROVISIONAL_FAMILY");
    expect(result[0]!.provisionalDocumentIds).toEqual(["am"]);
  });

  it("preserves defense-in-depth: RESOLVED + SUPPORTING still does not group", () => {
    const rels: RelationshipCandidate[] = [
      {
        sourceDocumentId: "am",
        targetDocumentId: "ca",
        targetHint: "hint",
        relationshipType: "AMENDS",
        sourceCitation: "cite",
        confidence: 0.95,
        status: "RESOLVED",
        unresolvedReason: null,
        resolutionMethod: "DETERMINISTIC_TITLE_DATE_MATCH",
        evidenceClass: "SUPPORTING_TARGET_EVIDENCE",
      },
    ];
    const result = groupPackageIntoInstruments(["ca", "am"], [ca, am], [], rels);
    expect(result).toHaveLength(2);
    expect(result.every((r) => r.documentIds.length === 1)).toBe(true);
  });

  it("CONTEXTUAL_MENTION_ONLY REVIEW_REQUIRED does not associate", () => {
    const rels: RelationshipCandidate[] = [
      {
        sourceDocumentId: "am",
        targetDocumentId: "ca",
        targetHint: "hint",
        relationshipType: "AMENDS",
        sourceCitation: "cite",
        confidence: 0.5,
        status: "REVIEW_REQUIRED",
        unresolvedReason: "contextual",
        resolutionMethod: "DETERMINISTIC_TYPE_ONLY_MATCH",
        evidenceClass: "CONTEXTUAL_MENTION_ONLY",
      },
    ];
    expect(isAssociativeGroupingEdge(rels[0]!)).toBe(false);
    const result = groupPackageIntoInstruments(["ca", "am"], [ca, am], [], rels);
    expect(result).toHaveLength(2);
  });

  it("missing-base UNRESOLVED AMENDS does not attach historical amendments to a later restatement", () => {
    const docs: DocumentClassification[] = [
      { documentId: "am1", type: "AMENDMENT", confidence: 0.9, evidence: [], resolutionMethod: "DETERMINISTIC_TITLE_PATTERN" },
      { documentId: "am3", type: "AMENDMENT", confidence: 0.9, evidence: [], resolutionMethod: "DETERMINISTIC_TITLE_PATTERN" },
      {
        documentId: "ar2",
        type: "AMENDED_AND_RESTATED_AGREEMENT",
        confidence: 0.9,
        evidence: [],
        resolutionMethod: "DETERMINISTIC_TITLE_PATTERN",
      },
    ];
    const rels: RelationshipCandidate[] = [
      {
        sourceDocumentId: "am1",
        targetDocumentId: null,
        targetHint: "prior A&R dated December 21, 2021",
        relationshipType: "AMENDS",
        sourceCitation: "cite",
        confidence: 0.4,
        status: "UNRESOLVED",
        unresolvedReason: "referenced agreement not in package",
        resolutionMethod: "DETERMINISTIC_TYPE_ONLY_CHRONOLOGICALLY_IMPOSSIBLE",
        evidenceClass: "SUPPORTING_TARGET_EVIDENCE",
      },
      {
        sourceDocumentId: "am3",
        targetDocumentId: null,
        targetHint: "prior A&R",
        relationshipType: "AMENDS",
        sourceCitation: "cite",
        confidence: 0.4,
        status: "UNRESOLVED",
        unresolvedReason: "referenced agreement not in package",
        resolutionMethod: "DETERMINISTIC_TYPE_ONLY_CHRONOLOGICALLY_IMPOSSIBLE",
        evidenceClass: "SUPPORTING_TARGET_EVIDENCE",
      },
    ];
    const result = groupPackageIntoInstruments(["am1", "am3", "ar2"], docs, [], rels);
    expect(result).toHaveLength(3);
    expect(result.find((r) => r.baseDocumentId === "ar2")!.documentIds).toEqual(["ar2"]);
  });

  it("dual instruments: credit AMENDS does not pull an indenture into the facility family", () => {
    const docs: DocumentClassification[] = [
      ca,
      am,
      {
        documentId: "ind",
        type: "INDENTURE",
        confidence: 0.9,
        evidence: [],
        resolutionMethod: "DETERMINISTIC_TITLE_PATTERN",
      },
    ];
    const rels: RelationshipCandidate[] = [
      {
        sourceDocumentId: "am",
        targetDocumentId: "ca",
        targetHint: "CA",
        relationshipType: "AMENDS",
        sourceCitation: "cite",
        confidence: 0.95,
        status: "RESOLVED",
        unresolvedReason: null,
        resolutionMethod: "DETERMINISTIC_TITLE_DATE_MATCH",
        evidenceClass: "STRONG_TARGET_EVIDENCE",
      },
    ];
    const result = groupPackageIntoInstruments(["ca", "am", "ind"], docs, [], rels);
    expect(result).toHaveLength(2);
    const facility = result.find((r) => r.baseDocumentId === "ca")!;
    expect(facility.documentIds.sort()).toEqual(["am", "ca"]);
    expect(facility.associationKind).toBe("CONFIRMED");
    expect(facility.reviewStatus).toBe("RESOLVED");
    expect(result.find((r) => r.baseDocumentId === "ind")!.documentIds).toEqual(["ind"]);
  });

  it("Knife River authentic package: First+Second Amendments provisionally join the CA instrument", () => {
    const docs = loadPackage("knife-river-2023-2026");
    const graph = buildPackageGraph("agent6-kr", "knife-river-2023-2026", docs);
    const amends = graph.relationshipCandidates.filter((r) => r.relationshipType === "AMENDS");
    expect(amends.length).toBeGreaterThanOrEqual(2);
    expect(amends.every((r) => r.status === "REVIEW_REQUIRED")).toBe(true);
    expect(amends.every((r) => r.targetDocumentId === "doc-a")).toBe(true);

    const facility = graph.instruments.find((i) => i.baseDocumentId === "doc-a");
    expect(facility).toBeTruthy();
    expect(facility!.documentIds.sort()).toEqual(["doc-a", "doc-b", "doc-c"]);
    expect(facility!.reviewStatus).toBe("REVIEW_REQUIRED");
    expect(facility!.associationKind).toBe("PROVISIONAL_FAMILY");
    expect(facility!.provisionalDocumentIds?.sort()).toEqual(["doc-b", "doc-c"]);
    // Relationship status itself is unchanged — not force-resolved.
    expect(amends.every((r) => r.status === "REVIEW_REQUIRED")).toBe(true);
    // Provisional family must never be mistaken for a confirmed amendment chain
    // or consolidated operative agreement.
    expect(isLegallyConfirmedAmendmentChain(facility!)).toBe(false);
    expect(mayConsolidateOperativeAgreement(facility!)).toBe(false);
  });

  it("CONFIRMED RESOLVED dual-doc facility may consolidate; PROVISIONAL_FAMILY may not", () => {
    const confirmed = {
      associationKind: "CONFIRMED" as const,
      reviewStatus: "RESOLVED" as const,
      provisionalDocumentIds: [] as string[],
    };
    const provisional = {
      associationKind: "PROVISIONAL_FAMILY" as const,
      reviewStatus: "REVIEW_REQUIRED" as const,
      provisionalDocumentIds: ["am"],
    };
    expect(isLegallyConfirmedAmendmentChain(confirmed)).toBe(true);
    expect(mayConsolidateOperativeAgreement(confirmed)).toBe(true);
    expect(isLegallyConfirmedAmendmentChain(provisional)).toBe(false);
    expect(mayConsolidateOperativeAgreement(provisional)).toBe(false);
  });

  it.skipIf(!existsSync(join(ROOT, "insulet-2021-2026", "package-manifest.json")))(
    "Insulet authentic package: credit+ninth amendment confirmed; indenture separate",
    () => {
      const docs = loadPackage("insulet-2021-2026");
      const graph = buildPackageGraph("agent6-in", "insulet-2021-2026", docs);
      const credit = graph.instruments.find((i) => i.baseDocumentId === "doc-a");
      const indenture = graph.instruments.find((i) => i.baseDocumentId === "doc-b");
      expect(credit!.documentIds.sort()).toEqual(["doc-a", "doc-c"]);
      expect(credit!.associationKind).toBe("CONFIRMED");
      expect(indenture!.documentIds).toEqual(["doc-b"]);
    },
  );

  it.skipIf(!existsSync(join(ROOT, "benchmark-2025", "package-manifest.json")))(
    "Benchmark authentic package: Second A&R stays alone; historical amendments do not attach",
    () => {
      const docs = loadPackage("benchmark-2025");
      const graph = buildPackageGraph("agent6-be", "benchmark-2025", docs);
      const secondAr = graph.instruments.find((i) => i.baseDocumentId === "doc-c");
      expect(secondAr!.documentIds).toEqual(["doc-c"]);
      // Amendments targeting a missing prior A&R must not contaminate the Second A&R.
      expect(
        graph.instruments.filter((i) => i.documentIds.includes("doc-a")).every((i) => !i.documentIds.includes("doc-c")),
      ).toBe(true);
    },
  );
});
