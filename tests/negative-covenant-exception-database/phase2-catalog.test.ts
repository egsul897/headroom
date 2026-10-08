/**
 * Phase 2 NCEDB offline tests.
 * Does not import lib/contract-model or modify Claude-owned fixtures.
 */

import { createHash } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildDeterministicImportBatch,
  buildImportBatch,
  loadExceptionCatalogV2,
  searchExceptionsV2,
  PERMISSION_CLASSIFICATIONS,
} from "../../lib/negative-covenant-exceptions";

const PHASE2 = resolve(process.cwd(), "docs/negative-covenant-exception-database/phase-2");

describe("NCEDB phase 2", () => {
  const { manifest, exceptions } = loadExceptionCatalogV2();

  it("loads phase-2 catalog with upgraded classifications", () => {
    expect(manifest.datasetVersion).toBe("ncedb.phase2.v1");
    expect(manifest.status).toBe("OFFLINE_RESEARCH_DATASET");
    expect(exceptions.length).toBeGreaterThanOrEqual(15);
    for (const r of exceptions) {
      expect(PERMISSION_CLASSIFICATIONS).toContain(r.permissionClassification);
      expect(r.unconditionalCapacity).toBe(false);
      expect(r.localConditions).toBeDefined();
      expect(r.remoteConditions).toBeDefined();
      expect(r.provisoAttachment).toBeDefined();
      expect(r.entityScope).toBeDefined();
      expect(r.financialTests).toBeDefined();
      expect(r.sharedCapacityRestrictions).toBeDefined();
      expect(r.amendmentAuthority).toBeDefined();
      expect(r.unresolvedControllingSources).toBeDefined();
    }
    const classes = new Set(exceptions.map((r) => r.permissionClassification));
    expect(classes.has("CONDITIONAL")).toBe(true);
    expect(classes.has("UNCONDITIONAL_SOURCE_VERIFIED")).toBe(true);
    expect(classes.has("NOT_AN_AFFIRMATIVE_PERMISSION")).toBe(true);
  });

  it("expands beyond CONMED/LSB/FWRG issuers", () => {
    const issuers = new Set(exceptions.map((r) => r.sourceIdentity.issuerKey));
    for (const k of ["CHWY", "ROCK", "DSGR", "RIOT", "SUP"]) {
      expect(issuers.has(k), k).toBe(true);
    }
    const registry = JSON.parse(readFileSync(resolve(PHASE2, "03-document-registry.json"), "utf8"));
    expect(registry.issuers.length).toBeGreaterThanOrEqual(8);
    const plan = JSON.parse(readFileSync(resolve(PHASE2, "02-diversity-acquisition-plan.json"), "utf8"));
    expect(plan.diversityTargetMet ?? plan.targetAdditionalAgreements).toBeTruthy();
    expect(plan.actualNewIssuersIngestedThisPhase).toBeGreaterThanOrEqual(5);
    expect(plan.gapToTarget.agreementsStillNeeded).toBeGreaterThan(0);
  });

  it("includes independently selected negative-control classes", () => {
    const nc = JSON.parse(readFileSync(resolve(PHASE2, "04-negative-controls.json"), "utf8"));
    for (const cls of [
      "LOCAL_CONDITIONS",
      "REMOTE_CONDITIONS",
      "NO_ADDITIONAL_CONDITIONS",
      "PROHIBITION_NO_EXCEPTION",
      "NUMERIC_THRESHOLD_NOT_PERMISSION",
      "CONSTRAINED_BY_OTHER_DOCUMENT",
    ]) {
      expect((nc.counts[cls] ?? 0) > 0 || (nc.byClass[cls] ?? []).length > 0, cls).toBe(true);
    }
    // Ambiguous may be present
    expect(Object.keys(nc.byClass).length).toBeGreaterThanOrEqual(6);
  });

  it("preserves exact source spans that match on-disk bytes", () => {
    for (const r of exceptions) {
      expect(r.exceptionSourceSpan.matchStatus).not.toBe("UNRESOLVED");
      expect(r.exactExceptionText).toBe(r.exceptionSourceSpan.exactText);
      expect(r.exactExceptionText.includes("...") && r.exactExceptionText === r.paraphraseSummary).toBe(false);

      const abs = resolve(process.cwd(), r.sourceIdentity.sourcePath);
      expect(existsSync(abs), abs).toBe(true);
      const bytes = readFileSync(abs);
      const digest = createHash("sha256").update(bytes).digest("hex");
      expect(digest).toBe(r.sourceIdentity.sourceSha256);

      const text = bytes.toString("utf8");
      if (r.exceptionSourceSpan.matchStatus === "EXACT") {
        expect(text.slice(r.exceptionSourceSpan.charStart, r.exceptionSourceSpan.charEnd)).toBe(
          r.exceptionSourceSpan.exactText,
        );
      }
    }
    const audit = JSON.parse(readFileSync(resolve(PHASE2, "07-source-span-audit.json"), "utf8"));
    expect(audit.failureCount).toBe(0);
  });

  it("builds an idempotent import batch that never approves production capacity", () => {
    const batch1 = buildDeterministicImportBatch(exceptions);
    const batch2 = buildDeterministicImportBatch(exceptions);
    expect(batch1.items.map((i) => i.importKey)).toEqual(batch2.items.map((i) => i.importKey));
    expect(batch1.rejected.length).toBe(0);
    for (const item of batch1.items) {
      expect(item.productionCapacityApproved).toBe(false);
      expect(item.importKey).toContain(item.sourceIdentityKey);
    }
    // re-import skips duplicates
    const dupCheck = buildImportBatch(exceptions, {
      alreadyImportedKeys: batch1.items.map((i) => i.importKey),
    });
    expect(dupCheck.items.length).toBe(0);
    expect(dupCheck.skippedDuplicates.length).toBe(batch1.items.length);
  });

  it("search distinguishes local-only vs remote-only conditions", () => {
    const local = searchExceptionsV2(exceptions, { hasLocalConditions: true, hasRemoteConditions: false });
    const remote = searchExceptionsV2(exceptions, { hasLocalConditions: false, hasRemoteConditions: true });
    expect(local.length).toBeGreaterThan(0);
    expect(remote.length).toBeGreaterThan(0);
    const unconditional = searchExceptionsV2(exceptions, {
      permissionClassification: "UNCONDITIONAL_SOURCE_VERIFIED",
    });
    expect(unconditional.length).toBeGreaterThan(0);
    for (const r of unconditional) {
      const economic = r.localConditions.some((c) =>
        ["MONEY", "RATIO", "NO_DEFAULT", "SHARED_POOL"].includes(c.computableHint),
      );
      expect(economic).toBe(false);
    }
  });

  it("reports quality metrics honestly (UNVERIFIED where independent labels are incomplete)", () => {
    const q = JSON.parse(readFileSync(resolve(PHASE2, "06-quality-metrics.json"), "utf8"));
    expect(q.status).toMatch(/UNVERIFIED|PARTIAL/);
    expect(q.metrics.remoteConditionRecall.status).toBe("UNVERIFIED");
    expect(q.metrics.provisoAttachmentAccuracy.status).toBe("UNVERIFIED");
    expect(q.metrics.exceptionDiscoveryRecall.status).toMatch(/MEASURED|UNVERIFIED/);
    expect(existsSync(resolve(PHASE2, "held-out/riot-5.02-independent-gt.json"))).toBe(true);
  });

  it("does not modify production engine paths", () => {
    // Structural guard: no production-engine import statements in this suite.
    const self = readFileSync(__filename, "utf8");
    expect(self).not.toMatch(/from ["'].*contract-model/);
    expect(existsSync(resolve(PHASE2, "09-integration-dependencies.json"))).toBe(true);
    const integ = JSON.parse(readFileSync(resolve(PHASE2, "09-integration-dependencies.json"), "utf8"));
    expect(integ.doesNotWrite).toContain("Permission");
    expect(integ.importAdapter).toContain("lib/negative-covenant-exceptions");
  });
});
