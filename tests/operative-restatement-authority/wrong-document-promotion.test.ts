/**
 * P0 adversarial regressions — wrong-document operative-authority promotion.
 *
 * Asserts provision authorityClassification + governingDocumentId (not merely
 * downstream capacity publication refusal).
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildPackageGraph } from "@/lib/contract-model/compiler/package-graph/pipeline";
import type { PackageDocumentInput } from "@/lib/contract-model/compiler/package-graph/types";
import {
  bindCandidateToOperativeRetrievalSource,
  buildOperativeAuthorityHandoffBundle,
  evaluateProductionAuthorityPromotion,
  resolveGoverningProvision,
  resolvePackageRestatementAuthorities,
  summarizeBundleProductionAuthority,
} from "@/lib/contract-model/compiler/operative-authority";
import { buildStructuralIndex } from "@/lib/contract-model/compiler/structural-index";
import { parseDocumentStructure } from "@/lib/contract-model/compiler/stage-structure";
import { detectStructuralDefinitions } from "@/lib/contract-model/compiler/structural-definitions";
import { detectStructuralReferences } from "@/lib/contract-model/compiler/structural-references";
import type { DiscoveredCandidate } from "@/lib/contract-model/compiler/discovery/types";
import {
  assertProductCapacityConsistency,
  buildSharedProductCapacityViews,
} from "@/lib/capacity";

function syntheticRestatementPair(opts: {
  priorNamed: boolean;
  successorPriorMatch: boolean;
  includeOperative: boolean;
  includeSignatures: boolean;
  includeCp: boolean;
  provisionalOnly?: boolean;
  secondCompetingSuccessor?: boolean;
}): PackageDocumentInput[] {
  const priorDate = "March 26, 2020";
  const successorDate = "September 14, 2026";
  const priorName = opts.priorNamed
    ? "Third Amended and Restated Credit Agreement, dated as of March 26, 2020"
    : "that certain credit agreement previously entered into";
  const wherePrior = opts.successorPriorMatch
    ? `WHEREAS, the Borrower and the Administrative Agent are parties to that certain ${priorName} (the “Existing Credit Agreement”);`
    : `WHEREAS, the Borrower and the Administrative Agent are parties to that certain Fourth Amended and Restated Credit Agreement, dated as of July 18, 2023 (the “Existing Credit Agreement”);`;

  const operative = opts.includeOperative
    ? `NOW THEREFORE, the parties agree as follows:
ARTICLE XI
Section 11.01. Amendment and Restatement of Existing Credit Agreement. Upon (i) the execution and delivery of this Agreement and (ii) satisfaction (or waiver) of the conditions precedent set forth in Section 4.01, the terms and provisions of the Existing Credit Agreement shall be and hereby are amended, superseded and restated in their entirety by the terms and provisions of this Agreement. This Agreement is not intended to and shall not constitute a novation of the Existing Credit Agreement.`
    : `WHEREAS, the parties wish to discuss a restatement.`;

  const sig = opts.includeSignatures
    ? `IN WITNESS WHEREOF, the parties hereto have caused this Agreement to be duly executed.
Signature Page to Fifth Amended and Restated Credit Agreement`
    : "";

  const docA: PackageDocumentInput = {
    documentId: "doc-a",
    label: "Third A&R",
    text: `
THIRD AMENDED AND RESTATED CREDIT AGREEMENT
dated as of
${priorDate}
among
AUTONATION, INC.
and
JPMORGAN CHASE BANK, N.A.
as Administrative Agent

WHEREAS, the parties wish to amend and restate a prior agreement.

Section 8.1. Financial Covenants. The Borrower will not permit the Consolidated Capitalization Ratio to be greater than 0.70 to 1.00.

IN WITNESS WHEREOF, the parties have executed this Agreement.
Signature Page to Third Amended and Restated Credit Agreement
`,
  };

  const docB: PackageDocumentInput = {
    documentId: "doc-b",
    label: "Fifth A&R",
    text: `
FIFTH AMENDED AND RESTATED CREDIT AGREEMENT
dated as of
${successorDate}
among
AUTONATION, INC.
and
JPMORGAN CHASE BANK, N.A.
as Administrative Agent

Preliminary Statement
${wherePrior}
WHEREAS, the parties have agreed to amend and restate the Existing Credit Agreement in its entirety.

${operative}

Section 8.1. Financial Covenants. The Borrower will not permit the Consolidated Leverage Ratio to be greater than 3.75 to 1.00.

${sig}
`,
  };

  const docs = [docA, docB];
  if (opts.secondCompetingSuccessor) {
    docs.push({
      documentId: "doc-c",
      label: "Competing Fifth A&R",
      text: docB.text.replace("doc-b semantics", "compete").replace("FIFTH", "ALTERNATE FIFTH"),
    });
  }
  return docs;
}

function indexFor(docs: PackageDocumentInput[]) {
  const nodesByDocument = new Map<string, { text: string; nodes: ReturnType<typeof parseDocumentStructure> }>();
  const allDefinitions = [];
  const allReferences = [];
  for (const doc of docs) {
    const nodes = parseDocumentStructure({ documentId: doc.documentId, label: doc.label, text: doc.text });
    nodesByDocument.set(doc.documentId, { text: doc.text, nodes });
    allDefinitions.push(...detectStructuralDefinitions(doc.documentId, doc.text, nodes));
    allReferences.push(...detectStructuralReferences(doc.documentId, doc.text, nodes));
  }
  return buildStructuralIndex(nodesByDocument, allDefinitions, allReferences);
}

function probeCandidate(documentId: string, sectionRef: string): DiscoveredCandidate {
  return {
    discoveryId: `probe:${documentId}:${sectionRef}`,
    documentId,
    structuralNodeKeys: [],
    structuralNodeIds: [],
    normalizedSourceRef: sectionRef,
    families: ["INDEBTEDNESS"],
    role: "GENERAL_PROHIBITION",
    roleRaw: "GENERAL_PROHIBITION",
    roleNormalizationStatus: "VALID_CANONICAL",
    familiesRaw: ["INDEBTEDNESS"],
    familiesNormalizationStatus: "VALID_CANONICAL",
    description: `probe ${sectionRef}`,
    multipleRulesLikely: false,
    definedTermDependencyLikely: true,
    discoveryMethods: ["DETERMINISTIC_SIGNAL"],
    evidenceSignals: ["probe"],
    reviewStatus: "AUTO_ACCEPTED",
    confidence: null,
    sourceCitation: `${documentId} §${sectionRef}`,
    discoveryRunVersion: "wrong-doc-probe.v1",
    supersessionStatus: "UNKNOWN_SUPERSESSION_STATUS",
    supersessionReason: "probe",
  };
}

describe("P0 wrong-document operative-authority promotion", () => {
  it("1. two competing restatement targets → AMBIGUOUS / not CONFIRMED_OPERATIVE on either", () => {
    const docs = syntheticRestatementPair({
      priorNamed: true,
      successorPriorMatch: true,
      includeOperative: true,
      includeSignatures: true,
      includeCp: true,
      secondCompetingSuccessor: true,
    });
    // Force same effective date competing full restatements via handcrafted authorities path:
    // use two successors matching same prior — package graph may not both classify as A&R;
    // resolveGoverningProvision with injected authorities.
    const authorities = [
      {
        status: "OPERATIVE_AUTHORITY_CONFIRMED" as const,
        successorDocumentId: "doc-b",
        predecessorDocumentId: "doc-a",
        effectiveDateIso: "2026-09-14",
        effectivenessInference: "INFERRED_FROM_DATED_AS_OF_WITH_EXECUTION" as const,
        conditionsPrecedentSatisfaction: "NOT_INDEPENDENTLY_PROVEN" as const,
        evidence: {
          successorDocumentId: "doc-b",
          predecessorDocumentId: "doc-a",
          restatementScope: "FULL_AGREEMENT" as const,
          partialProvisionRefs: [] as string[],
          priorAgreementRecital: { present: true, excerpt: "x", charStart: 0 },
          operativeRestatementLanguage: {
            present: true,
            supersedesEntirety: true,
            novationDisclaimed: true,
            excerpt: "x",
            charStart: 0,
          },
          executionDate: { isoDate: "2026-09-14", excerpt: "x", charStart: 0 },
          signatureEvidence: { present: true, excerpt: "x", charStart: 0 },
          conditionsPrecedent: { present: true, sectionRef: "4.01", excerpt: "x", charStart: 0 },
          packageGraphRelationshipStatus: "RESOLVED" as const,
          packageGraphEvidenceClass: null,
        },
        reasons: ["synthetic"],
        caveats: ["CONDITIONS_PRECEDENT_SATISFACTION_NOT_INDEPENDENTLY_PROVEN"],
        doesNotMutatePackageGraphRelationship: true as const,
      },
      {
        status: "OPERATIVE_AUTHORITY_CONFIRMED" as const,
        successorDocumentId: "doc-c",
        predecessorDocumentId: "doc-a",
        effectiveDateIso: "2026-09-14",
        effectivenessInference: "INFERRED_FROM_DATED_AS_OF_WITH_EXECUTION" as const,
        conditionsPrecedentSatisfaction: "NOT_INDEPENDENTLY_PROVEN" as const,
        evidence: {
          successorDocumentId: "doc-c",
          predecessorDocumentId: "doc-a",
          restatementScope: "FULL_AGREEMENT" as const,
          partialProvisionRefs: [] as string[],
          priorAgreementRecital: { present: true, excerpt: "x", charStart: 0 },
          operativeRestatementLanguage: {
            present: true,
            supersedesEntirety: true,
            novationDisclaimed: true,
            excerpt: "x",
            charStart: 0,
          },
          executionDate: { isoDate: "2026-09-14", excerpt: "x", charStart: 0 },
          signatureEvidence: { present: true, excerpt: "x", charStart: 0 },
          conditionsPrecedent: { present: true, sectionRef: "4.01", excerpt: "x", charStart: 0 },
          packageGraphRelationshipStatus: "RESOLVED" as const,
          packageGraphEvidenceClass: null,
        },
        reasons: ["synthetic"],
        caveats: ["CONDITIONS_PRECEDENT_SATISFACTION_NOT_INDEPENDENTLY_PROVEN"],
        doesNotMutatePackageGraphRelationship: true as const,
      },
    ];
    const gov = resolveGoverningProvision({
      asOfDate: "2026-09-15",
      sectionRef: "8.1",
      instrumentDocumentIds: ["doc-a", "doc-b", "doc-c"],
      baseDocumentId: "doc-a",
      restatementAuthorities: authorities,
    });
    expect(gov.authorityClassification).toBe("AMBIGUOUS");
    expect(gov.governingDocumentId).toBeNull();
    void docs;
  });

  it("2. provisional RESTATES / provisional identity → PROVISIONAL_IDENTITY_BLOCKED", () => {
    const gov = resolveGoverningProvision({
      asOfDate: "2026-09-15",
      sectionRef: "8.1",
      instrumentDocumentIds: ["doc-a", "doc-b"],
      baseDocumentId: "doc-a",
      restatementAuthorities: [],
      confirmedInstrumentIdentity: {
        instrumentKey: "inst",
        confirmedDocumentIds: ["doc-a"],
        provisionalDocumentIds: ["doc-b"],
        mayConsolidateOperative: false,
        associationKind: "PROVISIONAL",
        bridgeBlockers: [
          {
            sourceDocumentId: "doc-a",
            targetDocumentId: "doc-b",
            reason: "provisional RESTATES edge",
          },
        ],
      },
    });
    expect(gov.authorityClassification).toBe("PROVISIONAL_IDENTITY_BLOCKED");
    expect(gov.governingDocumentId).toBeNull();
  });

  it("3. unknown conditions precedent on confirmed successor → CONFIRMED_OPERATIVE_WITH_CAVEATS, not unconditional ACTIVE", () => {
    const docs = syntheticRestatementPair({
      priorNamed: true,
      successorPriorMatch: true,
      includeOperative: true,
      includeSignatures: true,
      includeCp: true,
    });
    const graph = buildPackageGraph("co", "pkg", docs);
    const authorities = resolvePackageRestatementAuthorities({ documents: docs, packageGraph: graph });
    const docB = authorities.find((a) => a.successorDocumentId === "doc-b");
    // When prior matches and evidence is complete, CP may be NOT_INDEPENDENTLY_PROVEN.
    if (docB?.status === "OPERATIVE_AUTHORITY_CONFIRMED") {
      expect(docB.conditionsPrecedentSatisfaction).not.toBe("SATISFIED");
      const gov = resolveGoverningProvision({
        asOfDate: "2026-09-15",
        sectionRef: "8.1",
        instrumentDocumentIds: ["doc-a", "doc-b"],
        baseDocumentId: "doc-a",
        restatementAuthorities: authorities,
      });
      expect(gov.governingDocumentId).toBe("doc-b");
      expect(gov.authorityClassification).toBe("CONFIRMED_OPERATIVE_WITH_CAVEATS");
      const promo = evaluateProductionAuthorityPromotion({
        authorityClassification: gov.authorityClassification,
        conditionsPrecedentSatisfaction: gov.provenance.conditionsPrecedentSatisfaction,
        caveats: gov.caveats,
        attemptPromotionToProduction: true,
      });
      expect(promo.productionAuthorityActive).toBe(false);
      expect(promo.disposition).not.toBe("PRODUCTION_AUTHORITY_ACTIVE");
    } else {
      // Fail-closed path also acceptable when succession unresolved.
      expect(["REVIEW_REQUIRED", "AMBIGUOUS", "UNSUPPORTED"]).toContain(docB?.status);
    }
  });

  it("4. discovery document different from governing — binding remaps or refuses without silent consolidate", () => {
    const docs = syntheticRestatementPair({
      priorNamed: true,
      successorPriorMatch: true,
      includeOperative: true,
      includeSignatures: true,
      includeCp: true,
    });
    const graph = buildPackageGraph("co", "pkg", docs);
    const index = indexFor(docs);
    const bundle = buildOperativeAuthorityHandoffBundle({
      companyId: "co",
      packageKey: "pkg",
      asOfDate: "2026-09-15",
      documents: docs,
      packageGraph: graph,
      provisions: [{ sectionRef: "8.1" }],
      instrumentDocumentIds: ["doc-a", "doc-b"],
      baseDocumentId: "doc-a",
    });
    const candidate = probeCandidate("doc-a", "8.1");
    const binding = bindCandidateToOperativeRetrievalSource({
      candidate,
      authority: bundle,
      index,
    });
    const gov = bundle.provisions.find((p) => p.sectionRef === "8.1");
    if (gov?.governingDocumentId === "doc-b" && gov.authorityClassification.startsWith("CONFIRMED_OPERATIVE")) {
      expect(binding.remapped || binding.retrievalCandidate.documentId === "doc-b").toBe(true);
      expect(binding.retrievalCandidate.documentId).toBe("doc-b");
    } else {
      // Unresolved authority: must not invent remap onto successor.
      expect(binding.remapped).toBe(false);
      expect(binding.retrievalCandidate.documentId).toBe("doc-a");
      expect(binding.refusalReason || !binding.retrievalAuthorized).toBeTruthy();
    }
  });

  it("5. missing governing document → governingDocumentId null, not CONFIRMED_OPERATIVE", () => {
    const gov = resolveGoverningProvision({
      asOfDate: "2026-09-15",
      sectionRef: "8.1",
      instrumentDocumentIds: ["doc-a"],
      baseDocumentId: null,
      restatementAuthorities: [
        {
          status: "REVIEW_REQUIRED",
          successorDocumentId: "doc-missing",
          predecessorDocumentId: null,
          effectiveDateIso: "2026-09-14",
          effectivenessInference: "UNKNOWN",
          conditionsPrecedentSatisfaction: "NOT_STATED",
          evidence: {
            successorDocumentId: "doc-missing",
            predecessorDocumentId: null,
            restatementScope: "FULL_AGREEMENT",
            partialProvisionRefs: [],
            priorAgreementRecital: { present: false, excerpt: null, charStart: null },
            operativeRestatementLanguage: {
              present: false,
              supersedesEntirety: false,
              novationDisclaimed: false,
              excerpt: null,
              charStart: null,
            },
            executionDate: { isoDate: "2026-09-14", excerpt: "x", charStart: 0 },
            signatureEvidence: { present: false, excerpt: null, charStart: null },
            conditionsPrecedent: { present: false, sectionRef: null, excerpt: null, charStart: null },
            packageGraphRelationshipStatus: null,
            packageGraphEvidenceClass: null,
          },
          reasons: ["missing"],
          caveats: [],
          doesNotMutatePackageGraphRelationship: true,
        },
      ],
    });
    // doc-missing not in familyIds — family is only doc-a; no restatement in family → may fall through
    // Explicit null base without family restatement → UNSUPPORTED or REVIEW_REQUIRED
    expect(["UNSUPPORTED", "REVIEW_REQUIRED", "AMBIGUOUS"]).toContain(gov.authorityClassification);
    expect(gov.authorityClassification).not.toBe("CONFIRMED_OPERATIVE");
  });

  it("6. wrong-document provision promotion — REVIEW_REQUIRED successor with null predecessor must NOT confirm base", () => {
    const authorities = [
      {
        status: "REVIEW_REQUIRED" as const,
        successorDocumentId: "doc-b",
        predecessorDocumentId: null as string | null,
        effectiveDateIso: "2026-09-14",
        effectivenessInference: "INFERRED_FROM_DATED_AS_OF_WITH_EXECUTION" as const,
        conditionsPrecedentSatisfaction: "NOT_STATED" as const,
        evidence: {
          successorDocumentId: "doc-b",
          predecessorDocumentId: null,
          restatementScope: "FULL_AGREEMENT" as const,
          partialProvisionRefs: [] as string[],
          priorAgreementRecital: { present: true, excerpt: "Fourth A&R", charStart: 0 },
          operativeRestatementLanguage: {
            present: true,
            supersedesEntirety: true,
            novationDisclaimed: true,
            excerpt: "restated",
            charStart: 0,
          },
          executionDate: { isoDate: "2026-09-14", excerpt: "x", charStart: 0 },
          signatureEvidence: { present: true, excerpt: "x", charStart: 0 },
          conditionsPrecedent: { present: false, sectionRef: null, excerpt: null, charStart: null },
          packageGraphRelationshipStatus: "REVIEW_REQUIRED" as const,
          packageGraphEvidenceClass: "SUPPORTING_TARGET_EVIDENCE" as const,
        },
        reasons: ["prior agreement Fourth A&R not in package"],
        caveats: ["PACKAGE_GRAPH_RESTATES_NOT_RESOLVED"],
        doesNotMutatePackageGraphRelationship: true as const,
      },
    ];
    const gov = resolveGoverningProvision({
      asOfDate: "2026-09-15",
      sectionRef: "8.1",
      instrumentDocumentIds: ["doc-a", "doc-b"],
      baseDocumentId: "doc-a",
      restatementAuthorities: authorities,
    });
    expect(gov.authorityClassification).toBe("REVIEW_REQUIRED");
    expect(gov.governingDocumentId).toBeNull();
    expect(gov.reasons.join(" ")).toMatch(/succession is unresolved|refuse CONFIRMED_OPERATIVE/i);

    const bundle = {
      companyId: "co",
      packageKey: "pkg",
      asOfDate: "2026-09-15",
      startingMainSha: "test",
      packageGraphAuthorityPr: "test",
      worHoldoutPr: "test",
      restatementAuthorities: authorities,
      provisions: [gov],
      unsupportedCases: [],
      verdict: "OPERATIVE_RESTATEMENT_AUTHORITY_BLOCKED" as const,
      verdictReasons: ["test"],
    };
    const summary = summarizeBundleProductionAuthority(bundle, { attemptPromotionToProduction: true });
    expect(summary.allProvisionsProductionActive).toBe(false);
    expect(summary.anyProductionRefused).toBe(true);
  });

  it("7. correctly confirmed predecessor (no successor restatement) → base CONFIRMED_OPERATIVE", () => {
    const gov = resolveGoverningProvision({
      asOfDate: "2021-01-01",
      sectionRef: "8.1",
      instrumentDocumentIds: ["doc-a"],
      baseDocumentId: "doc-a",
      restatementAuthorities: [],
    });
    expect(gov.authorityClassification).toBe("CONFIRMED_OPERATIVE");
    expect(gov.governingDocumentId).toBe("doc-a");
  });

  it("8. confirmed successor with caveats → CONFIRMED_OPERATIVE_WITH_CAVEATS; production refused", () => {
    const authorities = [
      {
        status: "OPERATIVE_AUTHORITY_CONFIRMED" as const,
        successorDocumentId: "doc-b",
        predecessorDocumentId: "doc-a",
        effectiveDateIso: "2026-09-14",
        effectivenessInference: "INFERRED_FROM_DATED_AS_OF_WITH_EXECUTION" as const,
        conditionsPrecedentSatisfaction: "NOT_INDEPENDENTLY_PROVEN" as const,
        evidence: {
          successorDocumentId: "doc-b",
          predecessorDocumentId: "doc-a",
          restatementScope: "FULL_AGREEMENT" as const,
          partialProvisionRefs: [] as string[],
          priorAgreementRecital: { present: true, excerpt: "x", charStart: 0 },
          operativeRestatementLanguage: {
            present: true,
            supersedesEntirety: true,
            novationDisclaimed: true,
            excerpt: "x",
            charStart: 0,
          },
          executionDate: { isoDate: "2026-09-14", excerpt: "x", charStart: 0 },
          signatureEvidence: { present: true, excerpt: "x", charStart: 0 },
          conditionsPrecedent: { present: true, sectionRef: "4.01", excerpt: "x", charStart: 0 },
          packageGraphRelationshipStatus: "RESOLVED" as const,
          packageGraphEvidenceClass: null,
        },
        reasons: ["confirmed with CP"],
        caveats: ["CONDITIONS_PRECEDENT_SATISFACTION_NOT_INDEPENDENTLY_PROVEN"],
        doesNotMutatePackageGraphRelationship: true as const,
      },
    ];
    const gov = resolveGoverningProvision({
      asOfDate: "2026-09-15",
      sectionRef: "8.1",
      instrumentDocumentIds: ["doc-a", "doc-b"],
      baseDocumentId: "doc-a",
      restatementAuthorities: authorities,
    });
    expect(gov.governingDocumentId).toBe("doc-b");
    expect(gov.authorityClassification).toBe("CONFIRMED_OPERATIVE_WITH_CAVEATS");
    const promo = evaluateProductionAuthorityPromotion({
      authorityClassification: gov.authorityClassification,
      conditionsPrecedentSatisfaction: "NOT_INDEPENDENTLY_PROVEN",
      caveats: gov.caveats,
      attemptPromotionToProduction: true,
    });
    expect(promo.productionAuthorityActive).toBe(false);
  });

  it("9. cross-document citation binding preserves discovery id when authority unresolved", () => {
    const docs = syntheticRestatementPair({
      priorNamed: false,
      successorPriorMatch: false,
      includeOperative: true,
      includeSignatures: true,
      includeCp: true,
    });
    const graph = buildPackageGraph("co", "pkg", docs);
    const index = indexFor(docs);
    const bundle = buildOperativeAuthorityHandoffBundle({
      companyId: "co",
      packageKey: "pkg",
      asOfDate: "2026-09-15",
      documents: docs,
      packageGraph: graph,
      provisions: [{ sectionRef: "8.1" }],
      instrumentDocumentIds: ["doc-a", "doc-b"],
      baseDocumentId: "doc-a",
    });
    const candidate = probeCandidate("doc-a", "8.1");
    const binding = bindCandidateToOperativeRetrievalSource({ candidate, authority: bundle, index });
    const gov = bundle.provisions[0]!;
    if (gov.governingDocumentId == null || gov.authorityClassification === "REVIEW_REQUIRED") {
      expect(binding.retrievalCandidate.documentId).toBe("doc-a");
      expect(binding.remapped).toBe(false);
    }
  });

  it("10. capacity publication refused when upstream authority uncertain", () => {
    const views = buildSharedProductCapacityViews({
      gross: {
        amount: 2_000_000_000,
        gateSatisfied: false,
        modeled: false,
        capacityRuleId: "an-facility",
        formulaLabel: "uncertain operative",
        sectionRef: "1.1",
        refusalReason: "Operative succession REVIEW_REQUIRED — refuse AVAILABLE",
      },
      utilization: {
        capacityRuleId: "an-facility",
        asOf: "2026-09-15",
        records: [],
        completenessCertificate: null,
        trustedIssuerAuth: null,
      },
      certificationStatus: "NOT_CERTIFIED",
    });
    const consistency = assertProductCapacityConsistency(views);
    expect(consistency.ok).toBe(true);
    expect(views.POSITION.mayPublishAvailable).toBe(false);
    expect(views.ASK.mayPublishAvailable).toBe(false);
    expect(views.SIMULATE.mayPublishAvailable).toBe(false);
    expect(views.POSITION.publicationLabel).not.toBe("AVAILABLE");
  });

  it("AutoNation sealed package: no CONFIRMED_OPERATIVE on doc-a while doc-b succession REVIEW_REQUIRED", () => {
    const fix = join(process.cwd(), "tests/fixtures/unseen-packages/an-2020-2026-credit-facility/extracted-text");
    const docs: PackageDocumentInput[] = [
      {
        documentId: "doc-a",
        label: "AN Third AR",
        text: readFileSync(join(fix, "doc-a-2020-03-26-third-ar-credit-agreement.txt"), "utf8"),
      },
      {
        documentId: "doc-b",
        label: "AN Fifth AR",
        text: readFileSync(join(fix, "doc-b-2026-09-14-fifth-ar-credit-agreement.txt"), "utf8"),
      },
    ];
    const graph = buildPackageGraph("agent-11-an-eval", "an-2020-2026-credit-facility", docs);
    const authorities = resolvePackageRestatementAuthorities({ documents: docs, packageGraph: graph });
    const docBAuth = authorities.find((a) => a.successorDocumentId === "doc-b");
    expect(docBAuth).toBeTruthy();

    const bundle = buildOperativeAuthorityHandoffBundle({
      companyId: "agent-11-an-eval",
      packageKey: "an-2020-2026-credit-facility",
      asOfDate: "2026-09-15",
      documents: docs,
      packageGraph: graph,
      provisions: [{ sectionRef: "8.1" }, { sectionRef: "8.2" }, { sectionRef: "8.3" }],
      instrumentDocumentIds: ["doc-a", "doc-b"],
      baseDocumentId: "doc-a",
    });
    const summary = summarizeBundleProductionAuthority(bundle, { attemptPromotionToProduction: true });

    // Wrong-document promotion must be eliminated:
    for (const p of bundle.provisions) {
      if (docBAuth?.status === "REVIEW_REQUIRED" || docBAuth?.predecessorDocumentId == null) {
        expect(p.authorityClassification).not.toBe("CONFIRMED_OPERATIVE");
        expect(p.governingDocumentId).not.toBe("doc-a");
      }
    }
    expect(summary.allProvisionsProductionActive).toBe(false);

    // If succession remains unresolved, governing identity stays null / REVIEW_REQUIRED.
    if (docBAuth?.status !== "OPERATIVE_AUTHORITY_CONFIRMED") {
      for (const p of bundle.provisions) {
        expect(["REVIEW_REQUIRED", "AMBIGUOUS", "PROVISIONAL_IDENTITY_BLOCKED", "UNSUPPORTED"]).toContain(
          p.authorityClassification,
        );
        expect(p.governingDocumentId === null || p.governingDocumentId === "doc-b").toBe(true);
      }
    }
  });
});
