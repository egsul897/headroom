/**
 * CLI clf:sweep must wire createNeonRulesStore so ACCEPTs persist and resume
 * reloads them (not accepts=0). Mock store only — no live Neon.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { emptyRuleSet, type LearnedRuleSet } from "@/lib/covenant-learning-factory/learned-rules/types";
import type { PartialAcceptRecord } from "@/lib/covenant-learning-factory/learned-rules/partial";
import {
  runCovenantLearningSweep,
  type SweepRulesStore,
} from "@/lib/covenant-learning-factory/sweep/sweep-runner";
import type { NeonHttpsExecutor } from "@/lib/covenant-learning-factory/store/neon-transport";

const MISSED_RP_DOC = `
Article IX Miscellaneous.
The Borrower may make distributions to the parent under the builder basket for Restricted Payments not to exceed $5,000,000 in any fiscal year when no Event of Default exists.
`;
const MISSED_RP_EXCERPT =
  "distributions to the parent under the builder basket for Restricted Payments not to exceed $5,000,000";

interface FakeNeonState {
  checkpoint: Record<string, unknown> | null;
  proposals: Array<Record<string, unknown>>;
  evaluations: Array<Record<string, unknown>>;
}

/** In-memory stand-in for createNeonRulesStore / learning_ruleset_partial_accepts. */
function mockNeonRulesStore(seed?: LearnedRuleSet): SweepRulesStore & {
  partials: Map<number, PartialAcceptRecord[]>;
  saved: LearnedRuleSet[];
} {
  let latest = seed ?? emptyRuleSet(0);
  const partials = new Map<number, PartialAcceptRecord[]>();
  const saved: LearnedRuleSet[] = [];
  return {
    partials,
    saved,
    loadLatest: () => latest,
    save: (ruleset) => {
      latest = ruleset;
      saved.push(ruleset);
    },
    appendPartial: (version, record) => {
      const list = partials.get(version) ?? [];
      const idx = list.findIndex((r) => r.rule.ruleId === record.rule.ruleId);
      if (idx >= 0) list[idx] = record;
      else list.push(record);
      partials.set(version, list);
    },
    loadPartials: (version) => [...(partials.get(version) ?? [])],
    clearPartials: (version) => {
      partials.delete(version);
    },
  };
}

function fakeExecutor(state: FakeNeonState): NeonHttpsExecutor & { state: FakeNeonState } {
  const sources = [
    {
      sourceId: "src-alpha",
      companyId: "co-a",
      issuerCik: "0001111111",
      issuerTicker: "AAA",
      documentTitle: "Alpha Indenture",
      storageRef: null,
      originalBytesHash: "hash-alpha",
    },
    {
      sourceId: "src-beta",
      companyId: "co-b",
      issuerCik: "0002222222",
      issuerTicker: "BBB",
      documentTitle: "Beta CA",
      storageRef: null,
      originalBytesHash: "hash-beta",
    },
  ];
  return {
    state,
    async execute(sql: string, params: unknown[] = []) {
      if (/FROM knowledge_sources/i.test(sql)) {
        const after = String(params[0] ?? "");
        const limit = Number(params[1] ?? 10);
        return sources.filter((s) => s.sourceId > after).slice(0, limit) as unknown as Record<
          string,
          unknown
        >[];
      }
      if (/FROM document_byte_objects/i.test(sql)) {
        return [{ text: MISSED_RP_DOC }] as unknown as Record<string, unknown>[];
      }
      if (/FROM kf_precedent_covenant_candidates/i.test(sql)) {
        const sourceId = String(params[0]);
        return [
          {
            candidateId: `${sourceId}-rp`,
            sourceId,
            familiesJson: ["RESTRICTED_PAYMENTS"],
            excerpt: MISSED_RP_EXCERPT,
            payloadJson: { sectionRef: "Article IX" },
          },
        ] as unknown as Record<string, unknown>[];
      }
      if (/FROM kf_precedent_definitions/i.test(sql)) {
        return [
          {
            id: "d1",
            sourceId: params[0],
            term: "Total Assets",
            excerpt: "Total Assets means the total assets of the Issuer",
          },
        ] as unknown as Record<string, unknown>[];
      }
      if (/FROM kf_precedent_conditions_exceptions/i.test(sql)) {
        return [] as Record<string, unknown>[];
      }
      if (/FROM kf_precedent_import_checkpoints/i.test(sql)) {
        return state.checkpoint
          ? [
              {
                cursor: state.checkpoint.afterSourceId ?? "",
                status: state.checkpoint.status ?? "IN_PROGRESS",
                countsJson: state.checkpoint,
                updatedAt: state.checkpoint.updatedAt ?? new Date().toISOString(),
              },
            ]
          : [];
      }
      if (/INSERT INTO kf_precedent_import_checkpoints/i.test(sql)) {
        const counts = typeof params[4] === "string" ? JSON.parse(params[4] as string) : params[4];
        state.checkpoint = {
          ...(counts as Record<string, unknown>),
          afterSourceId: params[2],
          status: params[3],
        };
        return [];
      }
      if (/INSERT INTO learning_improvement_proposals/i.test(sql)) {
        state.proposals.push({
          proposalId: params[1],
          state: params[9],
          adjudicationStatus: params[10],
        });
        return [];
      }
      if (/INSERT INTO learning_evaluation_outcomes/i.test(sql)) {
        state.evaluations.push({ evaluationId: params[1] });
        return [];
      }
      return [] as Record<string, unknown>[];
    },
  };
}

