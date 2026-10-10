/**
 * Stage D Cycle 4 — pkg-i entity-scope COUNTERPARTY unblocks §7.01 CERTIFY
 * and SECURED_DEBT dual-path enumeration. (Cycle 5 companion-REQUIRES discharge
 * then opens REQUIRE capacity; see stage-d-pkgi-cross-rule.test.ts.)
 */
import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { loadPackage } from "../../scripts/product-acceptance/corpus";
import { runDeterministicStages } from "../../scripts/product-acceptance/stages";
import { runSemanticStage } from "../../scripts/product-acceptance/semantic-stage";
import {
  certifiedMapToVerifiedExecutionPackage,
  type CertifiedCandidateArtifacts,
} from "../../lib/contract-model/phase3-certification/phase4-adapter";
import { serializeVerifiedUnitPackage } from "../../lib/contract-model/verified-units";
import { enumerateCertifiedPaths } from "../../lib/product/north-star-workflow/verified-path-enumeration";
import { ENTITY_SCOPE_GUARD_VERSION } from "../../lib/contract-model/compiler/semantic/entity-scope-guard";

const PACKAGE_ID = "pkg-i-secured-debt-lien";
const ARTIFACTS = "docs/product/customer-workflow/stage-d-pkgi-entity-scope";

describe("Stage D pkg-i entity-scope COUNTERPARTY → dual-path 4E", () => {
  it("CERTIFIES §7.01 offline with §7.01(d) SOURCE_SCOPE_DERIVED ANY_SUBSIDIARY (COUNTERPARTY)", async () => {
    expect(ENTITY_SCOPE_GUARD_VERSION).toBe("entity-scope-consistency-guard.v6");
    const pkg = loadPackage(PACKAGE_ID);
    const stages = await runDeterministicStages(pkg);
    const sem = await runSemanticStage(pkg, stages);
    expect(sem.faithful).toBeTruthy();
    if (!sem.faithful) throw new Error("expected faithful semantic stage");

    const debtCandidate = sem.faithful.results.find((r) =>
      (r.verifiedPackage?.units ?? []).some(
        (u) => u.kind === "RULE" && (u.unit as { sourceSectionRef?: string }).sourceSectionRef === "7.01(b)",
      ),
    );
    expect(debtCandidate?.certification?.status).toBe("CERTIFIED");

    const d = (debtCandidate?.verifiedPackage?.units ?? [])
      .filter((u) => u.kind === "RULE")
      .map((u) => u.unit as {
        sourceSectionRef?: string;
        entityScope?: string[];
        entityScopeAudit?: {
          status?: string;
          modelDiscrepancy?: { relation?: string } | null;
          witness?: { signals?: Array<{ role?: string }> };
        };
      })
      .find((u) => u.sourceSectionRef === "7.01(d)");
    expect(d?.entityScope).toEqual(["ANY_SUBSIDIARY"]);
    expect(d?.entityScopeAudit?.status).toBe("SOURCE_SCOPE_DERIVED");
    expect(d?.entityScopeAudit?.modelDiscrepancy?.relation).toBe("MODEL_DIFFERENT");
    expect(d?.entityScopeAudit?.witness?.signals?.some((s) => s.role === "COUNTERPARTY")).toBe(true);
  });

  it("enumerates SECURED_DEBT CERTIFIED_4E with debt and lien CANDIDATE paths", async () => {
    const pkg = loadPackage(PACKAGE_ID);
    const stages = await runDeterministicStages(pkg);
    const sem = await runSemanticStage(pkg, stages);
    if (!sem.faithful) throw new Error("expected faithful");

    const artifacts: CertifiedCandidateArtifacts[] = [];
    for (const r of sem.faithful.results) {
      if (r.certification?.status !== "CERTIFIED" || !r.verifiedPackage) continue;
      artifacts.push({
        certification: r.certification,
        verifiedPackage: serializeVerifiedUnitPackage(r.verifiedPackage),
      });
    }
    const adapter = certifiedMapToVerifiedExecutionPackage(artifacts);
    expect(adapter.outcome).toBe("DERIVED");
    if (adapter.outcome !== "DERIVED") throw new Error("expected DERIVED");

    const enumeration = enumerateCertifiedPaths({
      verifiedPackage: adapter.package,
      transactionKind: "SECURED_DEBT",
      secured: true,
    });
    expect(enumeration.authority).toBe("CERTIFIED_4E");
    expect(enumeration.paths.some((p) => p.sourceSectionRef === "7.01(b)" && p.status === "CANDIDATE")).toBe(true);
    expect(enumeration.paths.some((p) => p.sourceSectionRef === "7.02(b)" && p.status === "CANDIDATE")).toBe(true);
  });

  it("probe artifacts record dual-path CERTIFIED_4E (Cycle 4 capacity refusal superseded by Cycle 5 companion discharge)", () => {
    const enumPath = pathJoin(ARTIFACTS, "02-phase4e-enumeration.json");
    expect(fs.existsSync(enumPath)).toBe(true);
    const enumeration = JSON.parse(fs.readFileSync(enumPath, "utf8")) as {
      results: Array<{ transactionKind: string; authority: string; paths: Array<{ sourceSectionRef: string }> }>;
    };
    const secured = enumeration.results.find((r) => r.transactionKind === "SECURED_DEBT");
    expect(secured?.authority).toBe("CERTIFIED_4E");
    expect(secured?.paths.some((p) => p.sourceSectionRef === "7.01(b)")).toBe(true);
    expect(secured?.paths.some((p) => p.sourceSectionRef === "7.02(b)")).toBe(true);
  });
});

function pathJoin(...parts: string[]): string {
  return parts.join("/");
}
