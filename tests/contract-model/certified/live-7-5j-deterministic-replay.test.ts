/**
 * §7.5(j) LIVE-EXPOSED DETERMINISTIC DEFECT CLOSURE - the frozen live artifacts replayed offline (zero provider calls).
 *
 * The live evidence under docs/phase-3-live-validation/7.5j-end-to-end-certification/ is immutable and sha256-pinned in
 * scripts/phase-3-live-validation/replay-7-5j-deterministic.ts; the recorded live verdict PHASE3_7_5_J_SEMANTIC_FAILURE
 * stays historical truth. BEFORE is read from the frozen artifacts; AFTER is recomputed from the same frozen inputs by the
 * corrected deterministic layers (semantic-accountability.v8, canonical-action-ontology.v2, compiler v10). The reviewer is
 * a scripted stand-in returning the live reviewer's recorded zero findings - deterministic layers only. The frozen model
 * output is NOT a desired-output fixture: its genuine gaps are asserted to REMAIN.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { replayFrozen75j, verifyFrozenHashes } from "../../../scripts/phase-3-live-validation/replay-7-5j-deterministic";

let r: Awaited<ReturnType<typeof replayFrozen75j>>;
beforeAll(async () => { r = await replayFrozen75j(); }, 120_000);

describe("frozen §7.5(j) evidence is immutable", () => {
  it("every pinned frozen input still has the hash recorded at closure time", () => {
    for (const h of verifyFrozenHashes()) expect([h.file, h.ok]).toEqual([h.file, true]);
    expect(r.target).toMatchObject({ id: "discovery-candidate:5aeac47ab31feb23331e4f89", operativeSourceSha256: "8d1c29327e0160779376dd6cabcded250db8779bd762cf9586d7603f43270cae", chars: 508 });
  });
});

describe("defect A - coverage (BEFORE from the frozen inventory, AFTER recomputed over the same items)", () => {
  it("BEFORE: the frozen inventory left [4,43) and [104,132) UNACCOUNTED although a CRITICAL item spans [0,132)", () => {
    expect(r.defectA.before.unaccountedSource.map((s) => s.span)).toEqual([[4, 43], [104, 132]]);
    expect(r.defectA.before.criticalItemSpanningThem.map((x) => [x[1], x[2], x[3]])).toEqual([[0, 132, "CRITICAL"]]);
    expect(r.defectA.before.inventoryStatus).toBe("INVENTORY_COVERAGE_GAP");
  });
  it("AFTER: no stretch remains unaccounted merely because the item began on the '(j)' line; no value is uninventoried", () => {
    expect(r.defectA.after.unaccountedSource).toEqual([]);
    expect(r.defectA.after.unaccountedValues).toEqual([]);
    expect(r.defectA.after.countsByDisposition.UNACCOUNTED_SOURCE).toBe(0);
  });
});

describe("defect B - quantitative source authority", () => {
  it("BEFORE: three THRESHOLD items carried an OTHER duplicate of a scanner-typed figure and were MISSING_FROM_COMPOSITION for that reason alone", () => {
    expect(r.defectB.before.map((i) => [i.role, i.frozenDisposition])).toEqual([["THRESHOLD", "MISSING_FROM_COMPOSITION"], ["THRESHOLD", "MISSING_FROM_COMPOSITION"], ["THRESHOLD", "MISSING_FROM_COMPOSITION"]]);
    for (const i of r.defectB.before) expect(i.frozenReason).toMatch(/appears nowhere in the composed IR/);
    expect(r.defectB.before.flatMap((i) => i.values.filter((v) => v[0] === "OTHER").map((v) => v[1]))).toEqual(["$25,000,000", "$25,000,000", "1.5%"]);
  });
  it("AFTER: each figure is one canonical scanner-typed value (declaredKind kept for audit); no OTHER duplicate survives", () => {
    for (const i of r.defectB.after) expect(i.values.some((v) => v[0] === "OTHER")).toBe(false);
    expect(r.defectB.after.map((i) => i.values.map((v) => [v[0], v[1], v[2]]))).toEqual([[["MONEY", "$25,000,000", 25000000]], [["MONEY", "$25,000,000", 25000000], ["PERCENT", "1.5%", 0.015]], [["PERCENT", "1.5%", 0.015]]]);
    expect(r.accountability.after.counts.materialQuantitativeValuesMissing).toBe(0);
    expect(r.accountability.after.missing.map((m) => m[1])).toEqual(["FORMULA_COMPONENT", "FORMULA_COMPONENT", "FORMULA_COMPONENT"]);
  });
});

describe("defect C - the governing lead-in's first disposal phrase is the source act", () => {
  it("BEFORE: 'issue or sell any shares' (ONTOLOGY_GAP) was recorded as the §7.5 act -> INCOMPATIBLE -> false PARTIAL", () => {
    expect(r.defectC.before.ruleInheritedAction).toMatchObject({ evidence: "issue or sell any shares", compatibility: "INCOMPATIBLE" });
    expect(r.defectC.before.sufficiency).toBe("PARTIAL");
    expect(r.defectC.before.sufficiencyReasons.some((s) => s.startsWith("ACTION_INCONSISTENT_WITH_SOURCE_ACT"))).toBe(true);
  });
  it("AFTER: 'Dispose of any of its Property' classifies ASSET / SELL_ASSET; the inherited action is COMPATIBLE and the false limit is gone", () => {
    expect(r.defectC.after.leadInClassification).toMatchObject({ phrase: "Dispose of any of its Property", objectFamily: "ASSET", canonicalAction: "SELL_ASSET", coverage: "COVERED" });
    expect(r.defectC.after.compatibilityWithSellAsset.compatibility).toBe("COMPATIBLE");
    expect(r.defectC.after.inheritedAction).toBe("SELL_ASSET");
    expect(r.defectC.after.ruleInheritedAction).toMatchObject({ evidence: "Dispose of any of its Property", canonicalValue: "SELL_ASSET", compatibility: "COMPATIBLE" });
    expect(r.defectC.after.sufficiencyReasons.some((s) => s.startsWith("ACTION_INCONSISTENT_WITH_SOURCE_ACT"))).toBe(false);
  });
});

describe("defect D - the Consolidated Total Assets measurement date is structure, not only provenance", () => {
  it("BEFORE: the wire carried asOfDate 'date of such Disposition' on the metric reference and the frozen IR dropped it silently", () => {
    expect(r.defectD.before.wireAsOfDate).toBe("date of such Disposition");
    expect(r.defectD.before.ctaNode).toMatchObject({ kind: "METRIC_REFERENCE", metricName: "Consolidated Total Assets" });
    expect(r.defectD.before.diagnostics).not.toContain("METRIC_REFERENCE_AS_OF_LIFTED");
  });
  it("AFTER: AS_OF(METRIC_REFERENCE 'Consolidated Total Assets', 'date of such Disposition') inside the 1.5% alternative, typed MONEY, audited by a DIAGNOSTIC, visible in the projection", () => {
    expect(r.defectD.after.ctaNode).toMatchObject({ kind: "AS_OF", type: "MONEY", asOfDate: "date of such Disposition", value: { kind: "METRIC_REFERENCE", metricName: "Consolidated Total Assets", type: "MONEY" } });
    expect(r.defectD.after.diagnostics.map((d) => d.code)).toContain("METRIC_REFERENCE_AS_OF_LIFTED");
    expect(r.defectD.after.liftDiagnostic).toContain("date of such Disposition");
    expect(r.verification.after.projectionCarriesAsOf).toBe(true);
  });
});

describe("the replay does not overclaim: genuine frozen-output limitations remain visible", () => {
  it("compilation stays REVIEW_REQUIRED for the genuine reasons only (missing valuation structure; support asymmetry); the false coverage gap is gone", () => {
    expect(r.accountability.before.failureReasons).toEqual(["SEMANTIC_INVENTORY_COVERAGE_GAP", "INVENTORY_ITEM_MISSING_FROM_COMPOSITION", "SEMANTIC_SUPPORT_REVIEW_REQUIRED"]);
    expect(r.accountability.after.failureReasons).toEqual(["INVENTORY_ITEM_MISSING_FROM_COMPOSITION", "SEMANTIC_SUPPORT_REVIEW_REQUIRED"]);
    expect(r.accountability.after.status).toBe("REVIEW_REQUIRED");
    expect(r.accountability.after.semanticallyComplete).toBe(false);
  });
  it("the two non-cash valuation mechanics remain MISSING_FROM_COMPOSITION (not structurally represented by the frozen composition)", () => {
    expect(r.residual.notesDebtSecuritiesValuation.status).toBe("MISSING_FROM_COMPOSITION (unchanged)");
    expect(r.residual.otherNonCashValuation.status).toBe("MISSING_FROM_COMPOSITION (unchanged)");
    expect(r.accountability.after.counts.materialMissingFromComposition).toBe(3);
  });
  it("support asymmetry is not manufactured away", () => {
    expect(r.residual.supportAsymmetry).toMatchObject({ supportReviewRequired: true, materialSingleRun: 2, accountabilitySupportReviewRequired: true });
  });
  it("the (j)/(x)/(y) enumeration signal still fires and keeps its current disposition (NON_MATERIAL once the independent review does not confirm it)", () => {
    expect(r.residual.enumerationSignal).toEqual([{ severity: "NON_MATERIAL", verificationMethod: "DETERMINISTIC_ONLY", signals: expect.arrayContaining([expect.stringContaining("(j), (x), (y)")]) }]);
    expect(r.verification.after.status).toBe("VERIFIED_WITH_NON_MATERIAL_FINDINGS");
    expect(r.verification.after.findings).toEqual([["NON_MATERIAL", "MISSING_RULE", "DETERMINISTIC_ONLY"]]);
  });
  it("candidate certification stays REVIEW_REQUIRED; the false UNIT_SUFFICIENCY_INCOMPLETE blocker is gone, the genuine ones remain", () => {
    expect(r.certification.before.blockers.map((b) => b[0])).toEqual(["COMPILATION_NOT_COMPLETED", "UNACCOUNTED_MATERIAL_SOURCE", "UNIT_SUFFICIENCY_INCOMPLETE"]);
    expect(r.certification.after.status).toBe("REVIEW_REQUIRED");
    expect(r.certification.after.blockers.map((b) => b[0])).toEqual(["COMPILATION_NOT_COMPLETED", "UNACCOUNTED_MATERIAL_SOURCE"]);
    expect(r.certification.after.blockers.find((b) => b[0] === "COMPILATION_NOT_COMPLETED")![1]).not.toContain("SEMANTIC_INVENTORY_COVERAGE_GAP");
  });
  it("projection identity: the replayed projection hash equals the one recorded on the replayed verification and differs from the frozen one (the IR changed: AS_OF)", () => {
    expect(r.verification.after.projectionHash).toBe(r.verification.after.recordedProjectionHash);
    expect(r.verification.after.projectionHash).not.toBe(r.verification.before.projectionHash);
    expect(r.verification.after.qualitativeGrounding.materialUngrounded).toBe(0);
  });
  it("gap re-inventory localRef reliability is OBSERVED_BUT_NOT_REMEDIATED", () => {
    expect(r.residual.gapReinventoryLocalRef.status).toBe("OBSERVED_BUT_NOT_REMEDIATED");
  });
});