describe("clf:sweep Neon rules store wire", () => {
  it("CLI script wires createNeonRulesStore into runCovenantLearningSweep", () => {
    const src = readFileSync(
      join(process.cwd(), "scripts/covenant-learning-factory/sweep.ts"),
      "utf8",
    );
    expect(src).toContain('from "../../lib/flywheel/ruleset-neon"');
    expect(src).toContain("createNeonRulesStore");
    expect(src).toContain("rulesStore");
    expect(src).toMatch(/neonRulesStore:\s*!dryRun/);
    expect(src).toMatch(/createNeonRulesStore\(executor/);
  });

  it("ACCEPT persists via mock Neon store; resume reloads partials (not accepts=0)", async () => {
    const neonState: FakeNeonState = {
      checkpoint: null,
      proposals: [],
      evaluations: [],
    };
    const neon = fakeExecutor(neonState);
    const store = mockNeonRulesStore(emptyRuleSet(0));
    const goldenChecks = [{ name: "uncertified", run: () => true }];
    const logs: string[] = [];

    await expect(
      runCovenantLearningSweep({
        executor: neon,
        batchSize: 10,
        maxSources: 2,
        maxEpochs: 1,
        resume: false,
        dryRun: false,
        rulesStore: store,
        codeSha: "neon-store-crash",
        now: () => "2026-10-14T02:00:00.000Z",
        goldenChecks,
        crashAfterAccepts: 1,
        log: (line) => logs.push(line),
      }),
    ).rejects.toThrow(/simulated crash/);

    const persisted = await Promise.resolve(store.loadPartials(1));
    expect(persisted.length).toBeGreaterThanOrEqual(1);
    expect(persisted[0]!.rule.state).toBe("MECHANICALLY_REPLAYED");
    expect(persisted[0]!.rule.state).not.toBe("INDEPENDENTLY_VERIFIED");
    expect(neon.state.checkpoint?.phase).toBe("proposals");
    expect(Number(neon.state.checkpoint?.candidateIndex)).toBeGreaterThan(0);

    // Resume with the same Neon-backed store — must not start at partial accepts=0.
    neon.state.checkpoint = {
      ...neon.state.checkpoint,
      afterSourceId: "src-beta",
      phase: "proposals",
      sourcesComplete: true,
      status: "PROPOSALS",
    };

    const resumeLogs: string[] = [];
    const resumed = await runCovenantLearningSweep({
      executor: neon,
      batchSize: 10,
      maxSources: 2,
      maxEpochs: 1,
      resume: true,
      dryRun: false,
      rulesStore: store,
      codeSha: "neon-store-resume",
      now: () => "2026-10-14T02:01:00.000Z",
      goldenChecks,
      log: (line) => resumeLogs.push(line),
    });

    expect(resumeLogs.some((l) => /partial accepts=0\b/.test(l))).toBe(false);
    expect(resumeLogs.some((l) => /partial accepts=[1-9]/.test(l))).toBe(true);
    expect(
      resumed.epochs.some((e) => (e.proposalsAccepted ?? 0) > 0 || (e.sourcesProcessed ?? 0) > 0),
    ).toBe(true);
    // Finalize clears Neon partials for that target version.
    expect(await Promise.resolve(store.loadPartials(1))).toHaveLength(0);
    expect(store.saved.some((r) => r.rulesetVersion >= 1)).toBe(true);
    expect(
      store.saved.some((r) =>
        r.rules.some((rule) => rule.state === "MECHANICALLY_REPLAYED"),
      ),
    ).toBe(true);
  });
});
