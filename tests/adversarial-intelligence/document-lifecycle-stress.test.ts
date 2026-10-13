/**
 * Parallel Adversarial Intelligence — Mission 3
 * Document lifecycle stress: original CA → amendments → restatement →
 * historical transactions → subsequent compliance testing.
 *
 * Asserts as-of authority, supersession, provenance, and replay determinism.
 * Historical states must remain reproducible without contaminating current calculations.
 */
import { describe, expect, it } from "vitest";
import { computeOperativeDocument } from "@/lib/contract-model/compiler/amendment/chain";
import type { AmendmentEffectCandidate } from "@/lib/contract-model/compiler/amendment/types";
import {
  authorityAsOf,
  resolveGoverningProvision,
} from "@/lib/contract-model/compiler/operative-authority";
import type { RestatementAuthorityResolution } from "@/lib/contract-model/compiler/operative-authority";
import { resolveOperativePrecedence } from "@/lib/product/customer-intelligence/operative-resolution";
import { analyzeAmendmentPackage } from "@/lib/product/customer-intelligence/amendment-package";
import { compareAmendmentSummaries } from "@/lib/product/customer-intelligence/amendment-compare";
import type { KnowledgeSourceRecord } from "@/lib/knowledge-factory/types";
import {
  advance,
  cash,
  consume,
  nodeOf,
  onProvision,
  proposal,
  provision,
  resetIds,
  route,
  simulate,
  usage,
  world,
  MONEY,
} from "../contract-model/runtime/transaction/helpers";

function restateEffect(
  effectId: string,
  amendmentDocumentId: string,
  targetDocumentId: string,
  date: string,
): AmendmentEffectCandidate {
  return {
    effectId,
    amendmentDocumentId,
    target: {
      kind: "DOCUMENT",
      targetDocumentId,
      targetInstrumentKey: "instrument:lifecycle",
      targetStructuralNodeKey: null,
      targetSectionRef: null,
      targetDefinedTermRef: null,
      targetHint: null,
    },
    operation: "RESTATE_AGREEMENT",
    effectiveDate: {
      date,
      status: "EXPLICIT_EFFECTIVE_DATE",
      evidence: date,
      reason: "lifecycle fixture",
    },
    newText: null,
    oldText: null,
    sourceCitation: "lifecycle fixture",
    sourceExcerpt: "lifecycle fixture",
    confidence: 0.95,
    status: "RESOLVED",
    unresolvedReason: null,
    resolutionMethod: "DETERMINISTIC_EXPLICIT_PATTERN",
  };
}

function confirmedFull(
  successorDocumentId: string,
  predecessorDocumentId: string,
  effectiveDateIso: string,
): RestatementAuthorityResolution {
  return {
    successorDocumentId,
    predecessorDocumentId,
    status: "OPERATIVE_AUTHORITY_CONFIRMED",
    effectiveDateIso,
    effectivenessInference: "INFERRED_FROM_DATED_AS_OF_WITH_EXECUTION",
    conditionsPrecedentSatisfaction: "NOT_STATED",
    caveats: [],
    reasons: [`Confirmed full restatement ${successorDocumentId}`],
    doesNotMutatePackageGraphRelationship: true,
    evidence: {
      successorDocumentId,
      predecessorDocumentId,
      captionRestatement: {
        present: true,
        excerpt: "AMENDED AND RESTATED",
        charStart: 0,
        ordinalLabel: "Second",
      },
      executionDate: { value: effectiveDateIso, isoDate: effectiveDateIso, excerpt: effectiveDateIso },
      priorAgreementRecital: {
        present: true,
        excerpt: "Existing Credit Agreement",
        charStart: 1,
        namedAgreementLabel: "Prior Credit Agreement",
        namedExecutionDate: "2020-01-15",
        definedTerm: "Existing Credit Agreement",
      },
      operativeRestatementLanguage: {
        present: true,
        excerpt: "amended and restated in its entirety",
        charStart: 2,
        location: "NOW_THEREFORE",
        supersedesEntirety: true,
        novationDisclaimed: true,
      },
      conditionsPrecedent: { present: false, excerpt: null, charStart: null, sectionRef: null },
      signatureEvidence: { present: true, excerpt: "signature page", charStart: 3 },
      facilityIdentity: {
        administrativeAgentMatch: true,
        revolvingFacilityContinuity: true,
        borrowerContinuitySignals: ["Borrower"],
        mismatchReasons: [],
      },
      restatementScope: "FULL_AGREEMENT",
      partialProvisionRefs: [],
      packageGraphRelationshipStatus: "RESOLVED",
      packageGraphEvidenceClass: "STRONG_TARGET_EVIDENCE",
      packageGraphUnresolvedReason: null,
    },
  };
}

