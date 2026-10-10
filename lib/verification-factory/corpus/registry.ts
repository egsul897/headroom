/**
 * Public case registry — metadata + pointers to existing scenarios.
 * Does not duplicate scenario bodies; wraps Agent 5 / A8 / sequential assets.
 * Holdout expected outcomes are NEVER listed here.
 */

import { CVF_GROUND_TRUTH_CONTRACT_VERSION } from "../version";
import type { GroundTruthProvenance, VerificationCaseMeta } from "../types";
import { AUTHENTIC_PACKAGE_SCENARIOS } from "@/lib/product/covenant-intelligence/cross-document-authentic-packages";
import { AUTHENTIC_CROSS_DOCUMENT_SCENARIOS } from "@/lib/product/covenant-intelligence/cross-document-scenarios";
import { ADVERSARIAL_CROSS_DOCUMENT_SCENARIOS } from "@/lib/product/covenant-intelligence/cross-document-adversarial";
import { listGroundedExpansionCases } from "./grounded-expansion";

function gt(partial: Omit<GroundTruthProvenance, "contractVersion" | "notDerivedFromEngine">): GroundTruthProvenance {
  return {
    contractVersion: CVF_GROUND_TRUTH_CONTRACT_VERSION,
    notDerivedFromEngine: true,
    ...partial,
  };
}

function authenticCases(): VerificationCaseMeta[] {
  return AUTHENTIC_PACKAGE_SCENARIOS.map((s) =>
    ({
      caseId: s.scenarioId,
      title: s.title,
      lane: "CROSS_DOCUMENT",
      fixtureClass: "PUBLIC_DEVELOPMENT",
      mechanics: ["CROSS_DOCUMENT", "DEBT_BASKET", "LIEN_BASKET", "RESTRICTED_PAYMENT", "SHARED_CAPACITY"],
      structureFamilies: [
        `package:${s.packageId}`,
        `authentic:${s.packageId}`,
        `kind:${s.transaction.kind}`,
        `outcome:${s.expectedOverall}`,
      ],
      sourcePackageIds: [s.packageId],
      adapter: "cross-document",
      provenance: gt({
        issuerId: s.packageId.split("-")[0] ?? s.packageId,
        financingPackageId: s.packageId,
        sourceDocuments: s.fixturePaths.map((path, i) => ({
          documentId: `${s.packageId}-doc-${i}`,
          path,
          sha256: null,
        })),
        operativeAsOf: s.transaction.asOfDate,
        relevantSections: s.independentGroundTruth.mustCiteSectionRefs,
        relevantDefinitions: [],
        independentlyEnumeratedRestrictions: s.independentGroundTruth.applicableRestrictions.map((r) => ({
          sectionRef: r,
          family: "CROSS_DOCUMENT",
          whyApplicable: r,
        })),
        expectedLegalOutcome: s.expectedOverall,
        reviewerIdentity: "agent5-predeclared-authentic-ground-truth",
        reviewProvenance:
          "Expected outcomes authored from EDGAR fixture text before evaluator execution (Agent 5 authentic packages).",
        confidence: "HIGH",
        unresolvedAmbiguities: [],
        frozenAt: "2026-10-09T00:00:00.000Z",
      }),
      tags: ["authentic-edgar", "agent5"],
    }) satisfies VerificationCaseMeta,
  );
}

function syntheticCases(): VerificationCaseMeta[] {
  return AUTHENTIC_CROSS_DOCUMENT_SCENARIOS.map((s) =>
    ({
      caseId: s.scenarioId,
      title: s.title,
      lane: "CROSS_DOCUMENT",
      fixtureClass: "FROZEN_REGRESSION",
      mechanics: ["CROSS_DOCUMENT"],
      structureFamilies: [`synthetic:${s.scenarioId}`, `outcome:${s.expectedOverall}`],
      sourcePackageIds: ["synthetic-product-acceptance"],
      adapter: "cross-document",
      provenance: gt({
        issuerId: "synthetic",
        financingPackageId: "synthetic-product-acceptance",
        sourceDocuments: [
          {
            documentId: "synthetic",
            path: "tests/fixtures/product-acceptance/packages/",
            sha256: null,
          },
        ],
        operativeAsOf: s.transaction.asOfDate,
        relevantSections: [s.scenarioId],
        relevantDefinitions: [],
        independentlyEnumeratedRestrictions: [
          {
            sectionRef: s.scenarioId,
            family: "CROSS_DOCUMENT",
            whyApplicable: s.title,
          },
        ],
        expectedLegalOutcome: s.expectedOverall,
        reviewerIdentity: "agent5-synthetic-baseline",
        reviewProvenance: "PR #218 synthetic product-acceptance scenarios — frozen regression.",
        confidence: "MEDIUM",
        unresolvedAmbiguities: ["Synthetic issuer — not authentic EDGAR"],
        frozenAt: "2026-10-09T00:00:00.000Z",
      }),
      tags: ["synthetic", "frozen-regression"],
    }) satisfies VerificationCaseMeta,
  );
}

