/**
 * Phase 4 NCEDB analyzer tests.
 * Does not import lib/contract-model or modify Claude-owned fixtures.
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  analyzeGibraltar706,
  analyzeRiot502,
  attachProvisos,
  interpretEntityScope,
  resolveCrossReferences,
  buildDependencyClosure,
  mayClassifyUnconditional,
  runPhase4Evaluations,
  NCEDB_PHASE4_DATASET_VERSION,
} from "../../lib/negative-covenant-exceptions";

const PHASE4 = resolve(process.cwd(), "docs/negative-covenant-exception-database/phase-4");
const PHASE3 = resolve(process.cwd(), "docs/negative-covenant-exception-database/phase-3");

describe("NCEDB phase 4 analyzer", () => {
  it("freezes Phase-3 Gibraltar GT and does not claim tuning on it", () => {
    const frozen = JSON.parse(
      readFileSync(resolve(PHASE4, "held-out/frozen-phase3-gibraltar-7.06-gt.json"), "utf8"),
    );
    expect(frozen.frozenFromPhase3).toBe(true);
    expect(frozen.independenceDeclaration.usedToTuneDetector).toBe(false);
    expect(frozen.independenceDeclaration.frozen).toBe(true);
  });

  it("repairs remote/proviso/entity/cross-ref metrics on frozen Phase-3 set vs Phase-3 baseline", () => {
    const p3 = JSON.parse(readFileSync(resolve(PHASE3, "06-independent-quality-metrics.json"), "utf8"));
    expect(p3.metrics.remoteConditionRecall.value).toBe(0);
    expect(p3.metrics.provisoAttachmentAccuracy.value).toBe(0);
    expect(p3.metrics.entityScopeAccuracy.value).toBe(0);
    expect(p3.metrics.crossReferenceAccuracy.value).toBe(0);
    expect(p3.metrics.incorrectUnconditionalClassificationRate.value).toBe(1);

    const evals = runPhase4Evaluations();
    const m = evals.frozenPhase3.metrics;
    expect(m.remoteConditionRecall.numerator).toBe(m.remoteConditionRecall.denominator);
    expect(m.remoteConditionRecall.value).toBe(1);
    expect(m.provisoAttachmentAccuracy.value).toBe(1);
    expect(m.entityScopeFidelity.value).toBe(1);
    expect(m.crossReferenceAccuracy.value).toBe(1);
    expect(m.incorrectUnconditionalPermissionRate.value).toBe(0);
    expect(m.unsupportedCaseRefusal.denominator).toBeGreaterThan(0);
    expect(m.unsupportedCaseRefusal.value).toBe(1);
  });

  it("attaches parent and hanging provisos deterministically; ambiguous nested → refusal class", () => {
    const parent = attachProvisos({
      exceptionRef: "7.06(b)(1)",
      parentBlockText: "Create ... Loan Party other than the Borrower ... provided that (x) priority ...",
      exceptionLimbText: "any encumbrance under the Loan Documents or Closing Date;",
    });
    expect(parent.primaryAttachment).toBe("PARENT_PROVISO_MAY_INTERACT");

    const hanging = attachProvisos({
      exceptionRef: "7.06(b)(17)",
      parentBlockText: "no local parent proviso here",
      exceptionLimbText:
        "any encumbrance pursuant to an Initial Agreement; provided, however, that the encumbrances with respect to such Guarantor ...",
    });
    expect(hanging.primaryAttachment).toBe("HANGING");

    const ambiguous = attachProvisos({
      exceptionRef: "7.06(b)(5)",
      parentBlockText: "parent without provided",
      exceptionLimbText: "any encumbrance or restriction:\n(a) first\n(b) second",
    });
    expect(ambiguous.ambiguous || ambiguous.refusalClass === "AMBIGUOUS_CONDITION_SCOPE").toBe(true);
  });

  it("separates entity classes without inferring Guarantors from Loan Parties", () => {
    const scope = interpretEntityScope([
      "any Loan Party other than the Borrower to pay dividends",
      "Indebtedness of Non-Loan Party Subsidiaries",
    ]);
    const classes = scope.includes.map((i) => i.entityClass);
    expect(classes).toContain("LOAN_PARTY_OTHER_THAN_BORROWER");
    expect(classes).toContain("NON_LOAN_PARTY_SUBSIDIARIES");
    expect(scope.excludes.some((e) => e.entityClass === "BORROWER")).toBe(true);
    expect(classes.includes("GUARANTORS")).toBe(false);
    expect(scope.notes.some((n) => /not inferred/i.test(n))).toBe(true);
  });

  it("never silently discards unresolved/external cross-references", () => {
    const refs = resolveCrossReferences({
      texts: [
        "The provisions of Section 7.06(a) will not prohibit",
        "lien permitted under Section 7.02",
        "pursuant to Transaction Documents on the Closing Date",
      ],
      knownSectionRefs: new Set(["Section 7.06(a)", "Section 7.02"]),
    });
    expect(refs.hits.some((h) => h.normalizedTarget.includes("7.06(a)"))).toBe(true);
    expect(refs.hits.some((h) => h.normalizedTarget.includes("7.02"))).toBe(true);
    expect(refs.unresolvedOrNonResolved.length).toBeGreaterThan(0);
    expect(
      refs.hits.some(
        (h) => h.resolution === "EXTERNAL_DOCUMENT" || h.normalizedTarget.includes("Closing Date"),
      ),
    ).toBe(true);
  });

  it("blocks unconditional classification when dependency closure is incomplete", () => {
    const closure = buildDependencyClosure({
      exceptionRef: "x",
      governingProhibition: { text: "shall not incur Indebtedness except", status: "RESOLVED" },
      localProvisos: [],
      remoteSectionProvisos: [{ text: "provided that parent...", status: "PARTIAL" }],
      definedTerms: [{ term: "Loan Document", status: "PARTIAL" }],
      entityRestrictions: [{ text: "Borrower" }],
      amendmentAuthority: [{ text: "unknown", status: "UNRESOLVED" }],
    });
    expect(closure.blockingForUnconditional).toBe(true);
    expect(mayClassifyUnconditional(closure)).toBe(false);
  });

  it("analyzes Gibraltar 7.06 and Riot 5.02 without approving production capacity", () => {
    const gib = readFileSync(
      resolve(
        process.cwd(),
        "tests/fixtures/unseen-packages/gibraltar-2026-credit-agreement/extracted-text/credit-agreement.txt",
      ),
      "utf8",
    );
    const analysis = analyzeGibraltar706(gib);
    expect(analysis.exceptions.length).toBeGreaterThanOrEqual(16);
    for (const e of analysis.exceptions) {
      expect(e.productionCapacityApproved).toBe(false);
      expect(e.predictedClassification).not.toBe("UNCONDITIONAL_SOURCE_VERIFIED");
      expect(e.dependencyClosure.atoms.length).toBeGreaterThan(0);
    }
    const b1 = analysis.exceptions.find((e) => e.sectionRef === "7.06(b)(1)");
    expect(b1?.predictedProvisoAttachment).toBe("PARENT_PROVISO_MAY_INTERACT");
    expect(b1?.predictedRemoteConditions.length).toBeGreaterThan(0);

    const riot = readFileSync(
      resolve(
        process.cwd(),
        "tests/fixtures/unseen-packages/riot-2025-2026-credit-facility/extracted-text/doc-c-2026-04-21-second-amended-restated-credit-agreement.txt",
      ),
      "utf8",
    );
    const riotLimbs = analyzeRiot502(riot);
    expect(riotLimbs.map((r) => r.sectionRef).sort()).toEqual([
      "5.02(a)(i)",
      "5.02(a)(ii)",
      "5.02(a)(iii)",
      "5.02(a)(iv)",
    ]);
  });

  it("records CKF integration as ALIGNED_FOR_REVIEW without Permission promotion", () => {
    expect(existsSync(resolve(PHASE4, "08-ckf-integration.json"))).toBe(true);
    const ckf = JSON.parse(readFileSync(resolve(PHASE4, "08-ckf-integration.json"), "utf8"));
    expect(ckf.status).toBe("ALIGNED_FOR_REVIEW");
    expect(ckf.doesNotCreateCompetingCanonicalSchema).toBe(true);
    expect(ckf.proofs.productionCapacityApprovedAlwaysFalse).toBe(true);
    const metrics = JSON.parse(readFileSync(resolve(PHASE4, "06-independent-quality-metrics.json"), "utf8"));
    expect(metrics.datasetVersion).toBe(NCEDB_PHASE4_DATASET_VERSION);
    expect(metrics.analyzer.tunedOnHeldOut).toBe(false);
    expect(metrics.analyzer.paidInference).toBe(false);
  });

  it("does not modify production engine paths", () => {
    const self = readFileSync(__filename, "utf8");
    expect(self).not.toMatch(/from ["'].*contract-model/);
  });
});
