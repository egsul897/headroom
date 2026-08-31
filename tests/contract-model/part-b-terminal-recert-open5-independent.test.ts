/**
 * Phase 3F.1-terminal Part B - INDEPENDENT recertification of OPEN-5
 * (AUDIT-F2 residual: AnalysisRun/SemanticTruthRecord zombie-writer fencing).
 *
 * This is a FRESH adversarial test file, written from scratch by the Part B
 * auditor for this phase. It deliberately does NOT re-run or extend
 * tests/contract-model/part-b-recert-finding6-independent.test.ts (the Part A
 * implementer's OWN "FIX VERIFICATION" tests, which only prove the fix
 * against the specific attack shapes Part A itself already knew about) - the
 * point of an independent recertification is to try NEW attack shapes the
 * fix's own author never had to defend against.
 *
 * Target: lib/contract-model/analysis/semantic-truth/service.ts's
 * `persistSemanticTruthForInstrument`, as fixed by Phase 3F.1-terminal Part A
 * (see docs/phase-3f1-terminal-architecture-decision/07-analysis-run-fencing.json):
 * each object's own read-existing + create/update now runs inside its OWN
 * `prisma.$transaction`, which first takes `SELECT "executionGeneration" ...
 * FOR UPDATE` on the parent `analysis_runs` row and only proceeds to that
 * object's own write if the lock-protected, freshly-read generation still
 * matches the caller's `expectedGeneration`.
 *
 * NEW attack shapes exercised here (all against real, unmocked Postgres):
 *
 *   1. Deterministic controlled interleave, but against a BATCH of several
 *      distinct semanticObjectIds in one call (Part A's own deterministic
 *      test used exactly one object).
 *   2. A genuine `Promise.all` two-owner race across MULTIPLE distinct
 *      concurrent objects in the same run (Part A's own Promise.all test
 *      used exactly one object).
 *   3. A THREE-way race: a definite zombie (gen1), a legitimately-current
 *      writer (gen2) whose own write is itself racing a concurrent reclaim,
 *      and the reclaim that mints gen3 - all fired together in ONE
 *      `Promise.all`, with an intermediate-state check (never observe the
 *      zombie's content, even transiently) as well as a final-state check.
 *      Part A's own tests never exceeded a two-generation race.
 *   4. The same three-way generation-flux race repeated across several
 *      distinct semanticObjectIds fired together in a single `Promise.all`.
 *   5. A dedicated lock-contention / deadlock-risk probe: many concurrent,
 *      genuinely VALID (non-stale, same generation) writes to a MIX of
 *      distinct and overlapping semanticObjectIds on the SAME AnalysisRun
 *      row, wrapped in a wall-clock timeout guard, to check whether serially
 *      acquiring `FOR UPDATE` on the same parent row for many concurrent
 *      per-object transactions can hang/deadlock rather than merely
 *      serialize.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../../lib/prisma";
import { startOrResumeAnalysisRun } from "../../lib/contract-model/analysis/service";
import { persistSemanticTruthForInstrument } from "../../lib/contract-model/analysis/semantic-truth/service";
import { CONTRACT_ANALYSIS_ORCHESTRATOR_VERSION } from "../../lib/contract-model/analysis/identity";
import { IR_SCHEMA_VERSION } from "../../lib/contract-model/ir/types";
import type { IRRule } from "../../lib/contract-model/ir/types";
import type { SemanticTruthObjectInput } from "../../lib/contract-model/analysis/semantic-truth/types";

const COMPANY_ID = "part-b-terminal-recert-open5-independent";

async function cleanupCompanyState() {
  await prisma.claimReviewItem.deleteMany({ where: { companyId: COMPANY_ID } });
  await prisma.analysisRunIssue.deleteMany({ where: { companyId: COMPANY_ID } });
  await prisma.semanticTruthRecord.deleteMany({ where: { companyId: COMPANY_ID } });
  await prisma.analysisFailureLog.deleteMany({ where: { companyId: COMPANY_ID } });
  await prisma.analysisRun.deleteMany({ where: { companyId: COMPANY_ID } });
  await prisma.documentNode.deleteMany({ where: { companyId: COMPANY_ID } });
  await prisma.document.deleteMany({ where: { companyId: COMPANY_ID } });
}

beforeAll(async () => {
  await prisma.company.deleteMany({ where: { id: COMPANY_ID } });
  await prisma.company.create({ data: { id: COMPANY_ID, name: "Part B terminal recert OPEN-5 independent co", onboardingStatus: "ONBOARDING" } });
});

afterAll(async () => {
  await cleanupCompanyState();
  await prisma.company.deleteMany({ where: { id: COMPANY_ID } });
});

beforeEach(async () => {
  await cleanupCompanyState();
});

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Races `promise` against a hard wall-clock timeout so a genuine deadlock/hang fails the test instead of hanging the whole suite. */
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`TIMEOUT after ${ms}ms waiting for: ${label} - possible deadlock/hang in FOR UPDATE row-lock contention`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer!)) as Promise<T>;
}

