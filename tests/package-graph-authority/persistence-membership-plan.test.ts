/**
 * HEADROOM-3 Scope B — pure persistence membership / stale-clear / orphan
 * planning tests. No database. DB-backed EVALUATION fixture coverage lives in
 * persistence-identity.test.ts and only runs when HEADROOM3_ALLOW_EVAL_DB=1.
 */
import { describe, expect, it } from "vitest";
import { groupPackageIntoInstruments } from "@/lib/contract-model/compiler/package-graph/instrument-grouping";
import {
  planConfirmedInstrumentMembership,
  planStaleInstrumentIdClears,
} from "@/lib/contract-model/compiler/package-graph/persistence";
import type { DocumentClassification, RelationshipCandidate } from "@/lib/contract-model/compiler/package-graph/types";

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
    sourceCitation: "operative",
    confidence: 0.95,
    status: "RESOLVED",
    unresolvedReason: null,
    resolutionMethod: "DETERMINISTIC",
    evidenceClass: "STRONG_TARGET_EVIDENCE",
  };
}

function provisionalAmends(source: string, target: string): RelationshipCandidate {
  return {
    sourceDocumentId: source,
    targetDocumentId: target,
    targetHint: "provisional",
    relationshipType: "AMENDS",
    sourceCitation: "WHEREAS",
    confidence: 0.6,
    status: "REVIEW_REQUIRED",
    unresolvedReason: "supporting",
    resolutionMethod: "DETERMINISTIC",
    evidenceClass: "SUPPORTING_TARGET_EVIDENCE",
  };
}

describe("HEADROOM-3 persistence membership plan (no DB)", () => {
  it("provisional associations never appear in confirmed membership plan", () => {
    const classifications = [cls("ca", "CREDIT_AGREEMENT"), cls("am", "AMENDMENT")];
    const instruments = groupPackageIntoInstruments(
      ["ca", "am"],
      classifications,
      [],
      [provisionalAmends("am", "ca")],
    );
    const plan = planConfirmedInstrumentMembership({ instruments });
    expect(plan.confirmedDocumentToInstrumentKey.get("ca")).toBe("instrument:ca");
    expect(plan.confirmedDocumentToInstrumentKey.get("am")).toBe("instrument:am");
    expect(plan.confirmedDocumentToInstrumentKey.get("am")).not.toBe(plan.confirmedDocumentToInstrumentKey.get("ca"));
  });

  it("foreign company document ids are skipped from the plan", () => {
    const classifications = [
      cls("ca-a", "CREDIT_AGREEMENT"),
      cls("am-a", "AMENDMENT"),
      cls("foreign-ca", "CREDIT_AGREEMENT"),
    ];
    const instruments = groupPackageIntoInstruments(
      ["ca-a", "am-a", "foreign-ca"],
      classifications,
      [],
      [trustedAmends("am-a", "ca-a")],
    );
    const plan = planConfirmedInstrumentMembership(
      { instruments },
      { companyDocumentIds: new Set(["ca-a", "am-a"]) },
    );
    expect(plan.confirmedDocumentToInstrumentKey.has("foreign-ca")).toBe(false);
    expect(plan.currentBaseDocumentIds.has("foreign-ca")).toBe(false);
    expect(plan.skippedForeignDocumentIds).toContain("foreign-ca");
    expect(plan.confirmedDocumentToInstrumentKey.get("am-a")).toBe("instrument:ca-a");
  });

  it("stale clear plan removes contaminated provisional assignment on replay", () => {
    const classifications = [cls("ca", "CREDIT_AGREEMENT"), cls("am", "AMENDMENT")];
    const instruments = groupPackageIntoInstruments(
      ["ca", "am"],
      classifications,
      [],
      [provisionalAmends("am", "ca")],
    );
    const plan = planConfirmedInstrumentMembership({ instruments });
    const caKey = plan.confirmedDocumentToInstrumentKey.get("ca")!;
    // Simulate DB ids: ca→inst-ca, am wrongly → inst-ca
    const clears = planStaleInstrumentIdClears({
      companyDocumentIds: new Set(["ca", "am"]),
      confirmedDocumentIds: new Set(["ca"]), // only ca is confirmed on ca instrument; am is its own singleton
      currentAssignments: new Map([
        ["ca", "inst-ca"],
        ["am", "inst-ca"], // contamination
      ]),
      managedInstrumentIds: new Set(["inst-ca", "inst-am"]),
    });
    // am is confirmed on its singleton in the real plan — adjust to match
    // contamination against parent only:
    const clearsParentOnly = planStaleInstrumentIdClears({
      companyDocumentIds: new Set(["ca", "am"]),
      confirmedDocumentIds: new Set(
        [...plan.confirmedDocumentToInstrumentKey.entries()]
          .filter(([, key]) => key === caKey)
          .map(([id]) => id),
      ),
      currentAssignments: new Map([
        ["ca", "inst-ca"],
        ["am", "inst-ca"],
      ]),
      managedInstrumentIds: new Set(["inst-ca"]),
    });
    expect(clearsParentOnly).toEqual(["am"]);
    expect(clears).toEqual(["am"]);
  });

  it("orphan bases disappear from currentBaseDocumentIds after upgrade merge", () => {
    const classifications = [cls("ca", "CREDIT_AGREEMENT"), cls("am", "AMENDMENT")];
    const before = planConfirmedInstrumentMembership({
      instruments: groupPackageIntoInstruments(["ca", "am"], classifications, [], [provisionalAmends("am", "ca")]),
    });
    expect(before.currentBaseDocumentIds.has("am")).toBe(true);

    const after = planConfirmedInstrumentMembership({
      instruments: groupPackageIntoInstruments(["ca", "am"], classifications, [], [trustedAmends("am", "ca")]),
    });
    expect(after.currentBaseDocumentIds.has("am")).toBe(false);
    expect(after.currentBaseDocumentIds.has("ca")).toBe(true);
    expect(after.confirmedDocumentToInstrumentKey.get("am")).toBe("instrument:ca");
  });

  it("repeated planning is deterministic (replay consistency)", () => {
    const classifications = [
      cls("ca-a", "CREDIT_AGREEMENT"),
      cls("am-a", "AMENDMENT"),
      cls("ca-b", "CREDIT_AGREEMENT"),
    ];
    const rels = [trustedAmends("am-a", "ca-a"), provisionalAmends("am-a", "ca-b")];
    const instruments = groupPackageIntoInstruments(["ca-a", "am-a", "ca-b"], classifications, [], rels);
    const a = planConfirmedInstrumentMembership({ instruments });
    const b = planConfirmedInstrumentMembership({ instruments });
    expect([...a.confirmedDocumentToInstrumentKey.entries()].sort()).toEqual(
      [...b.confirmedDocumentToInstrumentKey.entries()].sort(),
    );
    expect([...a.currentBaseDocumentIds].sort()).toEqual([...b.currentBaseDocumentIds].sort());
  });
});
