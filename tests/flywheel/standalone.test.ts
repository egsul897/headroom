/**
 * Standalone flywheel — lock, Neon rules store, cron auth, slice runner (fake HTTPS).
 */

import { describe, expect, it } from "vitest";
import { assertCronAuthorized } from "@/lib/flywheel/auth";
import { tryAcquireFlywheelLock, releaseFlywheelLock, readFlywheelLock } from "@/lib/flywheel/lock";
import {
  appendPartialAcceptToNeon,
  createNeonRulesStore,
  loadLatestRulesetFromNeon,
  loadPartialAcceptsFromNeon,
  saveRulesetToNeon,
} from "@/lib/flywheel/ruleset-neon";
import { runFlywheelSlice } from "@/lib/flywheel/slice-runner";
import { getFlywheelStatus } from "@/lib/flywheel/status";
import { emptyRuleSet } from "@/lib/covenant-learning-factory/learned-rules/types";
import type { NeonHttpsExecutor } from "@/lib/covenant-learning-factory/store/neon-transport";

function memoryExecutor(): NeonHttpsExecutor & {
  locks: Map<string, Record<string, unknown>>;
  rulesets: Map<number, Record<string, unknown>>;
  partials: Map<string, Record<string, unknown>>;
  runs: Record<string, unknown>[];
  alerts: Record<string, unknown>[];
  checkpoints: Record<string, unknown> | null;
} {
  const state = {
    locks: new Map<string, Record<string, unknown>>(),
    rulesets: new Map<number, Record<string, unknown>>(),
    partials: new Map<string, Record<string, unknown>>(),
    runs: [] as Record<string, unknown>[],
    alerts: [] as Record<string, unknown>[],
    checkpoints: null as Record<string, unknown> | null,
  };

  const exec: NeonHttpsExecutor = {
    async execute(sql: string, params: unknown[] = []) {
      if (/DELETE FROM flywheel_locks WHERE "lockName"/i.test(sql) && /expiresAt/i.test(sql)) {
        for (const [k, v] of state.locks) {
          if (new Date(String(v.expiresAt)).getTime() < (params[1] as Date).getTime()) {
            state.locks.delete(k);
          }
        }
        return [];
      }
      if (/DELETE FROM flywheel_locks WHERE "lockName" = \$1 AND "holderId"/i.test(sql)) {
        const cur = state.locks.get(String(params[0]));
        if (cur && cur.holderId === params[1]) state.locks.delete(String(params[0]));
        return [];
      }
      if (/INSERT INTO flywheel_locks/i.test(sql)) {
        const name = String(params[0]);
        if (state.locks.has(name)) throw new Error("duplicate lock");
        state.locks.set(name, {
          lockName: name,
          holderId: params[1],
          acquiredAt: params[2],
          expiresAt: params[3],
          heartbeatAt: params[4],
        });
        return [];
      }
      if (/FROM flywheel_locks/i.test(sql)) {
        const row = state.locks.get(String(params[0]));
        return row ? [row] : [];
      }
      if (/INSERT INTO learning_rulesets/i.test(sql)) {
        const version = Number(params[1]);
        state.rulesets.set(version, {
          rulesetVersion: version,
          payloadJson: JSON.parse(String(params[4])),
          acceptedCount: params[5],
          mechanicallyReplayedCount: params[6],
          independentlyVerifiedCount: params[7],
          updatedAt: params[10] ?? params[8],
        });
        return [];
      }
      if (/FROM learning_rulesets/i.test(sql)) {
        const versions = [...state.rulesets.keys()].sort((a, b) => b - a);
        if (!versions.length) return [];
        const row = state.rulesets.get(versions[0]!)!;
        return [row];
      }
      if (/INSERT INTO learning_ruleset_partial_accepts/i.test(sql)) {
        const key = `${params[1]}:${params[2]}`;
        state.partials.set(key, {
          targetRulesetVersion: params[1],
          ruleId: params[2],
          payloadJson: JSON.parse(String(params[6])),
          candidateIndex: params[3],
        });
        return [];
      }
      if (/FROM learning_ruleset_partial_accepts/i.test(sql)) {
        return [...state.partials.values()]
          .filter((p) => p.targetRulesetVersion === params[0])
          .sort((a, b) => Number(a.candidateIndex) - Number(b.candidateIndex));
      }
      if (/DELETE FROM learning_ruleset_partial_accepts/i.test(sql)) {
        for (const [k, v] of state.partials) {
          if (v.targetRulesetVersion === params[0]) state.partials.delete(k);
        }
        return [];
      }
      if (/INSERT INTO flywheel_runs/i.test(sql)) {
        state.runs.push({
          runId: params[1],
          slice: params[2],
          status: params[3],
          startedAt: params[4],
          finishedAt: params[5],
          epoch: params[6],
          sourcesProcessed: params[7],
          candidatesEvaluated: params[8],
          proposalsAccepted: params[9],
          proposalsMechanicallyReplayed: params[10],
          proposalsRejected: params[11],
          errorRateByClassJson: params[12],
          errorMessage: params[14],
        });
        return [];
      }
      if (/FROM flywheel_runs/i.test(sql)) {
        return state.runs.slice().reverse().slice(0, 1);
      }
      if (/INSERT INTO flywheel_alerts/i.test(sql)) {
        state.alerts.push({
          alertId: params[1],
          severity: params[2],
          kind: params[3],
          message: params[4],
          runId: params[5],
          createdAt: params[7],
        });
        return [];
      }
      if (/FROM flywheel_alerts/i.test(sql)) {
        return state.alerts.filter((a) => !a.ackedAt);
      }
      if (/FROM kf_precedent_import_checkpoints/i.test(sql)) {
        return state.checkpoints
          ? [
              {
                cursor: state.checkpoints.afterSourceId ?? "",
                status: state.checkpoints.status ?? "IN_PROGRESS",
                countsJson: state.checkpoints,
                updatedAt: new Date().toISOString(),
              },
            ]
          : [];
      }
      if (/INSERT INTO kf_precedent_import_checkpoints/i.test(sql)) {
        const counts = typeof params[4] === "string" ? JSON.parse(params[4] as string) : params[4];
        state.checkpoints = { ...(counts as object), afterSourceId: params[2], status: params[3] };
        return [];
      }
      if (/COUNT\(\*\)/i.test(sql)) {
        return [{ n: 0 }];
      }
      if (/FROM knowledge_sources/i.test(sql)) {
        return [];
      }
      return [];
    },
  };

  return Object.assign(exec, state);
}

