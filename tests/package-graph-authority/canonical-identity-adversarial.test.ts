/**
 * HEADROOM-3 Scope A/E — canonical instrument identity adversarial suite.
 * Pure in-memory: provisional bridges must never union-find merge instruments
 * or populate confirmed membership used for Document.instrumentId.
 */
import { describe, expect, it } from "vitest";
import {
  discoveryAssociatedDocumentIds,
  groupPackageIntoInstruments,
  isAssociativeGroupingEdge,
  isLegallyConfirmedAmendmentChain,
  isTrustedGroupingEdge,
  mayConsolidateOperativeAgreement,
} from "@/lib/contract-model/compiler/package-graph/instrument-grouping";
import { planConfirmedInstrumentMembership } from "@/lib/contract-model/compiler/package-graph/persistence";
import type {
  DocumentClassification,
  RelationshipCandidate,
} from "@/lib/contract-model/compiler/package-graph/types";

const cls = (documentId: string, type: DocumentClassification["type"]): DocumentClassification => ({
  documentId,
  type,
  confidence: 0.9,
  evidence: [],
  resolutionMethod: "DETERMINISTIC_TITLE_PATTERN",
});

function trustedAmends(source: string, target: string): RelationshipCandidate {
  return {
    sourceDocumentId: source,
    targetDocumentId: target,
    targetHint: "trusted",
    relationshipType: "AMENDS",
    sourceCitation: "Section 1 is hereby amended",
    confidence: 0.95,
    status: "RESOLVED",
    unresolvedReason: null,
    resolutionMethod: "DETERMINISTIC_TITLE_DATE_MATCH",
    evidenceClass: "STRONG_TARGET_EVIDENCE",
  };
}

function provisionalAmends(source: string, target: string): RelationshipCandidate {
  return {
    sourceDocumentId: source,
    targetDocumentId: target,
    targetHint: "provisional",
    relationshipType: "AMENDS",
    sourceCitation: "WHEREAS the parties wish to amend",
    confidence: 0.6,
    status: "REVIEW_REQUIRED",
    unresolvedReason: "supporting evidence only",
    resolutionMethod: "DETERMINISTIC_TITLE_DATE_MATCH",
    evidenceClass: "SUPPORTING_TARGET_EVIDENCE",
  };
}

function rejectedAmends(source: string, target: string): RelationshipCandidate {
  return {
    sourceDocumentId: source,
    targetDocumentId: target,
    targetHint: "rejected",
    relationshipType: "AMENDS",
    sourceCitation: "without amending such Indenture in any way",
    confidence: 0.1,
    status: "UNRESOLVED",
    unresolvedReason: "NEGATIVE_EVIDENCE",
    resolutionMethod: "DETERMINISTIC_NEGATIVE",
    evidenceClass: "NEGATIVE_EVIDENCE",
  };
}

