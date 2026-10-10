/**
 * HEADROOM-3 Scope C/D/E — amendment precedence + operative handoff contract.
 * Does not modify compiler internals; projects computeOperativeContractState
 * through buildOperativeHandoffBundle and fails closed on provisional identity.
 */
import { describe, expect, it } from "vitest";
import { buildOperativeHandoffBundle } from "@/lib/contract-model/compiler/package-graph/operative-handoff";
import { assignPackageDocumentRoles } from "@/lib/contract-model/compiler/package-graph/document-roles";
import { groupPackageIntoInstruments } from "@/lib/contract-model/compiler/package-graph/instrument-grouping";
import type {
  DocumentClassification,
  PackageGraphResult,
  RelationshipCandidate,
} from "@/lib/contract-model/compiler/package-graph/types";
import type {
  AmendmentEffectCandidate,
  OperativeContractState,
  OperativeProvisionView,
} from "@/lib/contract-model/compiler/amendment/types";

const cls = (documentId: string, type: DocumentClassification["type"]): DocumentClassification => ({
  documentId,
  type,
  confidence: 0.95,
  evidence: ["title"],
  resolutionMethod: "DETERMINISTIC_TITLE_PATTERN",
});

function trustedAmends(source: string, target: string): RelationshipCandidate {
  return {
    sourceDocumentId: source,
    targetDocumentId: target,
    targetHint: null,
    relationshipType: "AMENDS",
    sourceCitation: `Amendment to ${target}`,
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
    targetHint: null,
    relationshipType: "AMENDS",
    sourceCitation: "WHEREAS parties wish to amend",
    confidence: 0.55,
    status: "REVIEW_REQUIRED",
    unresolvedReason: "supporting only",
    resolutionMethod: "DETERMINISTIC",
    evidenceClass: "SUPPORTING_TARGET_EVIDENCE",
  };
}

function effect(partial: Partial<AmendmentEffectCandidate> & Pick<AmendmentEffectCandidate, "effectId" | "amendmentDocumentId">): AmendmentEffectCandidate {
  return {
    target: {
      kind: "SECTION",
      targetDocumentId: "ca",
      targetInstrumentKey: "instrument:ca",
      targetStructuralNodeKey: null,
      targetSectionRef: "6.01",
      targetDefinedTermRef: null,
      targetHint: null,
    },
    operation: "REPLACE_TEXT",
    effectiveDate: { date: "2023-01-01", status: "EXPLICIT_EFFECTIVE_DATE", evidence: "Effective Date", reason: "explicit" },
    newText: "new basket",
    oldText: "old basket",
    sourceCitation: "Section 1",
    sourceExcerpt: "Section 6.01 is hereby amended",
    confidence: 0.9,
    status: "RESOLVED",
    unresolvedReason: null,
    resolutionMethod: "DETERMINISTIC_EXPLICIT_PATTERN",
    ...partial,
  };
}

function view(over: Partial<OperativeProvisionView> & Pick<OperativeProvisionView, "provisionKey">): OperativeProvisionView {
  return {
    instrumentKey: "instrument:ca",
    kind: "SECTION",
    documentId: "ca",
    sectionRef: "6.01",
    definedTermRef: null,
    asOfDate: "2024-01-01",
    currentSourceDocumentId: "ca",
    currentSourceNodeKey: "ca:6.01",
    currentSourceNodeId: "node-601",
    currentText: "base text",
    fullChain: [],
    appliedChain: [],
    supersededSourceNodeKeys: [],
    supersededSourceNodeIds: [],
    status: "OPERATIVE_STATE_RESOLVED",
    unresolvedIssues: [],
    conflicts: [],
    targetResolutionStatus: "UNIQUE",
    targetResolutionReason: null,
    candidateSourceNodeIds: [],
    structuralHealthStatus: "STRUCTURAL_HEALTH_SUFFICIENT",
    structuralHealthIssues: [],
    attemptedText: null,
    reviewRequired: false,
    candidateTexts: [],
    ...over,
  };
}