function baseSource(over: Partial<KnowledgeSourceRecord> & Pick<KnowledgeSourceRecord, "sourceId">): KnowledgeSourceRecord {
  return {
    sourceId: over.sourceId,
    issuerCik: "0000000000",
    accessionNumber: "0000000000-00-000000",
    exhibitFilename: over.exhibitFilename ?? `${over.sourceId}.htm`,
    sourceUrl: `https://example.test/${over.sourceId}`,
    filingDate: over.filingDate ?? "2020-01-15",
    formType: "8-K",
    documentTitle: over.documentTitle ?? over.sourceId,
    documentClass: over.documentClass ?? "CREDIT_AGREEMENT",
    originalBytesHash: `hash-${over.sourceId}`,
    acquisitionTimestamp: "2026-01-01T00:00:00Z",
    parserVersion: "test",
    extractionStatus: "EXTRACTED",
    representationLevel: "STRUCTURAL",
    provenance: "adversarial-lifecycle-fixture",
    usageRightsReviewStatus: "APPROVED_FOR_INTERNAL_EVAL",
    companyId: "lifecycle-co",
    ...over,
  };
}

describe("Mission 3 — Agent #7 as-of authority (safeguards holding)", () => {
  const family = ["ca-original", "ca-ar1", "ca-ar2"] as const;
  const authorities = [
    confirmedFull("ca-ar1", "ca-original", "2022-03-15"),
    confirmedFull("ca-ar2", "ca-ar1", "2024-06-01"),
  ];

  it("pre-effective / mid / post as-of select the correct governing restatement", () => {
    const pre = resolveGoverningProvision({
      asOfDate: "2021-12-31",
      sectionRef: "6.01",
      instrumentDocumentIds: [...family],
      baseDocumentId: "ca-original",
      restatementAuthorities: authorities,
    });
    expect(pre.governingDocumentId).toBe("ca-original");

    const mid = resolveGoverningProvision({
      asOfDate: "2023-01-01",
      sectionRef: "6.01",
      instrumentDocumentIds: [...family],
      baseDocumentId: "ca-original",
      restatementAuthorities: authorities,
    });
    expect(mid.governingDocumentId).toBe("ca-ar1");

    const post = resolveGoverningProvision({
      asOfDate: "2024-06-01",
      sectionRef: "6.01",
      instrumentDocumentIds: [...family],
      baseDocumentId: "ca-original",
      restatementAuthorities: authorities,
    });
    expect(post.governingDocumentId).toBe("ca-ar2");
    expect(post.supersededDocumentIds).toEqual(expect.arrayContaining(["ca-ar1"]));
  });

  it("authorityAsOf marks future restatement NOT_YET_EFFECTIVE without mutating inputs", () => {
    const auth = confirmedFull("ca-ar2", "ca-ar1", "2024-06-01");
    const before = JSON.stringify(auth);
    const viewed = authorityAsOf(auth, "2024-05-31");
    expect(viewed.status).toBe("NOT_YET_EFFECTIVE");
    expect(JSON.stringify(auth)).toBe(before);
  });

  it("replay determinism: identical as-of queries are byte-stable", () => {
    const args = {
      asOfDate: "2025-01-01",
      sectionRef: "6.01",
      instrumentDocumentIds: [...family],
      baseDocumentId: "ca-original",
      restatementAuthorities: authorities,
    };
    expect(JSON.stringify(resolveGoverningProvision(args))).toBe(
      JSON.stringify(resolveGoverningProvision(args)),
    );
  });
});