describe("HEADROOM-3 canonical identity — provisional must not contaminate confirmed", () => {
  it("provisional bridge joining unrelated instruments stays separate + blocked", () => {
    const classifications = [
      cls("ca-a", "CREDIT_AGREEMENT"),
      cls("am-a", "AMENDMENT"),
      cls("ca-b", "CREDIT_AGREEMENT"),
      cls("am-b", "AMENDMENT"),
    ];
    const rels = [
      trustedAmends("am-a", "ca-a"),
      trustedAmends("am-b", "ca-b"),
      provisionalAmends("am-a", "ca-b"),
    ];
    expect(isTrustedGroupingEdge(rels[0]!)).toBe(true);
    expect(isAssociativeGroupingEdge(rels[2]!)).toBe(true);

    const result = groupPackageIntoInstruments(["ca-a", "am-a", "ca-b", "am-b"], classifications, [], rels);
    expect(result).toHaveLength(2);
    const instA = result.find((i) => i.baseDocumentId === "ca-a")!;
    const instB = result.find((i) => i.baseDocumentId === "ca-b")!;
    expect(instA.documentIds.sort()).toEqual(["am-a", "ca-a"]);
    expect(instB.documentIds.sort()).toEqual(["am-b", "ca-b"]);
    expect(instA.documentIds).not.toContain("ca-b");
    expect(
      [...(instA.provisionalBridgeBlockers ?? []), ...(instB.provisionalBridgeBlockers ?? [])].some(
        (b) => b.reason === "BRIDGES_CONFIRMED_INSTRUMENTS",
      ),
    ).toBe(true);
    const plan = planConfirmedInstrumentMembership({ instruments: result });
    expect(plan.confirmedDocumentToInstrumentKey.get("am-a")).toBe(instA.instrumentKey);
    expect(plan.confirmedDocumentToInstrumentKey.get("am-a")).not.toBe(instB.instrumentKey);
  });

  it("confirmed bridge merges membership into one instrument", () => {
    const classifications = [cls("ca", "CREDIT_AGREEMENT"), cls("am", "AMENDMENT")];
    const rels = [trustedAmends("am", "ca")];
    const result = groupPackageIntoInstruments(["ca", "am"], classifications, [], rels);
    expect(result).toHaveLength(1);
    expect(result[0]!.documentIds.sort()).toEqual(["am", "ca"]);
    expect(result[0]!.associationKind).toBe("CONFIRMED");
    expect(isLegallyConfirmedAmendmentChain(result[0]!)).toBe(true);
    expect(mayConsolidateOperativeAgreement(result[0]!)).toBe(true);
  });

  it("conflicting confirmed relationships (two bases) do not silently pick one parent", () => {
    // Two RESOLVED strong edges from one amendment to two different CAs —
    // union-find would merge everything; reviewStatus must surface multi-base.
    const classifications = [
      cls("ca-a", "CREDIT_AGREEMENT"),
      cls("ca-b", "CREDIT_AGREEMENT"),
      cls("am", "AMENDMENT"),
    ];
    const rels = [trustedAmends("am", "ca-a"), trustedAmends("am", "ca-b")];
    const result = groupPackageIntoInstruments(["ca-a", "ca-b", "am"], classifications, [], rels);
    expect(result).toHaveLength(1);
    // Single cluster with two unamended roots → REVIEW_REQUIRED (no silent base pick).
    expect(result[0]!.reviewStatus).toBe("REVIEW_REQUIRED");
    expect(isLegallyConfirmedAmendmentChain(result[0]!)).toBe(false);
    expect(mayConsolidateOperativeAgreement(result[0]!)).toBe(false);
  });

  it("wrong company / cross-package documents never share membership from provisional edges", () => {
    // Same in-memory package with two unrelated facilities — provisional
    // singleton association attaches to discovery only, not confirmed ids.
    const classifications = [
      cls("co1-ca", "CREDIT_AGREEMENT"),
      cls("co2-am", "AMENDMENT"),
    ];
    const rels = [provisionalAmends("co2-am", "co1-ca")];
    const result = groupPackageIntoInstruments(["co1-ca", "co2-am"], classifications, [], rels);
    const ca = result.find((i) => i.baseDocumentId === "co1-ca")!;
    const am = result.find((i) => i.baseDocumentId === "co2-am")!;
    expect(ca.documentIds).toEqual(["co1-ca"]);
    expect(ca.provisionalDocumentIds).toEqual(["co2-am"]);
    expect(ca.associationKind).toBe("PROVISIONAL_FAMILY");
    expect(am.documentIds).toEqual(["co2-am"]);
    expect(mayConsolidateOperativeAgreement(ca)).toBe(false);
    const plan = planConfirmedInstrumentMembership({ instruments: result });
    expect(plan.confirmedDocumentToInstrumentKey.get("co2-am")).toBe(am.instrumentKey);
    expect(plan.confirmedDocumentToInstrumentKey.get("co2-am")).not.toBe(ca.instrumentKey);
    expect(discoveryAssociatedDocumentIds(ca)).toEqual(["co1-ca", "co2-am"]);
  });

  it("rejected / negative evidence never creates membership or provisional association", () => {
    const classifications = [cls("ca", "CREDIT_AGREEMENT"), cls("am", "AMENDMENT")];
    const rels = [rejectedAmends("am", "ca")];
    const result = groupPackageIntoInstruments(["ca", "am"], classifications, [], rels);
    expect(result).toHaveLength(2);
    const ca = result.find((i) => i.baseDocumentId === "ca")!;
    expect(ca.provisionalDocumentIds ?? []).toEqual([]);
    expect(ca.documentIds).toEqual(["ca"]);
  });

  it("ambiguous multi-target provisional bridge attaches to none", () => {
    const classifications = [
      cls("ca-a", "CREDIT_AGREEMENT"),
      cls("ca-b", "CREDIT_AGREEMENT"),
      cls("am", "AMENDMENT"),
    ];
    const rels = [provisionalAmends("am", "ca-a"), provisionalAmends("am", "ca-b")];
    const result = groupPackageIntoInstruments(["ca-a", "ca-b", "am"], classifications, [], rels);
    const caA = result.find((i) => i.baseDocumentId === "ca-a")!;
    const caB = result.find((i) => i.baseDocumentId === "ca-b")!;
    expect(caA.provisionalDocumentIds ?? []).toEqual([]);
    expect(caB.provisionalDocumentIds ?? []).toEqual([]);
    expect(
      [...(caA.provisionalBridgeBlockers ?? []), ...(caB.provisionalBridgeBlockers ?? [])].some(
        (b) => b.reason === "AMBIGUOUS_MULTI_TARGET",
      ),
    ).toBe(true);
  });

  it("upgrade provisional → confirmed is deterministic; split restores singletons in the plan", () => {
    const classifications = [cls("ca", "CREDIT_AGREEMENT"), cls("am", "AMENDMENT")];
    const before = groupPackageIntoInstruments(["ca", "am"], classifications, [], [provisionalAmends("am", "ca")]);
    expect(before.find((i) => i.baseDocumentId === "ca")!.provisionalDocumentIds).toEqual(["am"]);

    const after = groupPackageIntoInstruments(["ca", "am"], classifications, [], [trustedAmends("am", "ca")]);
    expect(after).toHaveLength(1);
    expect(after[0]!.documentIds.sort()).toEqual(["am", "ca"]);
    expect(after[0]!.provisionalDocumentIds).toEqual([]);

    const split = groupPackageIntoInstruments(["ca", "am"], classifications, [], []);
    expect(split).toHaveLength(2);
    const plan = planConfirmedInstrumentMembership({ instruments: split });
    expect(plan.confirmedDocumentToInstrumentKey.get("am")).not.toBe(plan.confirmedDocumentToInstrumentKey.get("ca"));
  });

  it("graph cycle of trusted AMENDS edges still yields a finite cluster (union-find)", () => {
    // Synthetic cycle: am1→ca, am2→am1, am1→am2 via RESTATES — still terminates.
    const classifications = [
      cls("ca", "CREDIT_AGREEMENT"),
      cls("am1", "AMENDMENT"),
      cls("am2", "AMENDMENT"),
    ];
    const rels: RelationshipCandidate[] = [
      trustedAmends("am1", "ca"),
      trustedAmends("am2", "am1"),
      {
        ...trustedAmends("am1", "am2"),
        relationshipType: "RESTATES",
      },
    ];
    const result = groupPackageIntoInstruments(["ca", "am1", "am2"], classifications, [], rels);
    expect(result).toHaveLength(1);
    expect(result[0]!.documentIds.sort()).toEqual(["am1", "am2", "ca"]);
  });

  it("deterministic replay: identical inputs → identical instrument keys and membership", () => {
    const classifications = [
      cls("ca-a", "CREDIT_AGREEMENT"),
      cls("am-a", "AMENDMENT"),
      cls("ca-b", "CREDIT_AGREEMENT"),
      cls("orphan", "AMENDMENT"),
    ];
    const rels = [trustedAmends("am-a", "ca-a"), provisionalAmends("orphan", "ca-b")];
    const a = groupPackageIntoInstruments(
      ["ca-a", "am-a", "ca-b", "orphan"],
      classifications,
      [],
      rels,
    );
    const b = groupPackageIntoInstruments(
      ["ca-a", "am-a", "ca-b", "orphan"],
      classifications,
      [],
      rels,
    );
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});