const compilerVersions = { irSchemaVersion: IR_SCHEMA_VERSION, compilerAlgorithmVersion: "test-compiler-open5", compilerPromptVersion: "test-prompt-open5", toolPolicyVersion: "test-tool-open5" };

function makeRule(overrides: Partial<IRRule> & { ruleId: string; instrumentKey: string }): IRRule {
  return {
    irSchemaVersion: IR_SCHEMA_VERSION,
    companyId: COMPANY_ID,
    sourceDocumentId: "doc-1",
    sourceSectionRef: "1.00",
    covenantFamily: "INDEBTEDNESS",
    ruleType: "QUANTITATIVE_PERMISSION",
    posture: "PERMISSION",
    action: "INCUR_DEBT",
    entityScope: [],
    entityScopeExcluded: [],
    transactionScope: null,
    capacityExpression: null,
    conditions: [],
    exceptions: [],
    dependsOn: [],
    operativeLineage: null,
    sufficiency: "COMPLETE",
    sufficiencyReasons: [],
    provenance: null,
    compilerVersion: "test-v1",
    sourceContentVersion: null,
    ...overrides,
  };
}

function moneyRule(ruleId: string, instrumentKey: string, amount: number, sectionRef = "9.01"): IRRule {
  return makeRule({ ruleId, instrumentKey, sourceSectionRef: sectionRef, capacityExpression: { kind: "MONEY", type: "MONEY", exprId: `e-${ruleId}-${amount}`, amount, currency: "USD" } as unknown as IRRule["capacityExpression"] });
}

function objectInput(rule: IRRule, candidateRef: string): SemanticTruthObjectInput {
  return { kind: "RULE", object: rule, candidateRef, compilerVersions, verification: null, verifierPromptVersion: null };
}

async function amountOf(instrumentKey: string, ruleId: string): Promise<number | null> {
  const rec = await prisma.semanticTruthRecord.findUnique({ where: { companyId_instrumentKey_kind_semanticObjectId: { companyId: COMPANY_ID, instrumentKey, kind: "RULE", semanticObjectId: ruleId } } });
  if (!rec) return null;
  return ((rec.payload as unknown as IRRule).capacityExpression as unknown as { amount: number }).amount;
}

async function bumpGeneration(runId: string): Promise<number> {
  const updated = await prisma.analysisRun.update({ where: { id: runId }, data: { executionGeneration: { increment: 1 } } });
  return updated.executionGeneration;
}

