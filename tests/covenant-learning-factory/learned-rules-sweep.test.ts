/**
 * Offline tests for executable learned-rules + clf:sweep (fake HTTPS client).
 */

import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { categorize } from "@/lib/contract-model/covenant-computation/baskets";
import { extractBasketClauses } from "@/lib/contract-model/covenant-computation/extract-baskets";
import { applyCategoryHints } from "@/lib/covenant-learning-factory/learned-rules/apply";
import {
  bumpRuleSet,
  loadLatestLearnedRules,
  writeLearnedRules,
} from "@/lib/covenant-learning-factory/learned-rules/load";
import { loadPartialAccepts, partialJsonlPath } from "@/lib/covenant-learning-factory/learned-rules/partial";
import {
  evaluateReplayGate,
  measureReplaySource,
} from "@/lib/covenant-learning-factory/learned-rules/replay-gate";
import { synthesizeCandidateRules } from "@/lib/covenant-learning-factory/learned-rules/synthesize";
import { emptyRuleSet, type LearnedRule, type LearnedRuleSet } from "@/lib/covenant-learning-factory/learned-rules/types";
import { buildComputationPackage } from "@/lib/covenant-learning-factory/sweep/build-package";
import { checkGrowerConsistency, selfCheckComputation } from "@/lib/covenant-learning-factory/sweep/self-check";
import { runCovenantLearningSweep } from "@/lib/covenant-learning-factory/sweep/sweep-runner";
import type { NeonHttpsExecutor } from "@/lib/covenant-learning-factory/store/neon-transport";
import { runCovenantComputation } from "@/lib/contract-model/covenant-computation";

const SAMPLE_TEXT = `
"Permitted Debt" means Indebtedness of the Issuer consisting of:
(1) Indebtedness of the Issuer in an aggregate principal amount not to exceed the greater of $50,000,000 and 5.0% of Total Assets;
(2) Indebtedness under the Available Amount;
(3) Indebtedness so long as the Consolidated Total Leverage Ratio is no greater than 4.00 to 1.00;

Section 4.09 Limitation on Indebtedness.
The Issuer shall not Incur any Indebtedness except Permitted Debt.
`;

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

