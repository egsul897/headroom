/**
 * Contract A — offline compiler consumes buildOperativeHandoffBundle and
 * fails closed on provisional / non-confirmed instrument identity.
 */
import { describe, expect, it } from "vitest";
import { compileFrozenDebtPackage } from "../../../lib/contract-model/analysis/offline-package-compile";
import { buildOperativeHandoffBundle } from "../../../lib/contract-model/compiler/package-graph/operative-handoff";
import { groupPackageIntoInstruments } from "../../../lib/contract-model/compiler/package-graph/instrument-grouping";
import type {
  DocumentClassification,
  PackageGraphResult,
  RelationshipCandidate,
} from "../../../lib/contract-model/compiler/package-graph/types";
import type { OperativeContractState, OperativeProvisionView } from "../../../lib/contract-model/compiler/amendment/types";

const FIXED_DOLLAR_CA = `
SECTION 1 DEFINITIONS.

"Permitted Indebtedness" means:
(a) Indebtedness under this Agreement;
(b) Indebtedness not to exceed $75,000,000 at any time outstanding;
(c) other Indebtedness approved by the Required Lenders.

SECTION 7.03 Indebtedness. The Borrower shall not create, incur or suffer to exist any Indebtedness, except Permitted Indebtedness.
`;

const cls = (documentId: string, type: DocumentClassification["type"]): DocumentClassification => ({
  documentId,
  type,
  confidence: 0.95,
  evidence: ["title"],
  resolutionMethod: "DETERMINISTIC_TITLE_PATTERN",
});

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
    candidateSourceNodeIds: ["node-601"],
    structuralHealthStatus: "STRUCTURAL_HEALTH_SUFFICIENT",
    structuralHealthIssues: [],
    attemptedText: null,
    reviewRequired: false,
    candidateTexts: [],
    ...over,
  };
}

