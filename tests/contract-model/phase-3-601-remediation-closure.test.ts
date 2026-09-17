/**
 * PHASE 3 / 6.01 TRUST-FAILURE REMEDIATION - zero-cost regression gate over the remediated production layers
 * (§16 closure, §17 ownership/lineage projection, §18 counter audit, §22 non-reuse of failed records, §8/§14
 * oversized-unit decomposition, §9/§15 operative-state wiring). Runs the REAL planner, structural index, tool set,
 * executor and stitcher over the frozen paid inventory. Zero model calls.
 */
import { describe, expect, it } from "vitest";
import { loadRemediationEnv, computeClosure, projectLineage, auditContextualCounter, runRoute, PAID_PLAN_HASH } from "../../scripts/phase-3-601-remediation-closure";
import { DurableShardStore } from "../../scripts/phase-3-601-durable-replay";
import { DEFAULT_SHARD_BUDGET } from "../../lib/contract-model/compiler/semantic/shard-planner";
import { SHARD_PLANNER_ALGORITHM_VERSION } from "../../lib/contract-model/compiler/semantic/shard-types";

const env = loadRemediationEnv();

describe("§16 closure - every context request the two failed shards recorded is now supplied, retrievable or proven external", () => {
  const closure = computeClosure(env);

  it("still unresolved = 0 over the complete old request set", () => {
    expect(closure.counts.total).toBe(29);
    expect(closure.counts.STILL_UNRESOLVED).toBe(0);
    expect(closure.rows.filter((r) => r.new.resolution === "STILL_UNRESOLVED")).toEqual([]);
  });

  it("the two MISSING_CONTEXT triggers are closed deterministically: 2.18/2.19/2.22 retrievable through every route, 'Available Amount' indexed as a FORWARDING definition to 6.08(a)(3) and retrievable, 'Not Otherwise Applied' retrievable", () => {
    for (const key of ["2.18", "2.19", "2.22"]) {
      const row = closure.rows.find((r) => r.key === key)!;
      expect(row.new.routes.every((x) => x.ok && x.evidenceUnresolved === false)).toBe(true);
      expect(["PLANNER_CONTEXT", "BOUNDED_TOOL_ROUTE", "OWNED_PRIMARY"]).toContain(row.new.resolution);
    }
    const aa = env.idx.getDefinition("Available Amount", "doc-a")!;
    expect(aa.declarationKind).toBe("FORWARDING");
    expect(aa.forwardingTarget).toEqual({ kind: "SECTION", ref: "6.08(a)(3)" });
    const def = runRoute(env.access, "getDefinition", { term: "Available Amount" });
    expect(def.ok).toBe(true);
    expect(def.evidenceUnresolved).toBe(false);
    expect(def.summary).toMatch(/forwarding target Section 6\.08\(a\)\(3\)/);
    expect(runRoute(env.access, "getDefinition", { term: "Not Otherwise Applied" }).ok).toBe(true);
    // a plural citation of a singular definition is still refused (OPEN-2 invariant) but the refusal names the defined term
    const plural = runRoute(env.access, "getDefinition", { term: "Incremental Facilities" });
    expect(plural.ok).toBe(false);
    expect(plural.summary).toMatch(/no defined term matching/);
    expect(plural.summary).toMatch(/defines "Incremental Facility"/);
    expect(runRoute(env.access, "getDefinition", { term: "Incremental Facility" }).ok).toBe(true);
  });

  it("requests proven external to the package are handled explicitly (never guessed)", () => {
    expect(closure.rows.find((r) => r.key === "ABL Credit Agreement")!.new.resolution).toBe("PROVEN_EXTERNAL_TO_PACKAGE");
    expect(closure.rows.find((r) => r.key === "Borrowing Base")!.new.resolution).toBe("PROVEN_EXTERNAL_TO_PACKAGE");
  });
});