function fakeExecutor(opts?: {
  state?: FakeNeonState;
  /** Use documents the regional extractor misses so DISCOVERY_GAP → ACCEPT path fires. */
  missable?: boolean;
}): NeonHttpsExecutor & { state: FakeNeonState } {
  const state: FakeNeonState = opts?.state ?? {
    checkpoint: null,
    proposals: [],
    evaluations: [],
  };
  const missable = Boolean(opts?.missable);
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
  const executor = {
    state,
    async execute(sql: string, params: unknown[] = []) {
      if (/FROM knowledge_sources/i.test(sql)) {
        const after = String(params[0] ?? "");
        const limit = Number(params[1] ?? 10);
        return sources.filter((s) => s.sourceId > after).slice(0, limit) as unknown as Record<string, unknown>[];
      }
      if (/FROM document_byte_objects/i.test(sql)) {
        return [{ text: missable ? MISSED_RP_DOC : SAMPLE_TEXT }] as unknown as Record<string, unknown>[];
      }
      if (/FROM kf_precedent_covenant_candidates/i.test(sql)) {
        const sourceId = String(params[0]);
        if (missable) {
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
        return [
          {
            candidateId: `${sourceId}-c1`,
            sourceId,
            familiesJson: ["DEBT_INCURRENCE"],
            excerpt: "greater of $50,000,000 and 5.0% of Total Assets",
            payloadJson: { sectionRef: "6.01(1)", formulaHint: "GROWER" },
          },
          {
            candidateId: `${sourceId}-c2`,
            sourceId,
            familiesJson: ["DEBT_INCURRENCE"],
            excerpt: "Indebtedness under the Available Amount",
            payloadJson: {},
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
          autoApply: params[7],
          evidenceJson: params[8],
        });
        return [];
      }
      if (/INSERT INTO learning_evaluation_outcomes/i.test(sql)) {
        state.evaluations.push({ evaluationId: params[1], notes: params[14] });
        return [];
      }
      return [] as Record<string, unknown>[];
    },
  };
  return executor;
}

describe("learned-rules apply + synthesize", () => {
  it("CATEGORY_HINT overrides engine classify for matching text", () => {
    const ruleset: LearnedRuleSet = {
      ...emptyRuleSet(1),
      rules: [
        {
          ruleId: "lr:test-grower",
          version: 1,
          kind: "CATEGORY_HINT",
          pattern: "greater of",
          flags: "i",
          effect: { category: "GROWER_GREATER_OF" },
          provenance: { ledgerErrorIds: ["e1"], synthesizedAt: "2026-10-13T00:00:00.000Z", epoch: 1 },
          state: "ACCEPTED",
        },
      ],
    };
    const hint = applyCategoryHints("the greater of $1 and 2% of assets", ruleset);
    expect(hint?.category).toBe("GROWER_GREATER_OF");
    expect(categorize("the greater of $1 and 2% of assets", ruleset)).toBe("GROWER_GREATER_OF");
  });

  it("synthesizes executable rules from clustered ledger signals", () => {
    const rules = synthesizeCandidateRules({
      epoch: 1,
      now: "2026-10-13T00:00:00.000Z",
      signals: [
        {
          errorId: "e1",
          class: "UNSUPPORTED_SEMANTICS",
          message: 'numeric clause classified UNKNOWN',
          evidence: { citationExcerpt: "shall not exceed the greater of $25,000,000 and 4.0% of Total Assets" },
        },
        {
          errorId: "e2",
          class: "UNSUPPORTED_SEMANTICS",
          message: 'numeric clause classified UNKNOWN',
          evidence: { citationExcerpt: "greater of $10,000,000 and 3% of Total Assets" },
        },
      ],
    });
    expect(rules.length).toBeGreaterThan(0);
    expect(rules.every((r) => r.state === "PROPOSED")).toBe(true);
    expect(rules.some((r) => r.kind === "GROWER_FORM" || r.kind === "CATEGORY_HINT")).toBe(true);
    expect(rules[0]!.provenance.ledgerErrorIds.length).toBeGreaterThan(0);
  });

  it("writes versioned learned-rules files", () => {
    const dir = mkdtempSync(join(tmpdir(), "clf-rules-"));
    try {
      const v0 = emptyRuleSet(0);
      writeLearnedRules(v0, dir);
      const accepted: LearnedRule = {
        ruleId: "lr:accept-1",
        version: 0,
        kind: "CATEGORY_HINT",
        pattern: "available amount",
        flags: "i",
        effect: { category: "BUILDER_AVAILABLE_AMOUNT" },
        provenance: { ledgerErrorIds: ["e9"], synthesizedAt: "2026-10-13T00:00:00.000Z", epoch: 1 },
        state: "PROPOSED",
      };
      const next = bumpRuleSet({ previous: v0, accepted: [accepted], rejectedIds: [], epoch: 1 });
      writeLearnedRules(next, dir);
      const loaded = loadLatestLearnedRules(dir);
      expect(loaded.rulesetVersion).toBe(1);
      expect(loaded.rules.some((r) => r.ruleId === "lr:accept-1" && r.state === "ACCEPTED")).toBe(true);
      expect(loaded.authorityStatus).toBe("COMPUTED_NOT_CERTIFIED");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("self-check + grower", () => {
  it("checkGrowerConsistency enforces max(fixed, pct·base)", () => {
    expect(checkGrowerConsistency({ fixed: "100", percent: "10", base: "2000", got: "200" })).toBeNull();
    expect(checkGrowerConsistency({ fixed: "100", percent: "10", base: "2000", got: "50" })).toMatch(/mismatch/);
  });

  it("self-check flags UNKNOWN numeric baskets", () => {
    const pkg = buildComputationPackage({
      source: { sourceId: "s1", issuerCik: "1" },
      documentText: SAMPLE_TEXT,
      candidates: [],
    });
    const result = runCovenantComputation(pkg);
    // Force an UNKNOWN basket into the result view via self-check on a synthetic result
    const errors = selfCheckComputation({
      packageKey: pkg.packageKey,
      runId: "r1",
      sourceId: "s1",
      result: {
        ...result,
        baskets: [
          ...result.baskets,
          {
            stableKey: "x-unknown",
            sectionRef: "x",
            covenantFamily: "DEBT",
            sourceDocumentId: "s1",
            citationExcerpt: "Indebtedness not to exceed $9,999,999 under weird form",
            category: "UNKNOWN",
            scope: "GENERAL",
            capFormula: null,
            formulaKind: null,
            capStatus: "UNKNOWN",
            capCanonical: null,
            capCurrency: null,
            capKind: "NONE",
            dollarRoomStatus: "UNKNOWN",
            remainingStatus: "UNKNOWN",
            missingInputs: [],
            gateOpen: null,
            reasons: [],
            certification: "COMPUTED_NOT_CERTIFIED",
            note: "",
          },
        ],
      },
      candidates: [
        {
          candidateId: "c-miss",
          sourceId: "s1",
          family: "RESTRICTED_PAYMENTS",
          excerpt: "Restricted Payments under the builder basket shall not exceed",
        },
      ],
      definitions: [],
      conditions: [],
      now: "2026-10-13T00:00:00.000Z",
    });
    expect(errors.some((e) => e.class === "UNSUPPORTED_SEMANTICS")).toBe(true);
    expect(errors.every((e) => e.evidence?.sourceId === "s1")).toBe(true);
  });
});

describe("replay gate — DISCOVERY_GAP learning", () => {
  const missedDoc = `
Article IX Miscellaneous.
The Borrower may make distributions to the parent under the builder basket for Restricted Payments not to exceed $5,000,000 in any fiscal year when no Event of Default exists.
`;
  const missedExcerpt =
    "distributions to the parent under the builder basket for Restricted Payments not to exceed $5,000,000";

  it("synthesized PHRASE_PATTERN for a missed candidate drops DISCOVERY_GAP in replay", () => {
    const source = { sourceId: "src-miss", issuerCik: "0001", companyId: "co" };
    const candidates = [
      {
        candidateId: "cand-rp-1",
        sourceId: source.sourceId,
        family: "RESTRICTED_PAYMENTS",
        sectionRef: "Article IX",
        excerpt: missedExcerpt,
      },
    ];
    const baseline = emptyRuleSet(0);
    const pkg = buildComputationPackage({
      source,
      documentText: missedDoc,
      candidates: candidates.map((c) => ({
        candidateId: c.candidateId,
        sourceId: c.sourceId,
        family: c.family,
        sectionRef: c.sectionRef,
        excerpt: c.excerpt,
      })),
      rules: baseline,
    });
    // Regional extractor misses this text (no Permitted-* / §4.xx heading).
    expect(extractBasketClauses({ documentId: source.sourceId, text: missedDoc }).length).toBe(0);

    const replaySource = {
      sourceId: source.sourceId,
      packageKey: pkg.packageKey,
      pkg,
      documentText: missedDoc,
      candidates,
      source,
      baselineErrorCount: 0,
    };
    replaySource.baselineErrorCount = measureReplaySource(replaySource, baseline);
    expect(replaySource.baselineErrorCount).toBeGreaterThan(0);

    const synthesized = synthesizeCandidateRules({
      epoch: 1,
      now: "2026-10-13T00:00:00.000Z",
      signals: [
        {
          errorId: "err-discovery-1",
          class: "DISCOVERY_GAP",
          message: `precedent candidate cand-rp-1 family=RESTRICTED_PAYMENTS not reflected in computed baskets`,
          evidence: {
            candidateId: "cand-rp-1",
            expectedFamily: "RESTRICTED_PAYMENTS",
            citationExcerpt: missedExcerpt,
            sectionRef: "Article IX",
            sectionTitle: "Article IX",
          },
        },
      ],
    });
    expect(synthesized.some((r) => r.kind === "PHRASE_PATTERN")).toBe(true);
    const phraseRule = synthesized.find((r) => r.kind === "PHRASE_PATTERN")!;

    const gate = evaluateReplayGate({
      baseline,
      candidate: phraseRule,
      sources: [replaySource],
      goldens: [
        {
          name: "uncertified",
          run: (rs) => {
            const rebuilt = buildComputationPackage({
              source,
              documentText: missedDoc,
              candidates: candidates.map((c) => ({
                candidateId: c.candidateId,
                sourceId: c.sourceId,
                family: c.family,
                sectionRef: c.sectionRef,
                excerpt: c.excerpt,
              })),
              rules: rs,
            });
            return runCovenantComputation(rebuilt, { rules: rs }).certification === "COMPUTED_NOT_CERTIFIED";
          },
        },
      ],
    });

    expect(gate.goldenOk).toBe(true);
    expect(gate.accepted).toBe(true);
    expect(gate.errorsAfter).toBeLessThan(gate.errorsBefore);

    // Extractor actually loads the accepted rule and captures the missed span.
    const captured = extractBasketClauses({
      documentId: source.sourceId,
      text: missedDoc,
      rules: {
        ...baseline,
        rules: [{ ...phraseRule, state: "ACCEPTED" }],
      },
    });
    expect(captured.some((c) => /Restricted Payments/i.test(c.operativeText))).toBe(true);
  });
});

describe("clf:sweep end-to-end (fake HTTPS)", () => {
  it("processes sources, synthesizes proposals, writes ruleset on accept path", async () => {
    const dir = mkdtempSync(join(tmpdir(), "clf-sweep-"));
    writeLearnedRules(emptyRuleSet(0), dir);
    try {
      const result = await runCovenantLearningSweep({
        executor: fakeExecutor(),
        batchSize: 10,
        maxSources: 2,
        maxEpochs: 2,
        resume: false,
        dryRun: false,
        rulesDir: dir,
        codeSha: "testsha",
        now: () => "2026-10-13T12:00:00.000Z",
        goldenChecks: [
          {
            name: "uncertified",
            run: () => true,
          },
        ],
      });
      expect(result.totalSources).toBeGreaterThanOrEqual(2);
      expect(result.epochs.length).toBeGreaterThanOrEqual(1);
      expect(result.epochs[0]!.sourcesProcessed).toBe(2);
      expect(result.finalRulesetVersion).toBeGreaterThanOrEqual(0);
      // Extractor loads rules at runtime
      const clauses = extractBasketClauses({
        documentId: "d",
        text: SAMPLE_TEXT,
        rules: loadLatestLearnedRules(dir),
      });
      expect(clauses.length).toBeGreaterThan(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("crash mid-epoch persists accepts; resume continues from candidate index (not 0 sources)", async () => {
    const dir = mkdtempSync(join(tmpdir(), "clf-crash-"));
    writeLearnedRules(emptyRuleSet(0), dir);
    const neon = fakeExecutor({ missable: true });
    const goldenChecks = [{ name: "uncertified", run: () => true }];
    try {
      await expect(
        runCovenantLearningSweep({
          executor: neon,
          batchSize: 10,
          maxSources: 2,
          maxEpochs: 1,
          resume: false,
          dryRun: false,
          rulesDir: dir,
          codeSha: "crashsha",
          now: () => "2026-10-14T00:00:00.000Z",
          goldenChecks,
          crashAfterAccepts: 1,
        }),
      ).rejects.toThrow(/simulated crash/);

      // Immediate durable writes survived the kill.
      expect(existsSync(partialJsonlPath(1, dir))).toBe(true);
      const partial = loadPartialAccepts(1, dir);
      expect(partial.length).toBeGreaterThanOrEqual(1);
      expect(neon.state.proposals.some((p) => p.state === "ACCEPTED")).toBe(true);
      expect(
        neon.state.evaluations.some((e) => String(e.evaluationId).startsWith("eval:accept:")),
      ).toBe(true);
      expect(neon.state.checkpoint?.phase).toBe("proposals");
      expect(Number(neon.state.checkpoint?.candidateIndex)).toBeGreaterThan(0);
      // Only v0.json finalized so far — accepts live in partial.
      expect(existsSync(join(dir, "v1.json"))).toBe(false);

      // Simulate the live bug: source cursor past the end.
      neon.state.checkpoint = {
        ...neon.state.checkpoint,
        afterSourceId: "src-beta",
        phase: "proposals",
        sourcesComplete: true,
        status: "PROPOSALS",
      };

      const resumed = await runCovenantLearningSweep({
        executor: neon,
        batchSize: 10,
        maxSources: 2,
        maxEpochs: 1,
        resume: true,
        dryRun: false,
        rulesDir: dir,
        codeSha: "crashsha",
        now: () => "2026-10-14T00:01:00.000Z",
        goldenChecks,
      });

      // Must not strand at 0 sources.
      expect(resumed.epochs.some((e) => e.sourcesProcessed > 0 || e.proposalsAccepted > 0)).toBe(true);
      expect(loadLatestLearnedRules(dir).rulesetVersion).toBeGreaterThanOrEqual(1);
      expect(loadLatestLearnedRules(dir).rules.some((r) => r.state === "ACCEPTED")).toBe(true);
      // Partial cleared after finalize.
      expect(loadPartialAccepts(1, dir)).toHaveLength(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("completed source cursor with no phase promotes to proposals instead of idle", async () => {
    const dir = mkdtempSync(join(tmpdir(), "clf-cursor-"));
    writeLearnedRules(emptyRuleSet(0), dir);
    const neon = fakeExecutor({ missable: true });
    // Legacy checkpoint: last source id, IN_PROGRESS, no phase — the live failure mode.
    neon.state.checkpoint = {
      afterSourceId: "src-beta",
      epoch: 1,
      phase: "sources",
      sourcesComplete: false,
      candidateIndex: 0,
      status: "IN_PROGRESS",
      nextRulesetVersion: 1,
      epochRunId: "",
      updatedAt: "2026-10-14T00:00:00.000Z",
    };
    try {
      const result = await runCovenantLearningSweep({
        executor: neon,
        batchSize: 10,
        maxSources: 2,
        maxEpochs: 1,
        resume: true,
        dryRun: false,
        rulesDir: dir,
        codeSha: "cursor",
        now: () => "2026-10-14T00:02:00.000Z",
        goldenChecks: [{ name: "uncertified", run: () => true }],
      });
      // Must rebuild sources (not idle at 0) despite cursor past last sourceId.
      expect(result.totalSources).toBeGreaterThan(0);
      expect(result.epochs[0]?.sourcesProcessed ?? 0).toBeGreaterThan(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
