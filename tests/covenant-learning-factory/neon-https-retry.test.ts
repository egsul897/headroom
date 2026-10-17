/**
 * Bounded Neon HTTPS retry: transient fetch/network errors retry; auth does not.
 * Mock flaky store + executor — no live DB.
 */
import { describe, expect, it, vi } from "vitest";
import {
  isTransientNeonHttpsError,
  withNeonHttpsRetry,
} from "../../lib/covenant-learning-factory/store/neon-https-retry";
import {
  createNeonHttpsExecutor,
  type NeonFactory,
} from "../../lib/covenant-learning-factory/store/neon-transport";
import type { PartialAcceptRecord } from "../../lib/covenant-learning-factory/learned-rules/partial";
import type { SweepRulesStore } from "../../lib/covenant-learning-factory/sweep/sweep-runner";
import { emptyRuleSet } from "../../lib/covenant-learning-factory/learned-rules/types";

describe("isTransientNeonHttpsError", () => {
  it("treats fetch/network/connect failures as transient", () => {
    expect(isTransientNeonHttpsError(new Error("fetch failed"))).toBe(true);
    expect(isTransientNeonHttpsError(new Error("Error connecting to database: fetch failed"))).toBe(
      true,
    );
    expect(isTransientNeonHttpsError(new Error("ECONNRESET"))).toBe(true);
    expect(isTransientNeonHttpsError(new Error("socket hang up"))).toBe(true);
  });

  it("never retries auth failures", () => {
    expect(
      isTransientNeonHttpsError(
        new Error("password authentication failed for user 'neondb_owner'"),
      ),
    ).toBe(false);
    expect(isTransientNeonHttpsError(new Error("28P01 authentication failed"))).toBe(false);
    expect(isTransientNeonHttpsError(new Error("P1010: User was denied access"))).toBe(false);
  });
});

describe("withNeonHttpsRetry", () => {
  it("retries a mocked flaky rules store appendPartial then succeeds", async () => {
    const partials: PartialAcceptRecord[] = [];
    let calls = 0;
    const flakyStore: SweepRulesStore = {
      loadLatest: async () => emptyRuleSet(0),
      save: async () => undefined,
      appendPartial: async (_version, record): Promise<void> => {
        calls += 1;
        if (calls < 3) throw new Error("Error connecting to database: fetch failed");
        partials.push(record);
      },
      loadPartials: async () => [...partials],
      clearPartials: async () => {
        partials.length = 0;
      },
    };

    const sleeps: number[] = [];
    const retries: number[] = [];
    await withNeonHttpsRetry(
      () =>
        Promise.resolve(flakyStore.appendPartial(1, {
          rule: {
            ruleId: "lr:retry-1",
            version: 0,
            kind: "PHRASE_PATTERN",
            pattern: "Restricted\\s+Payments",
            flags: "i",
            effect: { family: "RESTRICTED_PAYMENTS" },
            provenance: { ledgerErrorIds: ["e1"], synthesizedAt: "t", epoch: 1 },
            state: "MECHANICALLY_REPLAYED",
          },
          candidateIndex: 0,
          acceptedAt: "2026-10-14T03:00:00.000Z",
          errorsBefore: 2,
          errorsAfter: 1,
          epoch: 1,
          epochRunId: "run",
        })),
      {
        maxAttempts: 5,
        baseDelayMs: 10,
        sleep: async (ms) => {
          sleeps.push(ms);
        },
        onRetry: ({ attempt }) => retries.push(attempt),
      },
    );

    expect(calls).toBe(3);
    expect(retries).toEqual([1, 2]);
    expect(sleeps).toEqual([10, 20]); // exponential: 10 * 2^(attempt-1)
    expect(partials).toHaveLength(1);
    expect(await flakyStore.loadPartials(1)).toHaveLength(1);
  });

  it("does not retry auth errors on the flaky store", async () => {
    let calls = 0;
    const flakyStore: SweepRulesStore = {
      loadLatest: async () => emptyRuleSet(0),
      save: async () => undefined,
      appendPartial: async (): Promise<void> => {
        calls += 1;
        throw new Error("password authentication failed for user 'neondb_owner'");
      },
      loadPartials: async () => [],
      clearPartials: async () => undefined,
    };
    await expect(
      withNeonHttpsRetry(() => Promise.resolve(flakyStore.appendPartial(1, {} as PartialAcceptRecord)), {
        maxAttempts: 5,
        sleep: async () => undefined,
      }),
    ).rejects.toThrow(/password authentication failed/);
    expect(calls).toBe(1);
  });
});

describe("createNeonHttpsExecutor retry", () => {
  it("retries transient neonFn failures up to success within 5 attempts", async () => {
    let calls = 0;
    const neonMock = vi.fn(() => {
      const fn = Object.assign(
        async (_statement: string, _params?: unknown[]) => {
          calls += 1;
          if (calls < 4) throw new Error("fetch failed");
          return [{ ok: 1 }];
        },
        { transaction: async () => [] },
      );
      return fn;
    });

    const ex = await createNeonHttpsExecutor(
      "postgresql://u:secret@example.invalid/db",
      neonMock as unknown as NeonFactory,
      { maxAttempts: 5, baseDelayMs: 1, sleep: async () => undefined },
    );
    const rows = await ex.execute("SELECT 1");
    expect(rows).toEqual([{ ok: 1 }]);
    expect(calls).toBe(4);
  });

  it("surfaces auth failure without retrying", async () => {
    let calls = 0;
    const neonMock = vi.fn(() => {
      const fn = Object.assign(
        async () => {
          calls += 1;
          throw new Error("password authentication failed for user 'neondb_owner'");
        },
        { transaction: async () => [] },
      );
      return fn;
    });
    const ex = await createNeonHttpsExecutor(
      "postgresql://u:secret@example.invalid/db",
      neonMock as unknown as NeonFactory,
      { maxAttempts: 5, sleep: async () => undefined },
    );
    await expect(ex.execute("SELECT 1")).rejects.toThrow(/password authentication failed/);
    expect(calls).toBe(1);
  });
});
