/**
 * Offline tests for the Negative Covenant Exception Database.
 * Does not import or exercise lib/contract-model production paths.
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  loadAdversarialSuite,
  loadExceptionCatalog,
  loadJsonArtifact,
} from "../fixtures/negative-covenant-exception-database/loaders";
import {
  COVENANT_FAMILIES,
  assertMissionInvariants,
  hasRemoteConditions,
  searchExceptions,
} from "../fixtures/negative-covenant-exception-database/schema";

describe("negative-covenant-exception-database catalog", () => {
  const catalog = loadExceptionCatalog();
  const adversarial = loadAdversarialSuite();

  it("is an offline research dataset with all priority families covered", () => {
    expect(catalog.status).toBe("OFFLINE_RESEARCH_DATASET");
    expect(catalog.counts.exceptions).toBeGreaterThanOrEqual(30);
    for (const family of COVENANT_FAMILIES) {
      expect(catalog.counts.byFamily[family] ?? 0).toBeGreaterThanOrEqual(1);
    }
    const errors = assertMissionInvariants(catalog);
    expect(errors).toEqual([]);
  });

  it("never marks an exception as unconditional capacity", () => {
    for (const r of catalog.exceptions) {
      expect(r.unconditionalCapacity).toBe(false);
    }
  });

  it("preserves the required fields on every record", () => {
    for (const r of catalog.exceptions) {
      expect(r.parentProhibition.sectionRef.length).toBeGreaterThan(0);
      expect(r.parentProhibition.text.length).toBeGreaterThan(10);
      expect(r.exactExceptionText.length).toBeGreaterThan(10);
      expect(r.structuralHierarchy.length).toBeGreaterThanOrEqual(2);
      expect(Array.isArray(r.definedTerms)).toBe(true);
      expect(Array.isArray(r.conditions)).toBe(true);
      expect(Array.isArray(r.amountsAndRatios)).toBe(true);
      expect(Array.isArray(r.entityScope.includes)).toBe(true);
      expect(Array.isArray(r.sharedCapacityInteractions)).toBe(true);
      expect(Array.isArray(r.amendments)).toBe(true);
      expect(Array.isArray(r.provisos)).toBe(true);
      expect(Array.isArray(r.crossReferences)).toBe(true);
      expect(r.verificationStatus).toMatch(/SOURCE_VERIFIED|UNVERIFIED|SYNTHETIC/);
    }
  });

  it("pins source files by sha256", () => {
    for (const [pkg, meta] of Object.entries(catalog.sourceManifest)) {
      const abs = resolve(process.cwd(), meta.path);
      const digest = createHash("sha256").update(readFileSync(abs)).digest("hex");
      expect(digest, pkg).toBe(meta.sha256);
      expect(catalog.exceptions.some((r) => r.sourcePackage === pkg)).toBe(true);
    }
  });

  it("flags remote conditions, hanging provisos, and seemingly-permissive constraints", () => {
    expect(catalog.indexes.remoteConditionExceptionIds.length).toBeGreaterThan(10);
    expect(catalog.indexes.hangingOrSectionWideProvisoIds.length).toBeGreaterThan(0);
    expect(catalog.indexes.seeminglyPermissiveButConstrainedIds.length).toBeGreaterThan(10);
    for (const id of catalog.indexes.remoteConditionExceptionIds) {
      const r = catalog.exceptions.find((e) => e.exceptionId === id);
      expect(r).toBeTruthy();
      expect(hasRemoteConditions(r!)).toBe(true);
    }
  });

  it("supports searchable filters across family, remote gates, and free text", () => {
    const rpRemote = searchExceptions(catalog, {
      covenantFamily: "RESTRICTED_PAYMENTS",
      hasRemoteConditions: true,
    });
    expect(rpRemote.length).toBeGreaterThan(0);
    expect(rpRemote.every((r) => r.covenantFamily === "RESTRICTED_PAYMENTS")).toBe(true);

    const paymentConditions = searchExceptions(catalog, { text: "Payment Conditions" });
    expect(paymentConditions.some((r) => r.exceptionId.includes("lsb"))).toBe(true);

    const hanging = searchExceptions(catalog, { hangingProviso: true });
    expect(hanging.length).toBeGreaterThan(0);

    const shared = searchExceptions(catalog, { sharedCapacity: true });
    expect(shared.length).toBeGreaterThan(0);

    const builder = searchExceptions(catalog, { capacityShape: "BUILDER_SHARED" });
    expect(builder.some((r) => r.exceptionId.includes("available-amount"))).toBe(true);

    const bySection = searchExceptions(catalog, { sectionRef: "7.2(c)" });
    expect(bySection.some((r) => r.exceptionId === "conmed-7.2-c-liens-secured-debt-pro-forma-7.1")).toBe(true);

    const byFlag = searchExceptions(catalog, { remoteFlagKind: "NOTWITHSTANDING" });
    expect(byFlag.length).toBeGreaterThan(0);
  });

  it("includes adversarial examples for hanging provisos, notwithstanding, and remote gates", () => {
    expect(adversarial.cases.length).toBeGreaterThanOrEqual(12);
    const modes = new Set(adversarial.cases.map((c) => c.failureMode));
    for (const mode of [
      "HANGING_PROVISO",
      "ARTICLE_LEVEL",
      "DEFINED_TERM_GATE",
      "CROSS_SECTION_CONDITION",
      "NOTWITHSTANDING",
      "SHARED_CAPACITY",
    ]) {
      expect(modes.has(mode)).toBe(true);
    }
    for (const c of adversarial.cases) {
      expect(c.naiveMisread.length).toBeGreaterThan(10);
      expect(c.correctRead.length).toBeGreaterThan(10);
      expect(c.syntheticDrafting.length).toBeGreaterThan(20);
      // Every adversarial correct-read rejects unconditional capacity language.
      expect(c.correctRead.toLowerCase()).not.toMatch(/unconditional capacity|free capacity without/);
    }
  });

  it("ships coverage and verdict artifacts consistent with the catalog", () => {
    const coverage = loadJsonArtifact<{
      allFamiliesCovered: boolean;
      adversarialCaseCount: number;
    }>("90-coverage-matrix.json");
    const verdict = loadJsonArtifact<{
      verdict: string;
      unconditionalCapacityAlwaysFalse: boolean;
      productionEngineUntouched: boolean;
      paidInference: boolean;
      certificationAdvancement: boolean;
    }>("99-verdict.json");

    expect(coverage.allFamiliesCovered).toBe(true);
    expect(coverage.adversarialCaseCount).toBe(adversarial.cases.length);
    expect(verdict.verdict).toBe("DATASET_READY_OFFLINE");
    expect(verdict.unconditionalCapacityAlwaysFalse).toBe(true);
    expect(verdict.productionEngineUntouched).toBe(true);
    expect(verdict.paidInference).toBe(false);
    expect(verdict.certificationAdvancement).toBe(false);
  });

  it("documents concrete seemingly-permissive-but-constrained examples", () => {
    const examples = [
      "conmed-7.6-e-ratio-gated-unlimited-rp",
      "conmed-7.8-i-foreign-advances-depend-7.2k",
      "lsb-6.11-c-rp-payment-conditions",
      "lsb-6.04-b-notes-priority-notwithstanding",
      "fwrg-6.04-a-iii-available-amount-rp",
    ];
    for (const id of examples) {
      const r = catalog.exceptions.find((e) => e.exceptionId === id);
      expect(r, id).toBeTruthy();
      expect(r!.seeminglyPermissiveButConstrained).toBe(true);
      expect(r!.unconditionalCapacity).toBe(false);
      expect(hasRemoteConditions(r!)).toBe(true);
    }
  });
});
