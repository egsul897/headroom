/**
 * Authentic CONMED §7.2(c) — affirmative capacity is irreducibly blocked.
 *
 * Locks the discharge matrix: companion-REQUIRES discharge must NOT open this
 * unit (UNLIMITED + OTHER_RULE_SATISFIED §7.1 + missing companions). Do not
 * weaken fail-closed behavior to obtain green capacity.
 */
import fs from "node:fs";
import { describe, expect, it } from "vitest";
import {
  evaluateVerifiedCapacity,
  isCompanionRequiresDischargeable,
  type VerifiedExecutionPackage,
} from "../../lib/contract-model/verified-execution";
import { snapshotInputResolver } from "../../lib/contract-model/runtime/input/snapshot-resolver";

const VEP_PATH = "docs/product/customer-workflow/authenticated-vep/verified-execution-package.json";
const CERT_PATH = "docs/phase-3-live-validation/7.2c-recompute-phase2-certified/10-certification.json";

describe("Authentic CONMED §7.2(c) affirmative capacity blocker", () => {
  it("is the only on-disk Phase-3 CERTIFIED authentic candidate and is not companion-dischargeable", () => {
    const cert = JSON.parse(fs.readFileSync(CERT_PATH, "utf8")) as { status: string; candidateRef: string };
    expect(cert.status).toBe("CERTIFIED");
    expect(cert.candidateRef).toBe("discovery-candidate:7a3f36589dacd05c41331a80");

    const pkg = JSON.parse(fs.readFileSync(VEP_PATH, "utf8")) as VerifiedExecutionPackage;
    expect(pkg.rules).toHaveLength(1);
    const rule = pkg.rules[0]!;
    expect(rule.sourceSectionRef).toBe("7.2(c)");
    expect(rule.capacityExpression?.kind).toBe("UNLIMITED_CAPACITY");
    expect(rule.conditions.some((c) => (c.referencesRuleTargets?.length ?? 0) > 0)).toBe(true);
    expect(isCompanionRequiresDischargeable(rule, pkg.rules)).toBe(false);
  });

  it("REQUIRE capacity REFUSES with CROSS_RULE_GATE citing §7.1 and §7.3(g)", () => {
    const pkg = JSON.parse(fs.readFileSync(VEP_PATH, "utf8")) as VerifiedExecutionPackage;
    const inputs = snapshotInputResolver({
      snapshots: [],
      definitions: [...(pkg.definitions ?? [])],
      rules: [...pkg.rules],
      companyId: pkg.companyId,
      instrumentKey: pkg.instrumentKey,
    });
    const capacity = evaluateVerifiedCapacity({
      package: pkg,
      inputs,
      ledger: [],
      asOf: "2025-12-31",
    });
    expect(capacity.outcome).toBe("REFUSED");
    if (capacity.outcome !== "REFUSED") throw new Error("expected REFUSED");
    expect(capacity.refusals.some((r) => r.code === "CROSS_RULE_GATE_NOT_EXECUTABLE")).toBe(true);
    const refs = capacity.refusals.flatMap((r) => r.refs).join("\n");
    expect(refs).toContain("Section 7.1");
    expect(refs).toContain("Section 7.3(g)");
  });
});