function adversarialCases(): VerificationCaseMeta[] {
  return ADVERSARIAL_CROSS_DOCUMENT_SCENARIOS.map((s) =>
    ({
      caseId: s.scenarioId,
      title: `${s.attack}: ${s.title}`,
      lane: "ADVERSARIAL_METAMORPHIC",
      fixtureClass: "FROZEN_REGRESSION",
      mechanics: ["ADVERSARIAL_METAMORPHIC", "CROSS_DOCUMENT"],
      structureFamilies: [`adversarial:${s.attack}`, `outcome:${s.expectedOverall}`],
      sourcePackageIds: ["adversarial-synthetic"],
      adapter: "cross-document",
      provenance: gt({
        issuerId: "adversarial",
        financingPackageId: "adversarial-synthetic",
        sourceDocuments: [{ documentId: "adv", path: "lib/product/covenant-intelligence/cross-document-adversarial.ts", sha256: null }],
        operativeAsOf: s.transaction.asOfDate,
        relevantSections: [s.attack],
        relevantDefinitions: [],
        independentlyEnumeratedRestrictions: [
          { sectionRef: s.attack, family: "ADVERSARIAL", whyApplicable: s.attack },
        ],
        expectedLegalOutcome: s.expectedOverall,
        reviewerIdentity: "agent5-adversarial",
        reviewProvenance: "Pre-declared adversarial attack expectations (Agent 5).",
        confidence: "HIGH",
        unresolvedAmbiguities: [],
        frozenAt: "2026-10-09T00:00:00.000Z",
      }),
      tags: ["adversarial", s.attack],
    }) satisfies VerificationCaseMeta,
  );
}

