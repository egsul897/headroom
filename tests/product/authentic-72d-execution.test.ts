/**
 * Authentic CONMED §7.2(d) execution gate: offline CERTIFIED → VEP → 4E CANDIDATE →
 * REQUIRE capacity AVAILABLE with labeled synthetic CTA → 4D SIMULATED.
 * Provider-free. No FIXTURE_IR. Synthetic inputs must stay labeled.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { certifiedMapToVerifiedExecutionPackage } from "../../lib/contract-model/phase3-certification/phase4-adapter";
import type { CandidateCertification } from "../../lib/contract-model/phase3-certification/types";
import { evaluateVerifiedCapacity, simulateVerifiedTransaction } from "../../lib/contract-model/verified-execution";
import { enumerateCertifiedPaths } from "../../lib/product/north-star-workflow/verified-path-enumeration";
import { snapshotInputResolver } from "../../lib/contract-model/runtime/input/snapshot-resolver";
import { buildCapacityGraph } from "../../lib/contract-model/runtime/capacity/graph";
import { rationalFromString } from "../../lib/contract-model/runtime/decimal";
import type { FinancialSnapshot } from "../../lib/contract-model/runtime/input/types";

const CERT_DIR = "docs/phase-3-live-validation/7.2d-recompute-phase2-certified";
const AS_OF = "2026-06-30";

function loadCertified(): { cert: CandidateCertification; verifiedPackage: string } {
  const cert = JSON.parse(fs.readFileSync(path.join(CERT_DIR, "10-certification.json"), "utf8")) as CandidateCertification;
  const verifiedPackage = fs.readFileSync(path.join(CERT_DIR, "09-verified-units.json"), "utf8");
  return { cert, verifiedPackage };
}

describe("authentic §7.2(d) Finance Lease Obligations execution", () => {
  it("is Phase-3 CERTIFIED offline without paid providers or FIXTURE_IR", () => {
    const meta = JSON.parse(fs.readFileSync(path.join(CERT_DIR, "00-meta.json"), "utf8")) as {
      paidProvidersCalled: boolean;
      fixtureIrInvented: boolean;
      certificationStatus: string;
      ctaRetrieved: boolean;
    };
    const { cert } = loadCertified();
    expect(meta.paidProvidersCalled).toBe(false);
    expect(meta.fixtureIrInvented).toBe(false);
    expect(meta.certificationStatus).toBe("CERTIFIED");
    expect(meta.ctaRetrieved).toBe(true);
    expect(cert.status).toBe("CERTIFIED");
    expect(cert.candidateRef).toBe("discovery-candidate:19f36eb8514494897cd4a5b6");
    expect(cert.blockers).toEqual([]);
  });

  it("derives VEP, enumerates a CANDIDATE 4E path, and evaluates AVAILABLE capacity under labeled synthetic CTA", () => {
    const { cert, verifiedPackage } = loadCertified();
    const adapter = certifiedMapToVerifiedExecutionPackage([{ certification: cert, verifiedPackage }]);
    expect(adapter.outcome).toBe("DERIVED");
    if (adapter.outcome !== "DERIVED") throw new Error("expected DERIVED");
    const pkg = adapter.package;
    expect(pkg.rules).toHaveLength(1);
    expect(pkg.rules[0]!.sourceSectionRef).toBe("7.2(d)");
    expect(pkg.rules[0]!.capacityExpression?.kind).toBe("MAX");

    const enumeration = enumerateCertifiedPaths({
      verifiedPackage: pkg,
      transactionKind: "UNSECURED_DEBT",
      secured: false,
    });
    expect(enumeration.authority).toBe("CERTIFIED_4E");
    expect(enumeration.unsupportedReasons).toEqual([]);
    expect(enumeration.paths).toHaveLength(1);
    expect(enumeration.paths[0]!.status).toBe("CANDIDATE");

    // Stage D: debt-only CERTIFIED VEP must not claim a SECURED_DEBT CANDIDATE path.
    const securedEnum = enumerateCertifiedPaths({
      verifiedPackage: pkg,
      transactionKind: "SECURED_DEBT",
      secured: true,
    });
    expect(securedEnum.incompleteReasons).toContain("NO_CERTIFIED_LIEN_COMPANION_FOR_SECURED_DEBT");
    expect(securedEnum.authority).toBe("INCOMPLETE_PACKAGE");
    expect(securedEnum.paths.every((p) => p.status !== "CANDIDATE")).toBe(true);

    const graph = buildCapacityGraph({
      rules: pkg.rules,
      definitions: pkg.definitions ?? [],
      sharedCapacities: pkg.sharedCapacities ?? [],
      companyId: pkg.companyId,
      instrumentKey: pkg.instrumentKey,
      asOf: AS_OF,
    });
    const deps = graph.dependencyManifest.dependencies.filter((d) => d.inputKind === "METRIC");
    expect(deps.some((d) => d.key === "Consolidated Total Assets")).toBe(true);
    const lineage = { exprId: null, inputKeys: [] as string[] };
    const snapshot: FinancialSnapshot = {
      snapshotId: "test-synthetic-cta",
      version: "1",
      companyId: pkg.companyId,
      asOf: AS_OF,
      reportingPeriod: "test",
      status: "APPROVED",
      supersedesSnapshotId: null,
      provenance: {
        source: "SYNTHETIC_LABELED_TECHNICAL_DEMO",
        sourceVersion: "test",
        note: "labeled synthetic — not a certified customer result",
      },
      review: { reviewedBy: "test", reviewedAt: "2026-10-09T00:00:00Z", approvalRef: "SYNTHETIC_NOT_CUSTOMER" },
      inputs: deps.map((d) => ({
        identity: {
          companyId: d.companyId ?? pkg.companyId,
          scope: { kind: "INSTRUMENT_LEVEL" as const, instrumentKey: d.instrumentKey! },
          inputKind: d.inputKind,
          key: d.key,
          identityStrength: d.identityStrength,
          period: d.period,
          asOf: d.asOf,
          valueType: "MONEY" as const,
          currency: "USD",
        },
        value: { type: "MONEY" as const, amount: rationalFromString("2000000000"), currency: "USD", lineage },
        sourceVersion: "test",
        note: "SYNTHETIC CTA $2B",
      })),
    };
    expect(snapshot.provenance.source).toContain("SYNTHETIC");

    const inputs = snapshotInputResolver({
      snapshots: [snapshot],
      definitions: [...(pkg.definitions ?? [])],
      rules: [...pkg.rules],
      companyId: pkg.companyId,
      instrumentKey: pkg.instrumentKey,
    });
    const capacity = evaluateVerifiedCapacity({ package: pkg, inputs, ledger: [], asOf: AS_OF });
    expect(capacity.outcome).toBe("EXECUTED");
    if (capacity.outcome !== "EXECUTED") throw new Error("expected EXECUTED");
    const entry = capacity.state.capacities[0]!;
    expect(entry.status).toBe("AVAILABLE");
    expect(entry.effectiveRemaining.kind).toBe("AMOUNT");
    if (entry.effectiveRemaining.kind !== "AMOUNT" || entry.effectiveRemaining.value.type !== "MONEY") {
      throw new Error("expected money remaining");
    }
    // greater of $50M and 3% of $2B = $60M
    expect(entry.effectiveRemaining.value.amount).toBe("60000000");

    const sim = simulateVerifiedTransaction({
      package: pkg,
      inputs,
      ledger: [],
      asOf: AS_OF,
      transaction: {
        transactionId: "test-finance-lease-10m",
        companyId: pkg.companyId,
        instrumentKey: pkg.instrumentKey,
        effectiveAsOf: AS_OF,
        category: "INCUR_DEBT",
        label: "SYNTHETIC $10M Finance Lease",
        effects: [
          {
            effectId: "e1",
            kind: "CONSUME_CAPACITY",
            capacityNodeId: entry.capacityNodeId,
            amount: { type: "MONEY", amount: "10000000", currency: "USD" },
          },
        ],
        intendedAmount: { type: "MONEY", amount: "10000000", currency: "USD" },
        unallocatedAmount: null,
        provenance: {
          source: "SYNTHETIC_LABELED_TECHNICAL_DEMO",
          sourceVersion: "test",
          approvalRef: "SYNTHETIC_NOT_CUSTOMER",
        },
      },
      selectedPath: {
        capacityNodeIds: [entry.capacityNodeId],
        ruleIds: [entry.ruleId],
        sharedCapacityIds: [],
        reclassificationElectionIds: [],
      },
    });
    expect(sim.outcome).toBe("EXECUTED");
    if (sim.outcome !== "EXECUTED") throw new Error("expected sim EXECUTED");
    expect(sim.simulation.simulationStatus).toBe("SIMULATED");
    expect(sim.simulation.capacityEffects[0]?.outcome).toBe("SATISFIED");
    expect(sim.simulation.effects[0]?.applied).toBe(true);
  });

  it("SOURCE_SCOPE_DERIVED with safeToRely true is not treated as SCOPE_NOT_SAFE_TO_RELY_ON", () => {
    const { cert, verifiedPackage } = loadCertified();
    const adapter = certifiedMapToVerifiedExecutionPackage([{ certification: cert, verifiedPackage }]);
    if (adapter.outcome !== "DERIVED") throw new Error("expected DERIVED");
    const audit = adapter.package.rules[0]!.entityScopeAudit;
    expect(audit?.status).toBe("SOURCE_SCOPE_DERIVED");
    expect(audit?.safeToRely).toBe(true);
    const graph = buildCapacityGraph({
      rules: adapter.package.rules,
      definitions: adapter.package.definitions ?? [],
      sharedCapacities: adapter.package.sharedCapacities ?? [],
      companyId: adapter.package.companyId,
      instrumentKey: adapter.package.instrumentKey,
      asOf: AS_OF,
    });
    expect(graph.nodes[0]!.entityScope?.applicability).toBe("SCOPE_CONFIRMED_BY_SOURCE");
    expect(graph.nodes[0]!.entityScope?.safeToRely).toBe(true);
  });
});
