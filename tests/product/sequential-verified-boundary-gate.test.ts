/**
 * Final integration gate for PR #243 — sequential uses verified adapter under REQUIRE;
 * shared-cap identity matching must not admit unverified pools; #229 A8 floors preserved.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import {
  buildSharedCapacitySequentialWorld,
  buildRatioGatedSequentialWorld,
  runSequentialTransactions,
  SEQUENTIAL_EXECUTION_VERSION,
} from "@/lib/contract-model/sequential-execution";
import {
  evaluateVerifiedCapacity,
  simulateVerifiedTransaction,
  VERIFIED_EXECUTION_POLICY,
  type VerifiedExecutionPackage,
  type VerifiedUnitArtifact,
} from "@/lib/contract-model/verified-execution";
import { buildRatioGatedSequenceSteps } from "@/lib/product/north-star-workflow/sequential-demo-scenario";
import { cash, consume, proposal, route } from "../contract-model/runtime/transaction/helpers";

describe("architecture allowlist: verified-execution is the sole guarded importer", () => {
  it("sequential-execution does not import capacity/graph, capacity/state, or transaction/simulate", () => {
    const src = fs.readFileSync("lib/contract-model/sequential-execution.ts", "utf8");
    expect(src).not.toMatch(/runtime\/(capacity\/graph|capacity\/state|transaction\/simulate)/);
    expect(src).toMatch(/simulateVerifiedTransaction/);
    expect(src).toMatch(/evaluateVerifiedCapacity/);
  });

  it("certified architecture allowlist remains verified-execution only", () => {
    const arch = fs.readFileSync("tests/contract-model/certified/architecture.test.ts", "utf8");
    expect(arch).toMatch(/expect\(runtimeImporters\)\.toEqual\(\["verified-execution\.ts"\]\)/);
    expect(arch).not.toMatch(/\["sequential-execution\.ts",\s*"verified-execution\.ts"\]/);
  });
});

describe("sequential execution under REQUIRE (no ALLOW_MISSING downgrade)", () => {
  it("runner notes and policy constant prove REQUIRE; package without verifications cannot open a world", () => {
    expect(VERIFIED_EXECUTION_POLICY).toBe("REQUIRE");
    expect(SEQUENTIAL_EXECUTION_VERSION).toBe("sequential-execution.v1");
    const w = buildRatioGatedSequentialWorld();
    expect(w.package.verifications.length).toBeGreaterThan(0);
    const stripped: VerifiedExecutionPackage = { ...w.package, verifications: [] };
    const refused = evaluateVerifiedCapacity({
      package: stripped,
      inputs: w.inputs,
      ledger: w.ledger,
      asOf: w.asOf,
    });
    expect(refused.outcome).toBe("REFUSED");
    if (refused.outcome !== "REFUSED") throw new Error("unreachable");
    expect(refused.policy).toBe("REQUIRE");
    expect(refused.refusals.some((r) => r.code === "VERIFICATION_ARTIFACT_INCOMPLETE")).toBe(true);
  });

  it("ratio-gated sequential chaining fails closed after leverage worsens (financial + path)", () => {
    const { world, incur, dividend } = buildRatioGatedSequenceSteps();
    const run = runSequentialTransactions({
      world,
      steps: [incur, dividend],
      mode: "HYPOTHETICAL",
      utilizationAffirmedComplete: true,
    });
    expect(run.notes.some((n) => /simulateVerifiedTransaction under REQUIRE/.test(n))).toBe(true);
    expect(run.steps[0]!.simulation?.selectedPathResult).toBe("SATISFIED");
    expect(run.steps[0]!.financialViewChained).toBe(true);
    expect(run.steps[1]!.simulation?.selectedPathResult).toBe("NOT_SATISFIED");
    expect(run.steps[1]!.postState).toBeNull();
  });
});

describe("shared-capacity identity matching does not admit unverified pools", () => {
  function withPoolArtifact(
    pkg: VerifiedExecutionPackage,
    mutate: (art: VerifiedUnitArtifact) => VerifiedUnitArtifact | null,
  ): VerifiedExecutionPackage {
    const capArt = pkg.verifications.find((v) => v.kind === "SHARED_CAPACITY")!;
    const others = pkg.verifications.filter((v) => v !== capArt);
    const next = mutate(capArt);
    return { ...pkg, verifications: next ? [...others, next] : others };
  }

  it("VALID: clean SHARED_CAPACITY artifact → EXECUTED under REQUIRE; sequential draw SATISFIED", () => {
    const w = buildSharedCapacitySequentialWorld();
    const cap = evaluateVerifiedCapacity({
      package: w.package,
      inputs: w.inputs,
      ledger: [],
      asOf: w.asOf,
    });
    expect(cap.outcome).toBe("EXECUTED");
    if (cap.outcome !== "EXECUTED") throw new Error("unreachable");
    expect(cap.policy).toBe("REQUIRE");
    expect(cap.state.sharedConstraints).toHaveLength(1);
    expect(cap.state.sharedConstraints[0]!.status).toBe("AVAILABLE");
    expect(cap.state.capacities.every((c) => c.status === "AVAILABLE")).toBe(true);

    const run = runSequentialTransactions({
      world: w,
      steps: [{
        stepId: "draw-a",
        businessType: "DEBT_INCURRENCE",
        transaction: proposal("tx-a", [consume("e1", "capacity:rule:prov-a", cash("70"))], {
          companyId: w.companyId,
          instrumentKey: w.instrumentKey,
        }),
        selectedPath: route({
          capacityNodeIds: ["capacity:rule:prov-a"],
          ruleIds: ["prov-a"],
          sharedCapacityIds: ["pool-1"],
        }),
      }],
      mode: "HYPOTHETICAL",
      utilizationAffirmedComplete: true,
    });
    expect(run.steps[0]!.simulation?.selectedPathResult).toBe("SATISFIED");
  });

  it("MISSING: no SHARED_CAPACITY artifact → package REFUSED (no graph/state)", () => {
    const w = buildSharedCapacitySequentialWorld();
    const missing = withPoolArtifact(w.package, () => null);
    const out = evaluateVerifiedCapacity({
      package: missing,
      inputs: w.inputs,
      ledger: [],
      asOf: w.asOf,
    });
    expect(out.outcome).toBe("REFUSED");
    if (out.outcome !== "REFUSED") throw new Error("unreachable");
    expect(out.refusals.map((r) => r.code)).toContain("VERIFICATION_ARTIFACT_INCOMPLETE");
    expect(out.refusals[0]!.refs.join("\n")).toMatch(/no verification artifact/);
  });

  it("STALE / WEAK identity → REFUSED", () => {
    const w = buildSharedCapacitySequentialWorld();
    const stale = withPoolArtifact(w.package, (art) => ({
      ...art,
      verifiedIdentity: { ...art.verifiedIdentity, sourceContentVersion: null, compilerVersion: null },
    }));
    const out = evaluateVerifiedCapacity({
      package: stale,
      inputs: w.inputs,
      ledger: [],
      asOf: w.asOf,
    });
    expect(out.outcome).toBe("REFUSED");
    if (out.outcome !== "REFUSED") throw new Error("unreachable");
    expect(out.refusals[0]!.refs.join("\n")).toMatch(/WEAK|does not bind/);
  });

  it("MISMATCHED identity (wrong source version) → REFUSED", () => {
    const w = buildSharedCapacitySequentialWorld();
    const mismatched = withPoolArtifact(w.package, (art) => ({
      ...art,
      verifiedIdentity: {
        ...art.verifiedIdentity,
        sourceContentVersion: "seq-demo-source-STALE",
      },
    }));
    const out = evaluateVerifiedCapacity({
      package: mismatched,
      inputs: w.inputs,
      ledger: [],
      asOf: w.asOf,
    });
    expect(out.outcome).toBe("REFUSED");
    if (out.outcome !== "REFUSED") throw new Error("unreachable");
    expect(out.refusals[0]!.refs.join("\n")).toMatch(/does not bind/);
  });

  it("CONTRADICTORY: material finding on pool → REFUSED", () => {
    const w = buildSharedCapacitySequentialWorld();
    const contradictory = withPoolArtifact(w.package, (art) => ({
      ...art,
      result: {
        ...art.result,
        status: "MATERIAL_DISCREPANCY",
        findings: [{
          findingId: "f-pool",
          companyId: w.companyId,
          instrumentKey: w.instrumentKey,
          sourceDocumentId: "shared-demo-doc",
          candidateRef: "seq-demo-cand",
          ruleOrDefinitionId: art.ruleOrDefinitionId,
          irPath: null,
          findingType: "UNSUPPORTED_IR_ADDITION",
          severity: "MATERIAL",
          sourceEvidence: "",
          sourceCitation: "",
          proposedIrEvidence: "",
          verifierReasoning: "contradiction",
          deterministicSignals: [],
          verificationMethod: "DETERMINISTIC_ONLY",
          provider: null,
          model: null,
          verifierAlgorithmVersion: "v",
          verifierPromptVersion: null,
          resolutionStatus: "OPEN",
          createdAt: "2026-07-01T00:00:00.000Z",
        } as never],
      },
    }));
    const out = evaluateVerifiedCapacity({
      package: contradictory,
      inputs: w.inputs,
      ledger: [],
      asOf: w.asOf,
    });
    expect(out.outcome).toBe("REFUSED");
    if (out.outcome !== "REFUSED") throw new Error("unreachable");
    expect(out.refusals.map((r) => r.code)).toContain("VERIFICATION_ARTIFACT_INCOMPLETE");
  });

  it("MUTATED pool figures with unchanged identity → REFUSED via IR inventory witness", () => {
    const w = buildSharedCapacitySequentialWorld();
    const cap = w.package.sharedCapacities![0]!;
    const mutated = {
      ...w.package,
      sharedCapacities: [{
        ...cap,
        capExpression: { ...cap.capExpression, amount: 999 } as typeof cap.capExpression,
      }],
    };
    const out = evaluateVerifiedCapacity({
      package: mutated,
      inputs: w.inputs,
      ledger: [],
      asOf: w.asOf,
    });
    expect(out.outcome).toBe("REFUSED");
    if (out.outcome !== "REFUSED") throw new Error("unreachable");
    expect(out.refusals[0]!.refs.join("\n")).toMatch(/figures differ/);
  });
});

describe("#229 A8 protections preserved beside shared-cap identity", () => {
  it("CapacityStatus includes NOT_SATISFIED and state.ts keeps statusForAmount", () => {
    const types = fs.readFileSync("lib/contract-model/runtime/capacity/types.ts", "utf8");
    const state = fs.readFileSync("lib/contract-model/runtime/capacity/state.ts", "utf8");
    expect(types).toMatch(/"NOT_SATISFIED"/);
    expect(types).toMatch(/overConsumption/);
    expect(state).toMatch(/const statusForAmount/);
    expect(state).toMatch(/amount\.kind === "GATE_NOT_SATISFIED"/);
    expect(state).toMatch(/unitId: cap\.sharedCapId/);
  });

  it("simulateVerifiedTransaction refuses package with missing pool artifact (same as single-tx)", () => {
    const w = buildSharedCapacitySequentialWorld();
    const missing = {
      ...w.package,
      verifications: w.package.verifications.filter((v) => v.kind !== "SHARED_CAPACITY"),
    };
    const sim = simulateVerifiedTransaction({
      package: missing,
      inputs: w.inputs,
      ledger: [],
      asOf: w.asOf,
      transaction: proposal("tx-x", [consume("e1", "capacity:rule:prov-a", cash("10"))], {
        companyId: w.companyId,
        instrumentKey: w.instrumentKey,
      }),
      selectedPath: route({ capacityNodeIds: ["capacity:rule:prov-a"], ruleIds: ["prov-a"] }),
    });
    expect(sim.outcome).toBe("REFUSED");
    if (sim.outcome !== "REFUSED") throw new Error("unreachable");
    expect(sim.policy).toBe("REQUIRE");
  });
});