function factoryNativeCases(): VerificationCaseMeta[] {
  return [
    {
      caseId: "a8-01-status-floor-wired",
      title: "A8-01: GATE_NOT_SATISFIED never publishes AVAILABLE",
      lane: "CAPACITY_GATE_STATUS",
      fixtureClass: "FROZEN_REGRESSION",
      mechanics: ["CAPACITY_GATE_STATUS", "LEDGER_UTILIZATION"],
      structureFamilies: ["defect:A8-01", "package:capacity-runtime"],
      sourcePackageIds: ["capacity-runtime"],
      adapter: "capacity-a8",
      provenance: gt({
        issuerId: "runtime",
        financingPackageId: "capacity-runtime",
        sourceDocuments: [
          { documentId: "state", path: "lib/contract-model/runtime/capacity/state.ts", sha256: null },
        ],
        operativeAsOf: "2026-10-09",
        relevantSections: ["GATE_NOT_SATISFIED"],
        relevantDefinitions: [],
        independentlyEnumeratedRestrictions: [
          {
            sectionRef: "GATE_NOT_SATISFIED",
            family: "CAPACITY_GATE",
            whyApplicable: "Failed gate is a determined negative permission outcome",
          },
        ],
        expectedLegalOutcome: "AVAILABLE_FORBIDDEN",
        reviewerIdentity: "agent8-a8-01",
        reviewProvenance: "DEFECT-A8-01 remediation + permanent regression suite.",
        confidence: "HIGH",
        unresolvedAmbiguities: [],
        frozenAt: "2026-10-09T00:00:00.000Z",
      }),
      tags: ["a8", "capacity"],
    },
    {
      caseId: "seq-conmed-debt-rp-overflow",
      title: "Sequential CONMED debt → RP → overflow (hypothetical isolation)",
      lane: "SEQUENTIAL_TRANSACTION",
      fixtureClass: "PUBLIC_DEVELOPMENT",
      mechanics: ["SEQUENTIAL_TRANSACTION", "CROSS_DOCUMENT", "RESTRICTED_PAYMENT", "DEBT_BASKET"],
      structureFamilies: ["package:conmed-2025-credit-facility", "authentic:conmed", "sequence:debt-rp-overflow"],
      sourcePackageIds: ["conmed-2025-credit-facility"],
      adapter: "sequential-conmed",
      provenance: gt({
        issuerId: "conmed",
        financingPackageId: "conmed-2025-credit-facility",
        sourceDocuments: [
          {
            documentId: "vii",
            path: "tests/fixtures/unseen-packages/conmed-2025-credit-facility/curated/base-credit-agreement-article-vii-negative-covenants.txt",
            sha256: null,
          },
        ],
        operativeAsOf: "2026-06-30",
        relevantSections: ["7.2(o)", "7.6"],
        relevantDefinitions: [],
        independentlyEnumeratedRestrictions: [
          { sectionRef: "7.2(o)", family: "DEBT", whyApplicable: "General unsecured basket" },
          { sectionRef: "7.6", family: "RP", whyApplicable: "Fiscal-year RP basket" },
        ],
        expectedLegalOutcome: "PROHIBITED",
        expectedFinancialNotes: ["Step 3 $20M exceeds remaining $10M §7.2(o) headroom"],
        reviewerIdentity: "agent5-sequential",
        reviewProvenance: "Pre-declared sequential demo expectations.",
        confidence: "HIGH",
        unresolvedAmbiguities: [],
        frozenAt: "2026-10-09T00:00:00.000Z",
      }),
      tags: ["sequential", "conmed"],
    },
    {
      caseId: "meta-remove-source-no-improve",
      title: "Metamorphic: removing applicable restrictions must not create PERMITTED under absent ICA",
      lane: "ADVERSARIAL_METAMORPHIC",
      fixtureClass: "FROZEN_REGRESSION",
      mechanics: ["ADVERSARIAL_METAMORPHIC", "CROSS_DOCUMENT", "INTERCREDITOR"],
      structureFamilies: ["metamorphic:remove-source", "package:gibraltar-2026-credit-agreement"],
      sourcePackageIds: ["gibraltar-2026-credit-agreement"],
      adapter: "metamorphic-cross-document",
      provenance: gt({
        issuerId: "gibraltar",
        financingPackageId: "gibraltar-2026-credit-agreement",
        sourceDocuments: [
          {
            documentId: "ca",
            path: "tests/fixtures/unseen-packages/gibraltar-2026-credit-agreement/extracted-text/credit-agreement.txt",
            sha256: null,
          },
        ],
        operativeAsOf: "2026-03-31",
        relevantSections: ["7.02", "9.15"],
        relevantDefinitions: [],
        independentlyEnumeratedRestrictions: [
          { sectionRef: "7.02", family: "LIENS", whyApplicable: "Secured debt" },
        ],
        expectedLegalOutcome: "MATCH_BASELINE",
        reviewerIdentity: "cvf-metamorphic",
        reviewProvenance: "CVF metamorphic invariant — not derived from engine.",
        confidence: "HIGH",
        unresolvedAmbiguities: [],
        frozenAt: "2026-10-09T00:00:00.000Z",
      }),
      tags: ["metamorphic"],
    },
    {
      caseId: "meta-add-restriction-no-improve",
      title: "Metamorphic: adding prohibition must not improve favorability",
      lane: "ADVERSARIAL_METAMORPHIC",
      fixtureClass: "FROZEN_REGRESSION",
      mechanics: ["ADVERSARIAL_METAMORPHIC", "CROSS_DOCUMENT"],
      structureFamilies: ["metamorphic:add-restriction", "package:conmed-2025-credit-facility"],
      sourcePackageIds: ["conmed-2025-credit-facility"],
      adapter: "metamorphic-cross-document",
      provenance: gt({
        issuerId: "conmed",
        financingPackageId: "conmed-2025-credit-facility",
        sourceDocuments: [
          {
            documentId: "vii",
            path: "tests/fixtures/unseen-packages/conmed-2025-credit-facility/curated/base-credit-agreement-article-vii-negative-covenants.txt",
            sha256: null,
          },
        ],
        operativeAsOf: "2026-06-30",
        relevantSections: ["7.2(o)"],
        relevantDefinitions: [],
        independentlyEnumeratedRestrictions: [
          { sectionRef: "synthetic-extra-cap", family: "SHARED_CAPACITY", whyApplicable: "Added prohibition" },
        ],
        expectedLegalOutcome: "MATCH_BASELINE",
        reviewerIdentity: "cvf-metamorphic",
        reviewProvenance: "CVF metamorphic invariant.",
        confidence: "HIGH",
        unresolvedAmbiguities: [],
        frozenAt: "2026-10-09T00:00:00.000Z",
      }),
      tags: ["metamorphic"],
    },
    {
      caseId: "meta-replay-identical",
      title: "Metamorphic: identical inputs → identical results",
      lane: "ADVERSARIAL_METAMORPHIC",
      fixtureClass: "FROZEN_REGRESSION",
      mechanics: ["ADVERSARIAL_METAMORPHIC"],
      structureFamilies: ["metamorphic:determinism", "package:fwrg-2021-credit-agreement"],
      sourcePackageIds: ["fwrg-2021-credit-agreement"],
      adapter: "metamorphic-cross-document",
      provenance: gt({
        issuerId: "fwrg",
        financingPackageId: "fwrg-2021-credit-agreement",
        sourceDocuments: [
          {
            documentId: "a6",
            path: "tests/fixtures/unseen-packages/fwrg-2021-credit-agreement/article-6-negative-covenants.txt",
            sha256: null,
          },
        ],
        operativeAsOf: "2024-12-31",
        relevantSections: ["6.01(j)"],
        relevantDefinitions: [],
        independentlyEnumeratedRestrictions: [
          { sectionRef: "6.01(j)", family: "DEBT", whyApplicable: "Non-Loan Party basket" },
        ],
        expectedLegalOutcome: "MATCH_BASELINE",
        reviewerIdentity: "cvf-metamorphic",
        reviewProvenance: "CVF determinism invariant.",
        confidence: "HIGH",
        unresolvedAmbiguities: [],
        frozenAt: "2026-10-09T00:00:00.000Z",
      }),
      tags: ["metamorphic", "determinism"],
    },
  ];
}