function graph(
  instruments: ReturnType<typeof groupPackageIntoInstruments>,
  rels: RelationshipCandidate[],
  classifications: DocumentClassification[],
): PackageGraphResult {
  return {
    companyId: "fixture-hr278-gate",
    packageKey: "hr278-gate",
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
      amendmentNumber: c.documentId.includes("am") ? 1 : null,
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

describe("offline compile operative identity gate (contract A)", () => {
  it("confirmed single-document package exposes handoff and may verify fixed-dollar slice", async () => {
    const result = await compileFrozenDebtPackage({
      companyId: "hr278-confirmed",
      packageKey: "confirmed-fd",
      documents: [{ documentId: "ca", label: "CA", text: FIXED_DOLLAR_CA }],
      authorizePaidInference: false,
      asOfDate: "2024-06-01",
    });

    expect(result.operativeHandoff).not.toBeNull();
    expect(result.stages.operativeHandoff.authorityGate).toBe("CONFIRMED_OPERATIVE_IDENTITY");
    expect(result.stages.operativeHandoff.provisionalBlockedCount).toBe(0);
    expect(result.summary.falseExecutableClassifications).toBe(0);
    for (const u of result.units.filter((x) => x.executableAuthority === "VERIFIED_EXECUTABLE")) {
      const refusal = u.fixedDollarSlice?.productionRefusal ?? u.greaterOfSlice?.productionRefusal;
      expect(refusal).toMatch(/PRODUCTION_CAPACITY_REFUSED/);
    }
  });

  it("provisional instrument identity → PROVISIONAL_IDENTITY_BLOCKED; provenance survives", () => {
    const classifications = [cls("ca", "CREDIT_AGREEMENT"), cls("am", "AMENDMENT")];
    const rels = [provisionalAmends("am", "ca")];
    const instruments = groupPackageIntoInstruments(["ca", "am"], classifications, [], rels);
    const state: OperativeContractState = {
      instrumentKey: "instrument:ca",
      asOfDate: "2024-01-01",
      status: "OPERATIVE_STATE_RESOLVED",
      summary: "looks resolved",
      unattachedEffects: [],
      provisions: [
        view({
          provisionKey: "instrument:ca::SECTION::6.01",
          currentText: "should not authorize",
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
    expect(bundle.provisions[0]!.authorityClassification).toBe("PROVISIONAL_IDENTITY_BLOCKED");
    expect(bundle.provisions[0]!.canonicalInstrumentKey).toBeNull();
    expect(bundle.instruments[0]!.mayConsolidateOperative).toBe(false);
    expect(bundle.provisions[0]!.applicableAmendmentChain).toHaveLength(1);
    expect(bundle.provisions[0]!.applicableAmendmentChain[0]!.amendmentDocumentId).toBe("am");
    expect(bundle.provisions[0]!.sourceSpan.nodeId).toBe("node-601");
    expect(bundle.provisions[0]!.effectiveAsOfDate).toBe("2024-01-01");
    expect(bundle.provisions[0]!.provenance.associationKind).toBe("PROVISIONAL_FAMILY");
  });

  it("ambiguous target and conflicted operative state fail closed (not CONFIRMED_OPERATIVE)", () => {
    const classifications = [cls("ca", "CREDIT_AGREEMENT"), cls("am1", "AMENDMENT")];
    const rels = [trustedAmends("am1", "ca")];
    const instruments = groupPackageIntoInstruments(["ca", "am1"], classifications, [], rels);
    const ambiguous: OperativeContractState = {
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
    const conflicted: OperativeContractState = {
      instrumentKey: "instrument:ca",
      asOfDate: "2024-01-01",
      status: "OPERATIVE_STATE_CONFLICTED",
      summary: "conflict",
      unattachedEffects: [],
      provisions: [
        view({
          provisionKey: "instrument:ca::SECTION::7.01",
          sectionRef: "7.01",
          status: "OPERATIVE_STATE_CONFLICTED",
          conflicts: [
            {
              conflictType: "AMENDMENT_CONFLICT",
              provisionKey: "instrument:ca::SECTION::7.01",
              involvedEffectIds: ["e1", "e2"],
              reason: "two competing replaces",
            },
          ],
          candidateTexts: ["text-a", "text-b"],
          currentText: null,
        }),
      ],
    };
    const amb = buildOperativeHandoffBundle({
      packageGraph: graph(instruments, rels, classifications),
      asOfDate: "2024-01-01",
      operativeStates: [ambiguous],
    });
    const conf = buildOperativeHandoffBundle({
      packageGraph: graph(instruments, rels, classifications),
      asOfDate: "2024-01-01",
      operativeStates: [conflicted],
    });
    expect(amb.provisions[0]!.authorityClassification).toBe("AMBIGUOUS");
    expect(conf.provisions[0]!.authorityClassification).toBe("CONFLICTED");
    expect(amb.provisions.every((p) => p.authorityClassification !== "CONFIRMED_OPERATIVE")).toBe(true);
    expect(conf.provisions.every((p) => p.authorityClassification !== "CONFIRMED_OPERATIVE")).toBe(true);
  });

  it("missing effective date fails closed as REVIEW_REQUIRED (not CONFIRMED_OPERATIVE)", () => {
    const classifications = [cls("ca", "CREDIT_AGREEMENT"), cls("am1", "AMENDMENT")];
    const rels = [trustedAmends("am1", "ca")];
    const instruments = groupPackageIntoInstruments(["ca", "am1"], classifications, [], rels);
    const state: OperativeContractState = {
      instrumentKey: "instrument:ca",
      asOfDate: "2024-01-01",
      status: "OPERATIVE_STATE_PARTIAL",
      summary: "undated",
      unattachedEffects: [
        {
          effectId: "e-undated",
          amendmentDocumentId: "am1",
          operation: "REPLACE_TEXT",
          effectiveDate: { date: null, status: "UNKNOWN", evidence: null, reason: "no date" },
          newText: "x",
          oldText: null,
          sourceCitation: "§1",
          sourceExcerpt: "amended",
          confidence: 0.5,
          status: "REVIEW_REQUIRED",
          unresolvedReason: "effective date unknown",
          resolutionMethod: "DETERMINISTIC_EXPLICIT_PATTERN",
          target: {
            kind: "SECTION",
            targetDocumentId: "ca",
            targetInstrumentKey: "instrument:ca",
            targetStructuralNodeKey: null,
            targetSectionRef: "6.01",
            targetDefinedTermRef: null,
            targetHint: null,
          },
        },
      ],
      provisions: [],
    };
    const bundle = buildOperativeHandoffBundle({
      packageGraph: graph(instruments, rels, classifications),
      asOfDate: "2024-01-01",
      operativeStates: [state],
    });
    expect(bundle.provisions.length).toBeGreaterThan(0);
    expect(bundle.provisions[0]!.authorityClassification).toBe("REVIEW_REQUIRED");
    expect(bundle.provisions[0]!.authorityClassification).not.toBe("CONFIRMED_OPERATIVE");
    expect(bundle.provisions[0]!.applicableAmendmentChain[0]!.effectiveDate).toBeNull();
  });
});