describe("§8/§14 oversized atomic unit - member closure removes the structural fusion without raising any limit", () => {
  it("no shard is oversized, every shard is within the unchanged default budget, and no shard ends mid-sentence", () => {
    expect(env.plan.algorithmVersion).toBe(SHARD_PLANNER_ALGORITHM_VERSION);
    expect(env.plan.budget).toEqual(DEFAULT_SHARD_BUDGET);
    expect(env.plan.totals.oversizedShards).toBe(0);
    for (const s of env.plan.shards) {
      expect(s.primaryChars).toBeLessThanOrEqual(DEFAULT_SHARD_BUDGET.maxPrimaryChars);
      expect(s.ownedUnitKeys.length).toBeLessThanOrEqual(DEFAULT_SHARD_BUDGET.maxUnitsPerShard);
      expect(s.primaryChars).toBe(s.primarySlices.reduce((a, sl) => a + (sl.charEnd - sl.charStart), 0));
    }
    expect(env.plan.mustLinkGroups.every((g) => g.unitKeys.length < 16)).toBe(true);
    expect(env.plan.ownershipProof.unowned).toBe(0);
    expect(env.plan.ownershipProof.multiplyOwned).toBe(0);
  });

  it("every shared-capacity link still keeps its members in one shard", () => {
    for (const g of env.plan.mustLinkGroups) for (const l of g.links) expect(env.plan.unitOwnerShard[l.fromUnitKey]).toBe(env.plan.unitOwnerShard[l.toUnitKey]);
  });
});

describe("§17 ownership/lineage projection under the corrected topology (scripted faithful terminal-complete outputs)", () => {
  it("all six synthetic trust counters are zero and every owned item has exactly one ownership path", async () => {
    const p = await projectLineage(env);
    expect(p.executed).toBe(env.plan.shards.length);
    expect(p.ownedValuesLost).toBe(0);
    expect(p.distinctOwnedLineageLost).toBe(0);
    expect(p.contextualOwnershipCreditViolations).toBe(0);
    expect(p.sourceUnverifiableAuthoritativeIr).toBe(0);
    expect(p.silentIncompatibleMerges).toBe(0);
    expect(p.newDanglingRefs).toBe(0);
    expect(p.materialMissingFromComposition).toBe(0);
    expect(p.duplicateOwnership).toBe(0);
    expect(p.ownershipProof.multiplyOwned).toBe(0);
    expect(p.ownershipProof.unowned).toBe(0);
    expect(p.midSentenceShards).toBe(0);
  }, 120_000);
});

describe("§18 contextual-ownership counter semantics over the frozen paid results", () => {
  it("2 contextual emissions were DETECTED and demoted; 0 were CREDITED - the paid counter measured detection, an audit-counter defect", () => {
    const a = auditContextualCounter(env);
    expect(a.detected).toBe(2);
    expect(a.demoted).toBe(2);
    expect(a.credited).toBe(0);
    expect(a.retainedDemotedObjects).toBe(0);
    expect(a.attributionRetainedFalse).toBe(true);
    expect(a.verdict).toBe("AUDIT_COUNTER_DEFECT");
  });
});

describe("§22 the failed paid shard records can never be reused as priorShardResults under the remediated plan", () => {
  it("the new plan has a new identity and the durable store rejects every old record by identity", () => {
    expect(env.plan.planHash).not.toBe(PAID_PLAN_HASH);
    expect(env.plan.shards.map((s) => s.shardHash)).not.toContain("4b97a4f01be352664f66d7165e37f3b0a42600a829e306f819c7b3489123fc2f");
    expect(env.plan.shards.map((s) => s.shardHash)).not.toContain("f422344546f42e86dd6951848772cf0f832347a84eb324e561bf6ca912d6881c");
    const store = new DurableShardStore("tests/fixtures/unseen-packages/phase-3-final-601-final-paid/durable-shards");
    const { prior } = store.loadPriorResults(env.plan, "phase-3-final-601-final-paid");
    expect(prior.size).toBe(0);
  });
});

describe("§9/§15 operative-state wiring - the harness now supplies the deterministic package fact production computes", () => {
  it("section-reading tools return confirmed-current evidence for the never-amended instrument (no OPERATIVE_STATE_UNRESOLVED from absent state)", () => {
    expect(env.access.operativeState?.status).toBe("OPERATIVE_STATE_RESOLVED");
    expect(env.access.operativeState?.provisions).toEqual([]);
    for (const [tool, input] of [["getReferencedProvision", { ref: "Section 6.01(a)" }], ["getOperativeProvision", { sectionRef: "6.08(b)" }], ["getReferencedProvision", { ref: "Section 2.18" }]] as const) {
      const r = runRoute(env.access, tool, input as Record<string, unknown>);
      expect(r.ok).toBe(true);
      expect(r.evidenceUnresolved).toBe(false);
    }
    // the pre-fix wiring (null state) is what produced the flag - reproduced deterministically for the record
    const r = runRoute({ ...env.access, operativeState: null }, "getReferencedProvision", { ref: "Section 6.01(a)" });
    expect(r.ok).toBe(true);
    expect(r.evidenceUnresolved).toBe(true);
  });
});