describe("Mission 3 — historical simulation must not contaminate current ledger", () => {
  it("hypo then compliance on same pre-state: ledger unchanged; commitPlan unexecuted", () => {
    resetIds();
    const seeded = world({
      rules: [provision("p-a", MONEY(100))],
      ledger: [usage("hist-1", "25", onProvision("p-a"))],
    });

    const hypo = simulate(
      seeded,
      proposal("tx-hypo", [consume("e1", nodeOf("p-a"), cash("10"))]),
      route({ capacityNodeIds: [nodeOf("p-a")], ruleIds: ["p-a"] }),
    );
    expect(hypo.selectedPathResult).toBe("SATISFIED");
    expect(hypo.commitPlan.executed).toBe(false);
    expect(seeded.context.ledger?.map((u) => u.usageId)).toEqual(["hist-1"]);
    expect(seeded.context.ledger?.[0]?.amount.amount).toBe("25");

    // Re-evaluate capacity on the unchanged seeded world (subsequent compliance testing).
    const compliance = simulate(
      seeded,
      proposal("tx-compliance", [consume("e2", nodeOf("p-a"), cash("0"))]),
      route({ capacityNodeIds: [nodeOf("p-a")], ruleIds: ["p-a"] }),
    );
    expect(compliance.preStateIdentity.stateHash).toBe(seeded.state.stateHash);
    const preUsage = seeded.state.capacities[0]!.usage;
    expect(preUsage.kind).toBe("AMOUNT");
    if (preUsage.kind === "AMOUNT" && preUsage.value.type === "MONEY") {
      expect(preUsage.value.amount).toBe("25");
    }
    expect(seeded.context.ledger).toHaveLength(1);

    const advanced = advance(seeded, hypo);
    expect(advanced.context.ledger?.some((u) => u.usageId.includes("tx-hypo"))).toBe(true);
    expect(seeded.context.ledger).toHaveLength(1);
  });
});

describe("Mission 3 — customer-intelligence as-of (PAI-06 closed)", () => {
  it("pre-effective restatement must not resolve as operative before asOfDate", () => {
    const sources = [
      baseSource({
        sourceId: "base-ca",
        documentClass: "CREDIT_AGREEMENT",
        documentTitle: "Credit Agreement dated as of 2022-01-15",
        filingDate: "2022-01-15",
      }),
      baseSource({
        sourceId: "restated",
        documentClass: "RESTATEMENT",
        documentTitle: "Amended and Restated Credit Agreement dated as of 2024-06-01",
        exhibitFilename: "restated.htm",
        filingDate: "2024-06-01",
      }),
    ];
    const ap = analyzeAmendmentPackage({ companyId: "lifecycle-co", sources, relationships: [] });
    const compare = compareAmendmentSummaries({ amendmentPackage: ap, items: [] });
    const op = resolveOperativePrecedence({
      sources,
      amendmentPackage: ap,
      compare,
      asOfDate: "2024-05-31",
    });
    expect(op.status).not.toBe("RESOLVED");
    expect(op.operativeDocumentSourceId).not.toBe("restated");
  });
});

describe("Mission 3 — whole-document tip as-of (PAI-01 closed)", () => {
  it("computeOperativeDocument with asOfDate excludes future tip; provision path agrees", () => {
    const effects = [
      restateEffect("e1", "ca-ar1", "ca-original", "2022-03-15"),
      restateEffect("e2", "ca-ar2", "ca-ar1", "2030-01-01"),
    ];
    const tipAsOf = computeOperativeDocument("ca-original", effects, [], { asOfDate: "2025-06-01" });
    expect(tipAsOf.status).toBe("RESOLVED");
    expect(tipAsOf.operativeDocumentId).toBe("ca-ar1");

    const gov = resolveGoverningProvision({
      asOfDate: "2025-06-01",
      sectionRef: "6.01",
      instrumentDocumentIds: ["ca-original", "ca-ar1", "ca-ar2"],
      baseDocumentId: "ca-original",
      restatementAuthorities: [
        confirmedFull("ca-ar1", "ca-original", "2022-03-15"),
        confirmedFull("ca-ar2", "ca-ar1", "2030-01-01"),
      ],
    });
    expect(gov.governingDocumentId).toBe("ca-ar1");
  });
});