describe("Phase 3F.1-terminal Part B INDEPENDENT recertification - OPEN-5 (AnalysisRun/SemanticTruthRecord zombie-writer fencing)", () => {
  it("SCENARIO 1 - deterministic controlled interleave, BATCH OF 5 DISTINCT OBJECTS: a stale (gen1) batch write, held open past a real reclaim via a manual gate (not vi.spyOn - see part-b-recert-finding6-independent.test.ts's own diagnostic note on why vi.spyOn corrupts Prisma's proxy), must not clobber ANY of the 5 objects the new (gen2) owner already persisted fresh content for", async () => {
    const identity = { companyId: COMPANY_ID, packageKey: "pkg-open5-indep-batch-interleave", documentIds: ["doc-x"], analysisAlgorithmVersion: CONTRACT_ANALYSIS_ORCHESTRATOR_VERSION };
    const claim = await startOrResumeAnalysisRun(identity);
    const runId = claim.run.id;
    const gen1 = claim.run.executionGeneration;
    expect(gen1).toBe(1);

    const instrumentKey = "batch-interleave-instrument";
    const N = 5;
    const ruleIds = Array.from({ length: N }, (_, i) => `batch-shared-rule-${i}`);
    const staleObjects = ruleIds.map((id, i) => objectInput(moneyRule(id, instrumentKey, 1000 + i), `c-stale-${i}`));
    const freshObjects = ruleIds.map((id, i) => objectInput(moneyRule(id, instrumentKey, 9000 + i), `c-fresh-${i}`));

    const originalFindUnique = prisma.analysisRun.findUnique;
    let releaseGate: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      releaseGate = resolve;
    });
    let delayNext = true;
    (prisma.analysisRun as unknown as { findUnique: typeof prisma.analysisRun.findUnique }).findUnique = (async (args: Parameters<typeof prisma.analysisRun.findUnique>[0]) => {
      const real = await originalFindUnique(args as never);
      const targetsOurRun = (args as { where?: { id?: string } })?.where?.id === runId;
      if (targetsOurRun && delayNext) {
        delayNext = false;
        await gate;
      }
      return real;
    }) as unknown as typeof prisma.analysisRun.findUnique;

    try {
      const staleBatchPromise = persistSemanticTruthForInstrument({ companyId: COMPANY_ID, packageKey: identity.packageKey, instrumentKey, analysisRunId: runId, expectedGeneration: gen1, objects: staleObjects });

      await sleep(25);
      const gen2 = await bumpGeneration(runId);
      expect(gen2).toBe(gen1 + 1);

      const freshSummary = await persistSemanticTruthForInstrument({ companyId: COMPANY_ID, packageKey: identity.packageKey, instrumentKey, analysisRunId: runId, expectedGeneration: gen2, objects: freshObjects });
      expect(freshSummary.skippedSupersededGeneration).toBe(false);
      expect(freshSummary.upserted).toBe(N);

      releaseGate();
      const staleSummary = await staleBatchPromise;

      expect(staleSummary.skippedSupersededGeneration).toBe(true);
      expect(staleSummary.upserted).toBe(0);

      for (let i = 0; i < N; i++) {
        expect(await amountOf(instrumentKey, ruleIds[i]!)).toBe(9000 + i);
      }
      const records = await prisma.semanticTruthRecord.findMany({ where: { companyId: COMPANY_ID, instrumentKey } });
      expect(records).toHaveLength(N);
      for (const r of records) expect(r.version).toBe(1); // the stale writer never touched any of these rows
    } finally {
      (prisma.analysisRun as unknown as { findUnique: typeof prisma.analysisRun.findUnique }).findUnique = originalFindUnique;
    }
  });

  it("SCENARIO 2 - GENUINE Promise.all race, MULTIPLE CONCURRENT OBJECTS, two owners: a stale batch write and the real reclaim fired TOGETHER with zero sequencing, across 6 distinct objects at once - no object's final content is ever the stale one once the new owner's write has run", async () => {
    const identity = { companyId: COMPANY_ID, packageKey: "pkg-open5-indep-batch-promiseall", documentIds: ["doc-x"], analysisAlgorithmVersion: CONTRACT_ANALYSIS_ORCHESTRATOR_VERSION };
    const claim = await startOrResumeAnalysisRun(identity);
    const runId = claim.run.id;
    const gen1 = claim.run.executionGeneration;

    const instrumentKey = "batch-promiseall-instrument";
    const N = 6;
    const ruleIds = Array.from({ length: N }, (_, i) => `pa-shared-rule-${i}`);
    const staleObjects = ruleIds.map((id, i) => objectInput(moneyRule(id, instrumentKey, 2000 + i), `c-stale-pa-${i}`));

    // Fire the stale (gen1) batch write and the real reclaim TOGETHER - no
    // `await sleep`, no artificial before/after sequencing.
    const [staleSummary, reclaimed] = await Promise.all([
      persistSemanticTruthForInstrument({ companyId: COMPANY_ID, packageKey: identity.packageKey, instrumentKey, analysisRunId: runId, expectedGeneration: gen1, objects: staleObjects }),
      prisma.analysisRun.update({ where: { id: runId }, data: { executionGeneration: { increment: 1 } } }),
    ]);
    const gen2 = reclaimed.executionGeneration;
    expect(gen2).toBe(gen1 + 1);

    // The new owner deterministically persists its own fresh content for the
    // SAME 6 objects, strictly after the race above has settled.
    const freshObjects = ruleIds.map((id, i) => objectInput(moneyRule(id, instrumentKey, 8000 + i), `c-fresh-pa-${i}`));
    const freshSummary = await persistSemanticTruthForInstrument({ companyId: COMPANY_ID, packageKey: identity.packageKey, instrumentKey, analysisRunId: runId, expectedGeneration: gen2, objects: freshObjects });
    expect(freshSummary.skippedSupersededGeneration).toBe(false);

    for (let i = 0; i < N; i++) {
      const amount = await amountOf(instrumentKey, ruleIds[i]!);
      // Never the stale value once the new owner's write has run - whether
      // the stale writer legitimately landed before the reclaim for a
      // PARTICULAR object (a correct outcome the fresh write above still
      // supersedes) or was rejected outright, the final observable state
      // must be the fresh owner's content for every single object.
      expect(amount).toBe(8000 + i);
    }
    expect(typeof staleSummary.skippedSupersededGeneration).toBe("boolean");
  });

  it("SCENARIO 3 - THREE-WAY GENERATION-FLUX RACE, single object: a definite zombie (gen1), a legitimately-current writer (gen2) itself racing a concurrent reclaim, and the reclaim that mints gen3 - all fired in ONE Promise.all. The zombie's content must never appear, even transiently.", async () => {
    const identity = { companyId: COMPANY_ID, packageKey: "pkg-open5-indep-threeway-single", documentIds: ["doc-x"], analysisAlgorithmVersion: CONTRACT_ANALYSIS_ORCHESTRATOR_VERSION };
    const claim = await startOrResumeAnalysisRun(identity);
    const runId = claim.run.id;
    const gen1 = claim.run.executionGeneration;
    expect(gen1).toBe(1);

    const instrumentKey = "threeway-single-instrument";
    const ruleId = "threeway-shared-rule";

    // gen1 -> gen2 happens BEFORE the race (quiescent - models a writer whose
    // own claim is already one hop old but who has not yet attempted to
    // write).
    const gen2 = await bumpGeneration(runId);
    expect(gen2).toBe(2);

    const zombieObj = [objectInput(moneyRule(ruleId, instrumentKey, 111), "c-zombie")];
    const currentObj = [objectInput(moneyRule(ruleId, instrumentKey, 222), "c-current")];

    // Three genuinely concurrent operations: the gen1 zombie's write (must
    // ALWAYS lose - its own top-level pre-check alone already sees
    // generation 2, since gen1->gen2 already committed above), the gen2
    // writer's write (racing the reclaim below for real), and the reclaim
    // itself (mints gen3).
    const [zombieSummary, currentSummary, reclaimed] = await Promise.all([
      persistSemanticTruthForInstrument({ companyId: COMPANY_ID, packageKey: identity.packageKey, instrumentKey, analysisRunId: runId, expectedGeneration: gen1, objects: zombieObj }),
      persistSemanticTruthForInstrument({ companyId: COMPANY_ID, packageKey: identity.packageKey, instrumentKey, analysisRunId: runId, expectedGeneration: gen2, objects: currentObj }),
      prisma.analysisRun.update({ where: { id: runId }, data: { executionGeneration: { increment: 1 } } }),
    ]);
    const gen3 = reclaimed.executionGeneration;
    expect(gen3).toBe(3);

    // The zombie (gen1) must ALWAYS be rejected - unambiguous, no race window
    // for it at all (generation was already 2 before the Promise.all began).
    expect(zombieSummary.skippedSupersededGeneration).toBe(true);
    expect(zombieSummary.upserted).toBe(0);

    // INTERMEDIATE-STATE CHECK: whatever the current record looks like right
    // now, it must NEVER be the zombie's content (111) - either it does not
    // exist yet (gen2 lost its own race against the reclaim) or it is
    // exactly the gen2 writer's legitimate content (222).
    const midAmount = await amountOf(instrumentKey, ruleId);
    expect(midAmount === null || midAmount === 222).toBe(true);
    expect(midAmount).not.toBe(111);
    expect(typeof currentSummary.skippedSupersededGeneration).toBe("boolean");

    // The true, final gen3 owner now writes for real.
    const finalObj = [objectInput(moneyRule(ruleId, instrumentKey, 333), "c-final")];
    const finalSummary = await persistSemanticTruthForInstrument({ companyId: COMPANY_ID, packageKey: identity.packageKey, instrumentKey, analysisRunId: runId, expectedGeneration: gen3, objects: finalObj });
    expect(finalSummary.skippedSupersededGeneration).toBe(false);

    const finalAmount = await amountOf(instrumentKey, ruleId);
    expect(finalAmount).toBe(333);
    const finalRecord = await prisma.semanticTruthRecord.findUniqueOrThrow({ where: { companyId_instrumentKey_kind_semanticObjectId: { companyId: COMPANY_ID, instrumentKey, kind: "RULE", semanticObjectId: ruleId } } });
    // At most 2 real content writes ever landed for this row across the
    // whole three-generation flux (gen2's, if it won its race, then gen3's) -
    // NEVER 3, and the zombie's write in particular never counted.
    expect(finalRecord.version).toBeLessThanOrEqual(2);
    expect(finalRecord.version).toBeGreaterThanOrEqual(1);
  }, 20000);

  it("SCENARIO 4 - THREE-WAY GENERATION-FLUX RACE, MULTIPLE DISTINCT OBJECTS AT ONCE: the same zombie/current/reclaim flux as SCENARIO 3, but for 4 different semanticObjectIds fired together in a single Promise.all (12 concurrent operations total) - every object independently resists the zombie", async () => {
    const identity = { companyId: COMPANY_ID, packageKey: "pkg-open5-indep-threeway-multi", documentIds: ["doc-x"], analysisAlgorithmVersion: CONTRACT_ANALYSIS_ORCHESTRATOR_VERSION };
    const claim = await startOrResumeAnalysisRun(identity);
    const runId = claim.run.id;
    const gen1 = claim.run.executionGeneration;

    const instrumentKey = "threeway-multi-instrument";
    const K = 4;
    const ruleIds = Array.from({ length: K }, (_, i) => `threeway-multi-rule-${i}`);

    const gen2 = await bumpGeneration(runId);
    expect(gen2).toBe(gen1 + 1);

    const zombieCalls = ruleIds.map((id, i) => persistSemanticTruthForInstrument({ companyId: COMPANY_ID, packageKey: identity.packageKey, instrumentKey, analysisRunId: runId, expectedGeneration: gen1, objects: [objectInput(moneyRule(id, instrumentKey, 1100 + i), `c-zombie-${i}`)] }));
    const currentCalls = ruleIds.map((id, i) => persistSemanticTruthForInstrument({ companyId: COMPANY_ID, packageKey: identity.packageKey, instrumentKey, analysisRunId: runId, expectedGeneration: gen2, objects: [objectInput(moneyRule(id, instrumentKey, 2200 + i), `c-current-${i}`)] }));
    const reclaimCall = prisma.analysisRun.update({ where: { id: runId }, data: { executionGeneration: { increment: 1 } } });

    const results = await Promise.all([...zombieCalls, ...currentCalls, reclaimCall]);
    const zombieResults = results.slice(0, K) as Awaited<ReturnType<typeof persistSemanticTruthForInstrument>>[];
    const gen3 = (results[results.length - 1] as { executionGeneration: number }).executionGeneration;
    expect(gen3).toBe(gen2 + 1);

    for (const r of zombieResults) {
      expect(r.skippedSupersededGeneration).toBe(true);
      expect(r.upserted).toBe(0);
    }

    // Intermediate check across ALL K objects: never the zombie's content.
    for (let i = 0; i < K; i++) {
      const mid = await amountOf(instrumentKey, ruleIds[i]!);
      expect(mid).not.toBe(1100 + i);
    }

    // The true gen3 owner now writes real, final content for all K objects.
    const finalObjects = ruleIds.map((id, i) => objectInput(moneyRule(id, instrumentKey, 3300 + i), `c-final-${i}`));
    const finalSummary = await persistSemanticTruthForInstrument({ companyId: COMPANY_ID, packageKey: identity.packageKey, instrumentKey, analysisRunId: runId, expectedGeneration: gen3, objects: finalObjects });
    expect(finalSummary.skippedSupersededGeneration).toBe(false);

    for (let i = 0; i < K; i++) {
      expect(await amountOf(instrumentKey, ruleIds[i]!)).toBe(3300 + i);
    }
  }, 20000);

  it("SCENARIO 5 - LOCK-CONTENTION / DEADLOCK-RISK PROBE: many concurrent, genuinely VALID (same generation, non-stale) writes to a MIX of distinct and overlapping semanticObjectIds on the SAME AnalysisRun row must all complete correctly within a bounded wall-clock timeout, never hang", async () => {
    const identity = { companyId: COMPANY_ID, packageKey: "pkg-open5-indep-deadlock-probe", documentIds: ["doc-x"], analysisAlgorithmVersion: CONTRACT_ANALYSIS_ORCHESTRATOR_VERSION };
    const claim = await startOrResumeAnalysisRun(identity);
    const runId = claim.run.id;
    const gen = claim.run.executionGeneration;

    const instrumentKey = "deadlock-probe-instrument";
    const DISTINCT = 15;
    const SHARED_WRITERS = 10; // 10 concurrent writers all targeting the SAME single object

    const distinctRuleIds = Array.from({ length: DISTINCT }, (_, i) => `deadlock-distinct-rule-${i}`);
    const sharedRuleId = "deadlock-shared-rule";

    const distinctCalls = distinctRuleIds.map((id, i) => persistSemanticTruthForInstrument({ companyId: COMPANY_ID, packageKey: identity.packageKey, instrumentKey, analysisRunId: runId, expectedGeneration: gen, objects: [objectInput(moneyRule(id, instrumentKey, 4000 + i), `c-distinct-${i}`)] }));
    // Every one of these 10 concurrent calls writes DIFFERENT content for the
    // identical semanticObjectId, under the SAME valid generation - stresses
    // both the parent-row lock (contention) and the child-row
    // read-existing/create-or-update logic (does two concurrent transactions
    // both reading `existing === null` for the same new row ever produce a
    // duplicate-key error, since the lock they both must acquire first is on
    // the PARENT row, not this specific child row?).
    const sharedCalls = Array.from({ length: SHARED_WRITERS }, (_, i) => persistSemanticTruthForInstrument({ companyId: COMPANY_ID, packageKey: identity.packageKey, instrumentKey, analysisRunId: runId, expectedGeneration: gen, objects: [objectInput(moneyRule(sharedRuleId, instrumentKey, 5000 + i), `c-shared-${i}`)] }));

    const started = Date.now();
    const TIMEOUT_MS = 25000;
    let outcome: { status: "settled"; results: Awaited<ReturnType<typeof persistSemanticTruthForInstrument>>[] } | { status: "timed_out" };
    try {
      const results = await withTimeout(Promise.all([...distinctCalls, ...sharedCalls]), TIMEOUT_MS, `${DISTINCT + SHARED_WRITERS} concurrent persistSemanticTruthForInstrument calls against one AnalysisRun row`);
      outcome = { status: "settled", results };
    } catch (err) {
      if (err instanceof Error && err.message.startsWith("TIMEOUT")) {
        outcome = { status: "timed_out" };
      } else {
        throw err; // a real error (e.g. an actual P2002/deadlock DB error) should fail the test loudly, not be swallowed as a timeout
      }
    }
    const elapsedMs = Date.now() - started;

    // The headline assertion: this must NEVER time out. A hang here would be
    // exactly the "new deadlock risk" the fencing fix could plausibly have
    // introduced by serializing every per-object write on one shared parent
    // row lock.
    expect(outcome.status).toBe("settled");
    if (outcome.status !== "settled") throw new Error("unreachable");

    // No individual call should have been rejected as superseded - every one
    // of these carried the SAME, genuinely still-current generation the
    // whole time (nothing reclaimed this row during the probe).
    for (const r of outcome.results) {
      expect(r.skippedSupersededGeneration).toBe(false);
      expect(r.upserted).toBe(1);
    }

    // All 15 distinct objects persisted their own correct content.
    for (let i = 0; i < DISTINCT; i++) {
      expect(await amountOf(instrumentKey, distinctRuleIds[i]!)).toBe(4000 + i);
    }

    // The shared object: exactly one of the 10 concurrent writers' contents
    // is the final one (whichever the real Postgres row-lock serialization
    // let land last) - no corruption, no duplicate-key crash, no partial/
    // mixed write, and the row's version was incremented once per distinct
    // content change actually applied (never more than SHARED_WRITERS, never
    // fewer than 1).
    const sharedRecord = await prisma.semanticTruthRecord.findUniqueOrThrow({ where: { companyId_instrumentKey_kind_semanticObjectId: { companyId: COMPANY_ID, instrumentKey, kind: "RULE", semanticObjectId: sharedRuleId } } });
    const sharedAmount = (sharedRecord.payload as unknown as IRRule).capacityExpression as unknown as { amount: number };
    expect(sharedAmount.amount).toBeGreaterThanOrEqual(5000);
    expect(sharedAmount.amount).toBeLessThan(5000 + SHARED_WRITERS);
    expect(sharedRecord.version).toBeGreaterThanOrEqual(1);
    expect(sharedRecord.version).toBeLessThanOrEqual(SHARED_WRITERS);

    // Not a pass/fail assertion (real DB latency varies by environment), but
    // recorded for the recertification record.
    // eslint-disable-next-line no-console
    console.log(`[OPEN-5 deadlock probe] ${DISTINCT + SHARED_WRITERS} concurrent per-object transactions against one AnalysisRun row settled in ${elapsedMs}ms (timeout guard was ${TIMEOUT_MS}ms).`);
  }, 30000);

  it("CLEANUP SANITY CHECK: this file's own company/run/semantic-truth-record state leaves zero residue after the full suite", async () => {
    await cleanupCompanyState();
    expect(await prisma.analysisRun.count({ where: { companyId: COMPANY_ID } })).toBe(0);
    expect(await prisma.semanticTruthRecord.count({ where: { companyId: COMPANY_ID } })).toBe(0);
    expect(await prisma.analysisRunIssue.count({ where: { companyId: COMPANY_ID } })).toBe(0);
  });
});