/**
 * In-repo sealed example — readable by agents ⇒ FROZEN_REGRESSION, not BLIND.
 * Truly blind answer keys must live outside the agent-accessible workspace.
 */
export const EXAMPLE_HOLDOUT_SEAL_META: VerificationCaseMeta = {
  caseId: "holdout-example-sealed",
  title: "In-repo sealed holdout example (FROZEN_REGRESSION — not blind)",
  lane: "CROSS_DOCUMENT",
  fixtureClass: "FROZEN_REGRESSION",
  mechanics: ["CROSS_DOCUMENT"],
  structureFamilies: ["holdout:example", "package:sealed", "isolation:frozen-not-blind"],
  sourcePackageIds: ["sealed-holdout-example"],
  adapter: "suite-pointer",
  provenance: {
    holdoutSealId: "holdout-example-v1",
    fixtureClass: "FROZEN_REGRESSION",
    isolationNote:
      "Payload path is in-repo under holdouts-SEALED/. Label is FROZEN_REGRESSION, not BLIND_AUTHENTIC_HOLDOUT. Blind keys require external storage outside agent workspace.",
  },
  tags: ["holdout", "sealed", "frozen-regression", "not-blind"],
};

export function listPublicRegistryCases(): VerificationCaseMeta[] {
  return [
    ...authenticCases(),
    ...syntheticCases(),
    ...adversarialCases(),
    ...factoryNativeCases(),
    ...listGroundedExpansionCases(),
    EXAMPLE_HOLDOUT_SEAL_META,
  ];
}

export function listExecutableRegistryCases(): VerificationCaseMeta[] {
  // Sealed provenance (holdoutSealId) is never executable without unlock + dedicated adapter.
  // BLIND_AUTHENTIC_HOLDOUT is reserved for external answer keys and also excluded.
  return listPublicRegistryCases().filter(
    (c) => !("holdoutSealId" in c.provenance) && c.fixtureClass !== "BLIND_AUTHENTIC_HOLDOUT",
  );
}

export function diversityReport(cases: VerificationCaseMeta[] = listPublicRegistryCases()): {
  caseCount: number;
  structureFamilies: string[];
  packages: string[];
  lanes: string[];
  fixtureClasses: Record<string, number>;
} {
  const families = new Set<string>();
  const packages = new Set<string>();
  const lanes = new Set<string>();
  const fixtureClasses: Record<string, number> = {};
  for (const c of cases) {
    for (const f of c.structureFamilies) families.add(f);
    for (const p of c.sourcePackageIds) packages.add(p);
    lanes.add(c.lane);
    fixtureClasses[c.fixtureClass] = (fixtureClasses[c.fixtureClass] ?? 0) + 1;
  }
  return {
    caseCount: cases.length,
    structureFamilies: [...families].sort(),
    packages: [...packages].sort(),
    lanes: [...lanes].sort(),
    fixtureClasses,
  };
}
