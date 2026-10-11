/**
 * SSR → executeAndPersist structural preflight: exact blockers + entrypoint wiring guard.
 * No production Neon; no identity fabrication.
 * Gate semantics: STRUCTURAL_PREFLIGHT_ONLY — never an authorization grant.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  assessCurrentSsrEntrypointShape,
  assessSsrPersistedExecutionReadiness,
  SSR_PERSISTED_EXECUTION_GATE_VERSION,
} from "@/lib/product/verified-transaction-execution/ssr-persisted-execution-gate";
import { TRUSTED_IDENTITY_PRODUCTION_ACTIVATION } from "@/lib/capacity/identity/activation";

const ROOT = process.cwd();

function src(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8");
}

function structurallyCompleteRequest() {
  return {
    companyId: "co-1",
    operativeSourceAuthority: { provisionalIdentity: false, authorityClassification: "CONFIRMED_OPERATIVE" },
    verifiedPackage: { packageId: "vep-1" },
    financialEvidence: { metrics: [{ metricKey: "TOTAL_ASSETS" }] },
    utilization: { capacityRuleId: "r1", asOf: "2024-12-31" },
    selectedLegalPath: { pathId: "p1" },
    verifiedExecutableRule: { ruleId: "r1" },
    reviewerAuthorization: { trustedIssuerAuth: { principals: [], requireNonFixtureIdentity: true } },
    inputs: { asOf: "2024-12-31" },
  } as never;
}

describe("SSR persisted-execution gate", () => {
  it("exposes a stable gate version with structural-preflight semantics", () => {
    expect(SSR_PERSISTED_EXECUTION_GATE_VERSION).toBe("ssr-persisted-execution-gate.v2");
  });

  it("refuses current Position/Ask/Simulate shapes with exact blockers", () => {
    for (const surface of ["POSITION", "ASK", "SIMULATE"] as const) {
      const a = assessCurrentSsrEntrypointShape(surface);
      expect(a.gateSemantics).toBe("STRUCTURAL_PREFLIGHT_ONLY");
      expect(a.structuralRequestAssemblyComplete, surface).toBe(false);
      expect(a.mayCallExecuteAndPersist, surface).toBe(false);
      expect(a.mayPublishProductionAuthority, surface).toBe(false);
      expect(a.blockers).toContain("MISSING_TENANT_AUTH");
      expect(a.blockers).toContain("MISSING_VERIFIED_EXECUTION_PACKAGE");
      expect(a.blockers).toContain("MISSING_OPERATIVE_SOURCE_AUTHORITY");
      expect(a.blockers).toContain("MISSING_FINANCIAL_EVIDENCE");
      expect(a.blockers).toContain("MISSING_UTILIZATION_COMPLETENESS");
      expect(a.blockers).toContain("MISSING_SELECTED_LEGAL_PATH");
      expect(a.blockers).toContain("MISSING_VERIFIED_EXECUTABLE_RULE");
      expect(a.blockers).toContain("MISSING_REVIEWER_TRUSTED_ISSUER");
      expect(a.blockers).toContain("MISSING_INPUT_RESOLVER");
      expect(a.blockers).toContain("TRUSTED_IDENTITY_PRODUCTION_BLOCKED");
      expect(a.trustedIdentityProductionActivation).toBe("BLOCKED");
      expect(a.implementationContract.some((c) => /STRUCTURAL_PREFLIGHT_ONLY/.test(c))).toBe(true);
    }
  });

  it("does not allow provisional identity to pass the gate", () => {
    const a = assessSsrPersistedExecutionReadiness({
      surface: "ASK",
      tenantAuthenticated: true,
      companyId: "co-1",
      prismaClientPresent: true,
      request: {
        ...structurallyCompleteRequest(),
        operativeSourceAuthority: {
          provisionalIdentity: true,
          authorityClassification: "PROVISIONAL_IDENTITY_BLOCKED",
        } as never,
      },
    });
    expect(a.structuralRequestAssemblyComplete).toBe(false);
    expect(a.mayPublishProductionAuthority).toBe(false);
    expect(a.blockers).toContain("PROVISIONAL_IDENTITY_NOT_CONFIRMED");
    expect(a.blockers).toContain("TRUSTED_IDENTITY_PRODUCTION_BLOCKED");
  });

  it("refuses REVIEW_REQUIRED / AMBIGUOUS operative authority as incomplete", () => {
    for (const classification of ["REVIEW_REQUIRED", "AMBIGUOUS", "UNSUPPORTED"] as const) {
      const a = assessSsrPersistedExecutionReadiness({
        surface: "POSITION",
        tenantAuthenticated: true,
        companyId: "co-1",
        prismaClientPresent: true,
        request: {
          ...structurallyCompleteRequest(),
          operativeSourceAuthority: {
            provisionalIdentity: false,
            authorityClassification: classification,
          } as never,
        },
      });
      expect(a.structuralRequestAssemblyComplete, classification).toBe(false);
      expect(a.blockers, classification).toContain("INCOMPLETE_OPERATIVE_AUTHORITY");
      expect(a.mayPublishProductionAuthority, classification).toBe(false);
    }
  });

  it("refuses empty evidence objects as structural incompleteness", () => {
    const a = assessSsrPersistedExecutionReadiness({
      surface: "SIMULATE",
      tenantAuthenticated: true,
      companyId: "co-1",
      prismaClientPresent: true,
      request: {
        ...structurallyCompleteRequest(),
        verifiedPackage: {} as never,
        financialEvidence: {} as never,
      },
    });
    expect(a.structuralRequestAssemblyComplete).toBe(false);
    expect(a.blockers).toContain("EMPTY_EVIDENCE_OBJECT");
  });

  it("structural assembly alone cannot publish production authority while activation BLOCKED", () => {
    const a = assessSsrPersistedExecutionReadiness({
      surface: "SIMULATE",
      tenantAuthenticated: true,
      companyId: "co-1",
      prismaClientPresent: true,
      request: structurallyCompleteRequest(),
    });
    expect(a.structuralRequestAssemblyComplete).toBe(true);
    expect(a.mayCallExecuteAndPersist).toBe(true); // deprecated alias
    expect(a.gateSemantics).toBe("STRUCTURAL_PREFLIGHT_ONLY");
    expect(a.mayPublishProductionAuthority).toBe(false);
    expect(a.blockers).toEqual(["TRUSTED_IDENTITY_PRODUCTION_BLOCKED"]);
  });

  it("URL companyId without tenantAuthenticated fails closed", () => {
    const a = assessSsrPersistedExecutionReadiness({
      surface: "ASK",
      tenantAuthenticated: false,
      companyId: "co-from-url",
      prismaClientPresent: true,
      request: structurallyCompleteRequest(),
    });
    expect(a.structuralRequestAssemblyComplete).toBe(false);
    expect(a.blockers).toContain("MISSING_TENANT_AUTH");
    expect(a.mayPublishProductionAuthority).toBe(false);
  });

  it("Position page does not call executeAndPersist", () => {
    const s = src("app/[companyId]/position/page.tsx");
    expect(s).not.toMatch(/executeAndPersistUnifiedVerifiedTransaction/);
    expect(s).toMatch(/getCompanyDashboard|buildPositionView|runPackageLegalPath/);
  });

  it("Ask shell does not call executeAndPersist; uses attemptCertifiedTransaction", () => {
    const shell = src("lib/ask/shell-runner.ts");
    const api = src("app/api/ask/route.ts");
    expect(shell).not.toMatch(/executeAndPersistUnifiedVerifiedTransaction/);
    expect(shell).toMatch(/attemptCertifiedTransaction/);
    expect(api).toMatch(/answerAsk/);
    expect(api).not.toMatch(/executeAndPersistUnifiedVerifiedTransaction/);
  });

  it("Simulate page does not call executeAndPersist; uses attemptVerifiedSimulate", () => {
    const s = src("app/[companyId]/simulate/page.tsx");
    expect(s).not.toMatch(/executeAndPersistUnifiedVerifiedTransaction/);
    expect(s).toMatch(/attemptVerifiedSimulate/);
    expect(s).toMatch(/verifiedPackage:\s*null/);
  });

  it("trusted identity production activation remains BLOCKED", () => {
    expect(TRUSTED_IDENTITY_PRODUCTION_ACTIVATION.status).toBe("BLOCKED");
  });
});