function graph(instruments: ReturnType<typeof groupPackageIntoInstruments>, rels: RelationshipCandidate[], classifications: DocumentClassification[]): PackageGraphResult {
  return {
    companyId: "fixture-hr3-handoff",
    packageKey: "hr3-handoff",
    classifications,
    identities: classifications.map((c) => ({
      documentId: c.documentId,
      title: c.documentId,
      agreementTypeLabel: null,
      executionDate: "2022-01-01",
      effectiveDate: c.documentId.startsWith("am") ? "2023-06-01" : "2022-01-01",
      parties: [],
      borrowerOrIssuer: null,
      administrativeAgentOrTrustee: null,
      facilityOrInstrumentName: null,
      originalAgreementReferenceHint: null,
      amendmentNumber: c.documentId.includes("am1") ? 1 : c.documentId.includes("am2") ? 2 : null,
      supplementNumber: null,
      evidenceByField: {},
    })),
    relationshipCandidates: rels,
    modificationCandidates: [],
    crossDocumentReferenceLeads: [],
    instruments,
    performance: {
      documentCount: classifications.length,
      totalCharsScanned: 0,
      relationshipCandidatesGenerated: rels.length,
      relationshipsResolved: rels.filter((r) => r.status === "RESOLVED").length,
      relationshipsUnresolved: 0,
      modificationCandidatesGenerated: 0,
      crossDocumentReferenceLeadsGenerated: 0,
      wallClockMs: 0,
      semanticCallsUsed: 0,
    },
  };
}

