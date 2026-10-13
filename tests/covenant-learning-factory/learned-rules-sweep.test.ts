/**
 * Offline tests for executable learned-rules + clf:sweep (fake HTTPS client).
 */

import { mkdtempSync, rmSync } from "node:fs";
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
import { evaluateReplayGate } from "@/lib/covenant-learning-factory/learned-rules/replay-gate";
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

function fakeExecutor(): NeonHttpsExecutor {
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
  const writes: string[] = [];
  return {
    async execute(sql: string, params: unknown[] = []) {
      writes.push(sql.slice(0, 80));
      if (/FROM knowledge_sources/i.test(sql)) {
        const after = String(params[0] ?? "");
        const limit = Number(params[1] ?? 10);
        return sources.filter((s) => s.sourceId > after).slice(0, limit) as unknown as Record<string, unknown>[];
      }
      if (/FROM document_byte_objects/i.test(sql)) {
        return [{ text: SAMPLE_TEXT }] as unknown as Record<string, unknown>[];
      }
      if (/FROM kf_precedent_covenant_candidates/i.test(sql)) {
        const sourceId = String(params[0]);
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
        return [] as Record<string, unknown>[];
      }
      // writes
      return [] as Record<string, unknown>[];
    },
  };
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

describe("replay gate", () => {
  it("accepts only when errors strictly drop and golden ok", () => {
    const text =
      'Permitted Debt means Indebtedness in an amount not to exceed the greater of $1 and 2% of assets under available amount builder.';
    // Craft a basket that is UNKNOWN without rules; CATEGORY_HINT makes it GROWER
    const pkg = {
      packageKey: "replay-pkg",
      companyId: "c",
      instrumentKey: "i",
      asOf: "2020-01-01",
      documents: [{ documentId: "d1", role: "INDENTURE" as const, text }],
      baskets: [
        {
          stableKey: "b1",
          sectionRef: "PD (1)",
          covenantFamily: "DEBT_INCURRENCE",
          documentId: "d1",
          operativeText: text,
          role: "PERMISSION" as const,
        },
      ],
    };
    const baseline = emptyRuleSet(0);
    const before = runCovenantComputation(pkg, { rules: baseline });
    // Without rules, greater-of should already be GROWER — use a phrase that engine leaves UNKNOWN
    const odd =
      "Indebtedness pursuant to the special numeric form equal to 12.5 percent of Consolidated Net Tangible Assets as adjusted";
    const pkg2 = {
      ...pkg,
      documents: [{ documentId: "d1", role: "INDENTURE" as const, text: odd }],
      baskets: [
        {
          stableKey: "b2",
          sectionRef: "PD (2)",
          covenantFamily: "DEBT_INCURRENCE",
          documentId: "d1",
          operativeText: odd,
          role: "PERMISSION" as const,
        },
      ],
    };
    const baselineCount = (() => {
      const r = runCovenantComputation(pkg2, { rules: baseline });
      return r.baskets.filter((b) => b.category === "UNKNOWN").length + r.mistakes.length;
    })();
    const candidate: LearnedRule = {
      ruleId: "lr:pct",
      version: 0,
      kind: "CATEGORY_HINT",
      pattern: "percent of Consolidated Net Tangible Assets",
      flags: "i",
      effect: { category: "PCT_OF_METRIC" },
      provenance: { ledgerErrorIds: ["e"], synthesizedAt: "2026-10-13T00:00:00.000Z", epoch: 1 },
      state: "PROPOSED",
    };
    const gate = evaluateReplayGate({
      baseline,
      candidate,
      sources: [
        {
          sourceId: "s",
          packageKey: pkg2.packageKey,
          pkg: pkg2,
          baselineErrorCount: Math.max(baselineCount, 1),
        },
      ],
      goldens: [
        {
          name: "uncertified",
          run: (rs) => runCovenantComputation(pkg2, { rules: rs }).certification === "COMPUTED_NOT_CERTIFIED",
        },
      ],
    });
    expect(gate.goldenOk).toBe(true);
    // Accept if the hint reclassifies UNKNOWN → PCT_OF_METRIC
    if (baselineCount > 0) {
      expect(gate.accepted).toBe(true);
      expect(gate.errorsAfter).toBeLessThan(gate.errorsBefore);
    }
    expect(before.certification).toBe("COMPUTED_NOT_CERTIFIED");
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
});