describe("flywheel auth", () => {
  it("fails closed when CRON_SECRET unset or wrong; accepts bearer match", () => {
    const bad = new Request("https://example.com/api/flywheel/cron", {
      headers: { authorization: "Bearer x" },
    });
    expect(assertCronAuthorized(bad, {}).ok).toBe(false);
    expect(assertCronAuthorized(bad, { CRON_SECRET: "secret" }).ok).toBe(false);
    const good = new Request("https://example.com/api/flywheel/cron", {
      headers: { authorization: "Bearer secret" },
    });
    expect(assertCronAuthorized(good, { CRON_SECRET: "secret" }).ok).toBe(true);
  });
});

describe("flywheel lock + ruleset neon", () => {
  it("acquires lock exclusively and stores rulesets/partials in Neon", async () => {
    const ex = memoryExecutor();
    const a = await tryAcquireFlywheelLock(ex, { holderId: "a", ttlMs: 60_000 });
    expect(a).not.toBeNull();
    const b = await tryAcquireFlywheelLock(ex, { holderId: "b", ttlMs: 60_000 });
    expect(b).toBeNull();
    await releaseFlywheelLock(ex, a!);
    expect((await readFlywheelLock(ex)).held).toBe(false);

    const rs = emptyRuleSet(0);
    await saveRulesetToNeon(ex, rs);
    const loaded = await loadLatestRulesetFromNeon(ex);
    expect(loaded.rulesetVersion).toBe(0);
    expect(loaded.authorityStatus).toBe("COMPUTED_NOT_CERTIFIED");

    await appendPartialAcceptToNeon(ex, 1, {
      rule: {
        ruleId: "lr:1",
        version: 0,
        kind: "PHRASE_PATTERN",
        pattern: "Restricted\\s+Payments",
        flags: "i",
        effect: { family: "RESTRICTED_PAYMENTS" },
        provenance: { ledgerErrorIds: ["e"], synthesizedAt: "t", epoch: 1 },
        state: "MECHANICALLY_REPLAYED",
      },
      candidateIndex: 0,
      acceptedAt: "2026-10-14T00:00:00.000Z",
      errorsBefore: 2,
      errorsAfter: 1,
      epoch: 1,
      epochRunId: "r",
    });
    expect(await loadPartialAcceptsFromNeon(ex, 1)).toHaveLength(1);

    const store = createNeonRulesStore(ex);
    const latest = await store.loadLatest();
    expect(latest.rulesetVersion).toBe(0);
  });
});

describe("flywheel slice runner", () => {
  it("skips when locked; writes alert on forced sweep with empty corpus", async () => {
    const ex = memoryExecutor();
    const held = await tryAcquireFlywheelLock(ex, { holderId: "other", ttlMs: 60_000 });
    expect(held).not.toBeNull();

    const skipped = await runFlywheelSlice({
      executor: ex,
      slice: "SWEEP_SOURCES",
      env: { FLYWHEEL_MAX_SOURCES: "2", FLYWHEEL_MAX_CANDIDATES: "5" },
    });
    expect(skipped.status).toBe("SKIPPED_LOCKED");
    expect(ex.runs.some((r) => r.status === "SKIPPED_LOCKED")).toBe(true);

    await releaseFlywheelLock(ex, held!);

    const edgar = await runFlywheelSlice({
      executor: ex,
      slice: "EDGAR_EXPAND",
      env: {}, // no SEC contact
    });
    expect(edgar.status).toBe("SKIPPED_CONFIG");

    const status = await getFlywheelStatus(ex);
    expect(status.paidInferenceUsed).toBe(false);
    expect(status.authorityStatus).toBe("COMPUTED_NOT_CERTIFIED");
    expect(status.adjudicationHonesty.acceptMeans).toBe("MECHANICALLY_REPLAYED");
    expect(status.adjudicationHonesty.productionTreatsMechanicallyReplayedAsVerified).toBe(false);
    expect(status.latestRun?.slice).toBeTruthy();
  });
});