describe("HEADROOM-3 amendment precedence + operative handoff", () => {
  it("two amendments affecting different provisions stay provision-scoped", () => {
    const classifications = [cls("ca", "CREDIT_AGREEMENT"), cls("am1", "AMENDMENT"), cls("am2", "AMENDMENT")];
    const rels = [trustedAmends("am1", "ca"), trustedAmends("am2", "ca")];
    const instruments = groupPackageIntoInstruments(["ca", "am1", "am2"], classifications, [], rels);
    const state: OperativeContractState = {
      instrumentKey: "instrument:ca",
      asOfDate: "2024-01-01",
      status: "OPERATIVE_STATE_RESOLVED",
      summary: "ok",
      unattachedEffects: [],
      provisions: [
        view({
          provisionKey: "instrument:ca::SECTION::6.01",
          sectionRef: "6.01",
          currentText: "amended 6.01",
          currentSourceDocumentId: "am1",
          fullChain: [
            {
              effectId: "e1",
              amendmentDocumentId: "am1",
              operation: "REPLACE_TEXT",
              effectiveDate: { date: "2023-01-01", status: "EXPLICIT_EFFECTIVE_DATE", evidence: null, reason: "explicit" },
              sourceCitation: "§1",
              appliedAsOfQuery: true,
            },
          ],
          appliedChain: [
            {
              effectId: "e1",
              amendmentDocumentId: "am1",
              operation: "REPLACE_TEXT",
              effectiveDate: { date: "2023-01-01", status: "EXPLICIT_EFFECTIVE_DATE", evidence: null, reason: "explicit" },
              sourceCitation: "§1",
              appliedAsOfQuery: true,
            },
          ],
          supersededSourceNodeIds: ["node-601-old"],
        }),
        view({
          provisionKey: "instrument:ca::SECTION::7.01",
          sectionRef: "7.01",
          currentText: "amended 7.01",
          currentSourceDocumentId: "am2",
          fullChain: [
            {
              effectId: "e2",
              amendmentDocumentId: "am2",
              operation: "REPLACE_TEXT",
              effectiveDate: { date: "2023-06-01", status: "EXPLICIT_EFFECTIVE_DATE", evidence: null, reason: "explicit" },
              sourceCitation: "§2",
              appliedAsOfQuery: true,
            },
          ],
          appliedChain: [
            {
              effectId: "e2",
              amendmentDocumentId: "am2",
              operation: "REPLACE_TEXT",
              effectiveDate: { date: "2023-06-01", status: "EXPLICIT_EFFECTIVE_DATE", evidence: null, reason: "explicit" },
              sourceCitation: "§2",
              appliedAsOfQuery: true,
            },
          ],
        }),
      ],
    };
    const bundle = buildOperativeHandoffBundle({
      packageGraph: graph(instruments, rels, classifications),
      asOfDate: "2024-01-01",
      operativeStates: [state],
    });
    expect(bundle.provisions).toHaveLength(2);
    expect(bundle.provisions.every((p) => p.authorityClassification === "CONFIRMED_OPERATIVE")).toBe(true);
    expect(bundle.provisions.find((p) => p.sectionRef === "6.01")!.applicableAmendmentChain.map((c) => c.amendmentDocumentId)).toEqual(["am1"]);
    expect(bundle.provisions.find((p) => p.sectionRef === "7.01")!.applicableAmendmentChain.map((c) => c.amendmentDocumentId)).toEqual(["am2"]);
  });

  it("amendment effective after transaction date → NOT_YET_EFFECTIVE", () => {
    const classifications = [cls("ca", "CREDIT_AGREEMENT"), cls("am1", "AMENDMENT")];
    const rels = [trustedAmends("am1", "ca")];
    const instruments = groupPackageIntoInstruments(["ca", "am1"], classifications, [], rels);
    const state: OperativeContractState = {
      instrumentKey: "instrument:ca",
      asOfDate: "2022-06-01",
      status: "OPERATIVE_STATE_RESOLVED",
      summary: "future amend",
      unattachedEffects: [],
      provisions: [
        view({
          provisionKey: "instrument:ca::SECTION::6.01",
          asOfDate: "2022-06-01",
          currentText: "base text",
          fullChain: [
            {
              effectId: "e-future",
              amendmentDocumentId: "am1",
              operation: "REPLACE_TEXT",
              effectiveDate: { date: "2023-01-01", status: "EXPLICIT_EFFECTIVE_DATE", evidence: null, reason: "explicit" },
              sourceCitation: "§1",
              appliedAsOfQuery: false,
            },
          ],
          appliedChain: [],
        }),
      ],
    };
    const bundle = buildOperativeHandoffBundle({
      packageGraph: graph(instruments, rels, classifications),
      asOfDate: "2022-06-01",
      operativeStates: [state],
    });
    expect(bundle.provisions[0]!.authorityClassification).toBe("NOT_YET_EFFECTIVE");
  });

  it("missing effective date on an effect → REVIEW_REQUIRED via unattached/conflict surface", () => {
    const classifications = [cls("ca", "CREDIT_AGREEMENT"), cls("am1", "AMENDMENT")];
    const rels = [trustedAmends("am1", "ca")];
    const instruments = groupPackageIntoInstruments(["ca", "am1"], classifications, [], rels);
    const undated = effect({
      effectId: "e-undated",
      amendmentDocumentId: "am1",
      effectiveDate: { date: null, status: "UNKNOWN", evidence: null, reason: "no date" },
      status: "REVIEW_REQUIRED",
      unresolvedReason: "effective date unknown",
      target: {
        kind: "SECTION",
        targetDocumentId: "ca",
        targetInstrumentKey: "instrument:ca",
        targetStructuralNodeKey: null,
        targetSectionRef: null,
        targetDefinedTermRef: null,
        targetHint: "the Credit Agreement",
      },
    });
    const state: OperativeContractState = {
      instrumentKey: "instrument:ca",
      asOfDate: "2024-01-01",
      status: "OPERATIVE_STATE_REVIEW_REQUIRED",
      summary: "undated",
      unattachedEffects: [undated],
      provisions: [],
    };
    const bundle = buildOperativeHandoffBundle({
      packageGraph: graph(instruments, rels, classifications),
      asOfDate: "2024-01-01",
      operativeStates: [state],
    });
    expect(bundle.provisions[0]!.authorityClassification).toBe("REVIEW_REQUIRED");
    expect(bundle.provisions[0]!.unresolvedConflicts.length).toBeGreaterThan(0);
  });

  it("provisional instrument identity blocks confirmed operative authority", () => {
    const classifications = [cls("ca", "CREDIT_AGREEMENT"), cls("am", "AMENDMENT")];
    const rels = [provisionalAmends("am", "ca")];
    const instruments = groupPackageIntoInstruments(["ca", "am"], classifications, [], rels);
    const state: OperativeContractState = {
      instrumentKey: "instrument:ca",
      asOfDate: "2024-01-01",
      status: "OPERATIVE_STATE_RESOLVED",
      summary: "would look resolved",
      unattachedEffects: [],
      provisions: [
        view({
          provisionKey: "instrument:ca::SECTION::6.01",
          currentText: "should not be trusted",
          fullChain: [
            {
              effectId: "e1",
              amendmentDocumentId: "am",
              operation: "REPLACE_TEXT",
              effectiveDate: { date: "2023-01-01", status: "EXPLICIT_EFFECTIVE_DATE", evidence: null, reason: "explicit" },
              sourceCitation: "§1",
              appliedAsOfQuery: true,
            },
          ],
          appliedChain: [
            {
              effectId: "e1",
              amendmentDocumentId: "am",
              operation: "REPLACE_TEXT",
              effectiveDate: { date: "2023-01-01", status: "EXPLICIT_EFFECTIVE_DATE", evidence: null, reason: "explicit" },
              sourceCitation: "§1",
              appliedAsOfQuery: true,
            },
          ],
        }),
      ],
    };
    const bundle = buildOperativeHandoffBundle({
      packageGraph: graph(instruments, rels, classifications),
      asOfDate: "2024-01-01",
      operativeStates: [state],
    });
    expect(bundle.instruments.find((i) => i.instrumentKey === "instrument:ca")!.mayConsolidateOperative).toBe(false);
    expect(bundle.provisions[0]!.authorityClassification).toBe("PROVISIONAL_IDENTITY_BLOCKED");
    expect(bundle.provisions[0]!.canonicalInstrumentKey).toBeNull();
  });

  it("duplicate section references / ambiguous target → AMBIGUOUS", () => {
    const classifications = [cls("ca", "CREDIT_AGREEMENT"), cls("am1", "AMENDMENT")];
    const rels = [trustedAmends("am1", "ca")];
    const instruments = groupPackageIntoInstruments(["ca", "am1"], classifications, [], rels);
    const state: OperativeContractState = {
      instrumentKey: "instrument:ca",
      asOfDate: "2024-01-01",
      status: "OPERATIVE_STATE_REVIEW_REQUIRED",
      summary: "ambiguous",
      unattachedEffects: [],
      provisions: [
        view({
          provisionKey: "instrument:ca::SECTION::6.01",
          currentText: null,
          status: "OPERATIVE_STATE_REVIEW_REQUIRED",
          reviewRequired: true,
          targetResolutionStatus: "AMBIGUOUS",
          targetResolutionReason: "2 physical occurrences",
          candidateSourceNodeIds: ["n1", "n2"],
          attemptedText: "replacement",
        }),
      ],
    };
    const bundle = buildOperativeHandoffBundle({
      packageGraph: graph(instruments, rels, classifications),
      asOfDate: "2024-01-01",
      operativeStates: [state],
    });
    expect(bundle.provisions[0]!.authorityClassification).toBe("AMBIGUOUS");
  });

  it("partial restatement / superseded source without unique attach → SUPERSEDED_SOURCE or REVIEW_REQUIRED", () => {
    const classifications = [cls("ca", "CREDIT_AGREEMENT"), cls("ar", "AMENDED_AND_RESTATED_AGREEMENT")];
    const rels: RelationshipCandidate[] = [
      {
        sourceDocumentId: "ar",
        targetDocumentId: "ca",
        targetHint: null,
        relationshipType: "RESTATES",
        sourceCitation: "amended and restated",
        confidence: 0.9,
        status: "RESOLVED",
        unresolvedReason: null,
        resolutionMethod: "DETERMINISTIC",
        evidenceClass: "STRONG_TARGET_EVIDENCE",
      },
    ];
    const instruments = groupPackageIntoInstruments(["ca", "ar"], classifications, [], rels);
    const roles = assignPackageDocumentRoles(classifications, graph(instruments, rels, classifications).identities, rels);
    expect(roles.find((r) => r.documentId === "ar")!.role).toBe("RESTATEMENT");

    const state: OperativeContractState = {
      instrumentKey: "instrument:ca",
      asOfDate: "2024-01-01",
      status: "OPERATIVE_STATE_REVIEW_REQUIRED",
      summary: "partial",
      unattachedEffects: [],
      provisions: [
        view({
          provisionKey: "instrument:ca::SECTION::6.01",
          currentText: null,
          status: "OPERATIVE_STATE_REVIEW_REQUIRED",
          reviewRequired: true,
          targetResolutionStatus: "NOT_FOUND",
          targetResolutionReason: "section not found after partial restatement",
          attemptedText: "restated language",
          supersededSourceNodeIds: ["old-node"],
        }),
      ],
    };
    const bundle = buildOperativeHandoffBundle({
      packageGraph: graph(instruments, rels, classifications),
      asOfDate: "2024-01-01",
      operativeStates: [state],
    });
    expect(["SUPERSEDED_SOURCE", "REVIEW_REQUIRED"]).toContain(bundle.provisions[0]!.authorityClassification);
    expect(bundle.unsupportedCases.some((u) => u.startsWith("PR246_"))).toBe(true);
  });

  it("handoff bundle is deterministically ordered across repeated builds", () => {
    const classifications = [cls("ca", "CREDIT_AGREEMENT"), cls("am1", "AMENDMENT"), cls("am2", "AMENDMENT")];
    const rels = [trustedAmends("am1", "ca"), trustedAmends("am2", "ca")];
    const instruments = groupPackageIntoInstruments(["ca", "am1", "am2"], classifications, [], rels);
    const state: OperativeContractState = {
      instrumentKey: "instrument:ca",
      asOfDate: "2024-01-01",
      status: "OPERATIVE_STATE_RESOLVED",
      summary: "ok",
      unattachedEffects: [],
      provisions: [
        view({ provisionKey: "instrument:ca::SECTION::7.01", sectionRef: "7.01" }),
        view({ provisionKey: "instrument:ca::SECTION::6.01", sectionRef: "6.01" }),
      ],
    };
    const a = buildOperativeHandoffBundle({ packageGraph: graph(instruments, rels, classifications), asOfDate: "2024-01-01", operativeStates: [state] });
    const b = buildOperativeHandoffBundle({ packageGraph: graph(instruments, rels, classifications), asOfDate: "2024-01-01", operativeStates: [state] });
    expect(a.provisions.map((p) => p.provisionKey)).toEqual(b.provisions.map((p) => p.provisionKey));
    expect(a.provisions.map((p) => p.provisionKey)).toEqual(["instrument:ca::SECTION::6.01", "instrument:ca::SECTION::7.01"]);
  });

  it("document roles cover original / amendment / waiver / side letter / supplemental", () => {
    const classifications = [
      cls("ca", "CREDIT_AGREEMENT"),
      cls("am", "AMENDMENT"),
      cls("sup", "SUPPLEMENTAL_INDENTURE"),
      cls("side", "SIDE_LETTER"),
      cls("wav", "SIDE_LETTER"),
    ];
    const rels: RelationshipCandidate[] = [
      trustedAmends("am", "ca"),
      {
        sourceDocumentId: "sup",
        targetDocumentId: "ca",
        targetHint: null,
        relationshipType: "SUPPLEMENTS",
        sourceCitation: "Supplemental Indenture",
        confidence: 0.9,
        status: "RESOLVED",
        unresolvedReason: null,
        resolutionMethod: "DETERMINISTIC",
        evidenceClass: "STRONG_TARGET_EVIDENCE",
      },
      {
        sourceDocumentId: "wav",
        targetDocumentId: "ca",
        targetHint: null,
        relationshipType: "AMENDS",
        sourceCitation: "Waiver of Section 6.01 defaults",
        confidence: 0.7,
        status: "REVIEW_REQUIRED",
        unresolvedReason: "waiver",
        resolutionMethod: "DETERMINISTIC",
        evidenceClass: "SUPPORTING_TARGET_EVIDENCE",
      },
    ];
    const roles = assignPackageDocumentRoles(classifications, [], rels);
    expect(roles.find((r) => r.documentId === "ca")!.role).toBe("ORIGINAL_AGREEMENT");
    expect(roles.find((r) => r.documentId === "am")!.role).toBe("AMENDMENT");
    expect(roles.find((r) => r.documentId === "sup")!.role).toBe("SUPPLEMENTAL_INDENTURE");
    expect(roles.find((r) => r.documentId === "side")!.role).toBe("SIDE_LETTER");
    expect(roles.find((r) => r.documentId === "wav")!.role).toBe("WAIVER");
  });
});
