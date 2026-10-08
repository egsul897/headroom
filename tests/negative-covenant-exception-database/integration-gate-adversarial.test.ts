/**
 * NCEDB integration-gate adversarial tests.
 * Fail-closed legal-safety invariants for merge readiness.
 * Does not import lib/contract-model or edit Claude-owned fixtures.
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  analyzeGibraltar706,
  analyzeRiot502,
  attachProvisos,
  interpretEntityScope,
  buildDependencyClosure,
  mayClassifyUnconditional,
  buildImportBatch,
  buildPhase3ImportBatch,
  loadExceptionCatalogV3,
  runPhase4Evaluations,
  NCEDB_PHASE4_DATASET_VERSION,
} from "../../lib/negative-covenant-exceptions";

const PHASE4 = resolve(process.cwd(), "docs/negative-covenant-exception-database/phase-4");

describe("NCEDB integration-gate adversarial invariants", () => {
  it("missing remote conditions block unconditional permission", () => {
    const closure = buildDependencyClosure({
      exceptionRef: "ADV-remote",
      governingProhibition: { text: "shall not create Liens except", status: "RESOLVED" },
      localProvisos: [],
      remoteSectionProvisos: [{ text: "Article chapeau Paid-in-Full duration", status: "PARTIAL" }],
      definedTerms: [],
      entityRestrictions: [{ text: "Borrower" }],
    });
    expect(closure.blockingForUnconditional).toBe(true);
    expect(mayClassifyUnconditional(closure)).toBe(false);
  });

  it("unresolved definitions block unconditional permission", () => {
    const closure = buildDependencyClosure({
      exceptionRef: "ADV-defs",
      governingProhibition: { text: "shall not incur Indebtedness except", status: "RESOLVED" },
      localProvisos: [],
      remoteSectionProvisos: [],
      definedTerms: [
        { term: "Loan Document", status: "UNRESOLVED" },
        { term: "Collateral", status: "EXTERNAL" },
      ],
      entityRestrictions: [{ text: "Loan Party" }],
    });
    expect(mayClassifyUnconditional(closure)).toBe(false);
    expect(closure.unresolved.some((u) => u.kind === "DEFINED_TERM")).toBe(true);
  });

  it("parent proviso interactions remain visible on Gibraltar 7.06(b) limbs", () => {
    const gib = readFileSync(
      resolve(
        process.cwd(),
        "tests/fixtures/unseen-packages/gibraltar-2026-credit-agreement/extracted-text/credit-agreement.txt",
      ),
      "utf8",
    );
    const analysis = analyzeGibraltar706(gib);
    const b1 = analysis.exceptions.find((e) => e.sectionRef === "7.06(b)(1)");
    expect(b1).toBeTruthy();
    expect(b1!.predictedProvisoAttachment).toBe("PARENT_PROVISO_MAY_INTERACT");
    expect(b1!.evidence.parentProvisoTexts.length).toBeGreaterThan(0);
    expect(b1!.predictedRemoteConditions.some((r) => /parent/i.test(r))).toBe(true);
    expect(b1!.predictedClassification).not.toBe("UNCONDITIONAL_SOURCE_VERIFIED");
  });

  it("unresolved amendment authority prevents executable legal conclusions", () => {
    const closure = buildDependencyClosure({
      exceptionRef: "ADV-amd",
      governingProhibition: { text: "shall not", status: "RESOLVED" },
      localProvisos: [],
      remoteSectionProvisos: [],
      definedTerms: [{ term: "Obligations", status: "RESOLVED" }],
      entityRestrictions: [{ text: "Borrower" }],
      amendmentAuthority: [{ text: "amendment chain not closed", status: "UNRESOLVED" }],
    });
    expect(closure.atoms.some((a) => a.kind === "AMENDMENT_VERSION_AUTHORITY" && a.status === "UNRESOLVED")).toBe(
      true,
    );
    expect(mayClassifyUnconditional(closure)).toBe(false);
  });

  it("prohibition-only provisions are not mislabeled as exceptions", () => {
    const riot = readFileSync(
      resolve(
        process.cwd(),
        "tests/fixtures/unseen-packages/riot-2025-2026-credit-facility/extracted-text/doc-c-2026-04-21-second-amended-restated-credit-agreement.txt",
      ),
      "utf8",
    );
    const limbs = analyzeRiot502(riot);
    // Analyzer only emits enumerated exception limbs under 5.02(a); 5.02(c) has no exception list.
    expect(limbs.every((l) => l.sectionRef.startsWith("5.02(a)("))).toBe(true);
    expect(limbs.some((l) => l.sectionRef.includes("5.02(c)"))).toBe(false);

    const gt = JSON.parse(
      readFileSync(resolve(PHASE4, "held-out/riot-5.02-issuer-disjoint-gt.json"), "utf8"),
    );
    const prohibitionOnly = gt.items.filter((i: { kind: string }) => i.kind === "PROHIBITION_NO_EXCEPTION");
    expect(prohibitionOnly.length).toBeGreaterThan(0);
    for (const p of prohibitionOnly) {
      expect(limbs.some((l) => l.sectionRef === p.sectionRef)).toBe(false);
    }
  });

  it("entity-scope uncertainty fails closed (no cross-entity inference; empty scope ambiguous)", () => {
    const empty = interpretEntityScope(["cash on hand in ordinary course"]);
    expect(empty.includes.length).toBe(0);
    expect(empty.ambiguous).toBe(true);

    const loanOnly = interpretEntityScope(["any Loan Party may incur Indebtedness"]);
    expect(loanOnly.includes.some((i) => i.entityClass === "LOAN_PARTIES")).toBe(true);
    expect(loanOnly.includes.some((i) => i.entityClass === "GUARANTORS")).toBe(false);
    expect(loanOnly.notes.some((n) => /Guarantors not inferred/i.test(n))).toBe(true);

    // Structural ambiguous nested attachment refuses certainty
    const nested = attachProvisos({
      exceptionRef: "ADV-nested",
      parentBlockText: "no provided marker",
      exceptionLimbText: "any encumbrance or restriction:\n(a) first\n(b) second",
    });
    expect(nested.refusalClass).toBe("AMBIGUOUS_CONDITION_SCOPE");
  });

  it("import batches never set productionCapacityApproved and never write Permission targets", () => {
    const { exceptions } = loadExceptionCatalogV3();
    const importable = exceptions.filter((e) => e.exceptionSourceSpan.matchStatus !== "UNRESOLVED");
    const batch = buildPhase3ImportBatch(importable);
    expect(batch.items.length).toBeGreaterThan(0);
    for (const item of batch.items) {
      expect(item.productionCapacityApproved).toBe(false);
    }
    const dup = buildImportBatch(importable, {
      alreadyImportedKeys: batch.items.map((i) => i.importKey),
      datasetVersion: NCEDB_PHASE4_DATASET_VERSION,
    });
    expect(dup.items.length).toBe(0);

    const ckf = JSON.parse(readFileSync(resolve(PHASE4, "08-ckf-integration.json"), "utf8"));
    expect(ckf.proofs.productionCapacityApprovedAlwaysFalse).toBe(true);
    expect(ckf.doesNotCreateCompetingCanonicalSchema).toBe(true);
    expect(ckf.status).toMatch(/ALIGNED_FOR_REVIEW|SCHEMA_PRESENT/);
  });

  it("replays frozen Gibraltar and issuer-disjoint Riot metrics at current head", () => {
    const evals = runPhase4Evaluations();
    const frozen = evals.frozenPhase3.metrics;
    expect(frozen.remoteConditionRecall!.value).toBe(1);
    expect(frozen.provisoAttachmentAccuracy!.value).toBe(1);
    expect(frozen.entityScopeFidelity!.value).toBe(1);
    expect(frozen.crossReferenceAccuracy!.value).toBe(1);
    expect(frozen.incorrectUnconditionalPermissionRate!.value).toBe(0);

    const riot = evals.riotDisjoint.metrics;
    expect(riot.exceptionDiscoveryPrecision!.value).toBe(1);
    expect(riot.exceptionDiscoveryRecall!.value).toBe(1);
    expect(riot.remoteConditionRecall!.value).toBe(1);
    expect(riot.incorrectUnconditionalPermissionRate!.value).toBe(0);

    expect(existsSync(resolve(PHASE4, "06-independent-quality-metrics.json"))).toBe(true);
  });

  it("does not import production contract-model paths", () => {
    const self = readFileSync(__filename, "utf8");
    expect(self).not.toMatch(/from ["'].*contract-model/);
  });
});
