#!/usr/bin/env tsx
/**
 * Decompose COVERAGE_GAP by the emitter that records it.
 *
 * Sweep path (clf:sweep) calls selfCheckComputation only. It does not call
 * evaluateCompileIndependently, so the doc-level high-refusal COVERAGE_GAP
 * in evaluation.ts is not part of the Neon sweep total.
 *
 *   NEEDS_INPUT: omission …           self-check.ts — zero baskets bound
 *   NEEDS_INPUT: condition/exception  self-check.ts — exception/proviso/carve-out
 *                                     excerpt whose first 30 characters are
 *                                     missing from every citation
 *   refused executable with zero …    evaluation.ts — compile units, not the sweep
 *
 * capStatus NEEDS_INPUT (missing EBITDA, ledger usage, unbound metric) is
 * refusedExecutableUnits. It is not a COVERAGE_GAP.
 *
 * Offline (repo fixtures, no database):
 *   npx tsx scripts/covenant-learning-factory/decompose-coverage-gaps.ts
 *
 * Neon read-only dry run (no writes). DATABASE_URL is read from the environment
 * and never printed:
 *   NEON_TRANSPORT=https DATABASE_URL=… npx tsx scripts/covenant-learning-factory/decompose-coverage-gaps.ts --neon --max=189
 */

import { readFileSync } from "node:fs";
import { buildComputationPackage } from "../../lib/covenant-learning-factory/sweep/build-package";
import { HIGH_REFUSAL_COVERAGE_MARKER } from "../../lib/covenant-learning-factory/evaluation";
import {
  candidatesAsRows,
  fetchCandidates,
  fetchConditions,
  fetchDefinitions,
  fetchDocumentText,
  fetchKnowledgeSources,
} from "../../lib/covenant-learning-factory/sweep/neon-load";
import {
  COVERAGE_GAP_CONDITION_PREFIX,
  COVERAGE_GAP_OMISSION_PREFIX,
  excerptReflectedByPrefixOnly,
  selfCheckComputation,
} from "../../lib/covenant-learning-factory/sweep/self-check";
import {
  createNeonHttpsExecutor,
  redactConnectionSecrets,
} from "../../lib/covenant-learning-factory/store/neon-transport";
import { loadLatestRulesetFromNeon } from "../../lib/flywheel/ruleset-neon";
import { runCovenantComputation } from "../../lib/contract-model/covenant-computation";
import { emptyRuleSet, type LearnedRuleSet } from "../../lib/covenant-learning-factory/learned-rules/types";
import type { PrecedentCandidate, PrecedentCondition, PrecedentDefinition } from "../../lib/covenant-learning-factory/sweep/self-check";
import type { PrecedentSourceRow } from "../../lib/covenant-learning-factory/sweep/build-package";

const FIXTURES: { sourceId: string; path: string }[] = [
  { sourceId: "chwy", path: "tests/fixtures/unseen-packages/chwy-2026-credit-agreement/extracted-text/doc-a-2026-06-23-credit-agreement.txt" },
  { sourceId: "wor", path: "tests/fixtures/unseen-packages/wor-2023-2026-credit-facility/extracted-text/doc-b-2026-08-31-fifth-ar-credit-agreement.txt" },
  { sourceId: "fwrg", path: "tests/fixtures/unseen-packages/fwrg-2021-credit-agreement/article-6-negative-covenants.txt" },
  { sourceId: "conmed", path: "tests/fixtures/unseen-packages/conmed-2025-credit-facility/curated/base-credit-agreement-article-vii-negative-covenants.txt" },
  { sourceId: "mtn-ind-2024", path: "docs/product-proof/001/sources/mtn-2026-tenth-ar-credit-agreement/extracted-text/doc-b-indenture-2024.txt" },
  { sourceId: "mtn-ind-2025", path: "docs/product-proof/001/sources/mtn-2026-tenth-ar-credit-agreement/extracted-text/doc-c-indenture-2025.txt" },
  { sourceId: "mtn-ca", path: "docs/product-proof/001/sources/mtn-2026-tenth-ar-credit-agreement/extracted-text/doc-a-tenth-ar-credit-agreement.txt" },
  { sourceId: "gibraltar", path: "tests/fixtures/unseen-packages/gibraltar-2026-credit-agreement/extracted-text/credit-agreement.txt" },
  { sourceId: "lsb", path: "tests/fixtures/unseen-packages/lsb-2023-abl-credit-agreement/article-6-negative-covenants.txt" },
  { sourceId: "mhk", path: "docs/product-proof/002/sources/mhk-2026-credit-agreement/extracted-text/doc-a-credit-agreement.txt" },
  { sourceId: "an", path: "tests/fixtures/unseen-packages/an-2020-2026-credit-facility/extracted-text/doc-b-2026-09-14-fifth-ar-credit-agreement.txt" },
];

type Cause =
  | "omission-no-bound-text"
  | "unbound-exception-excerpt"
  | "doc-level-high-refusal"
  | "discovery-candidate"
  | "discovery-definition"
  | "discovery-other"
  | "unsupported-semantics"
  | "other";

function causeOf(className: string, message: string): Cause {
  if (className === "COVERAGE_GAP" && message.startsWith(COVERAGE_GAP_OMISSION_PREFIX)) return "omission-no-bound-text";
  if (className === "COVERAGE_GAP" && message.startsWith(COVERAGE_GAP_CONDITION_PREFIX)) return "unbound-exception-excerpt";
  if (className === "COVERAGE_GAP" && message.includes(HIGH_REFUSAL_COVERAGE_MARKER)) return "doc-level-high-refusal";
  if (className === "DISCOVERY_GAP" && message.startsWith("precedent candidate ")) return "discovery-candidate";
  if (className === "DISCOVERY_GAP" && message.startsWith("definition ")) return "discovery-definition";
  if (className === "DISCOVERY_GAP") return "discovery-other";
  if (className === "UNSUPPORTED_SEMANTICS") return "unsupported-semantics";
  return "other";
}

interface Row {
  sourceId: string;
  ticker: string;
  baskets: number;
  needsInputCaps: number;
  omission: number;
  unboundException: number;
  highRefusal: number;
  discoveryCandidate: number;
  /** Candidate misses under the old first-40-characters check. */
  prefixOnlyCandidateMisses: number;
  discoveryDefinition: number;
  unsupported: number;
  other: number;
}

function tally(args: {
  source: PrecedentSourceRow;
  documentText: string | null;
  candidates: PrecedentCandidate[];
  definitions: PrecedentDefinition[];
  conditions: PrecedentCondition[];
  rules: LearnedRuleSet;
}): Row {
  const pkg = buildComputationPackage({
    source: args.source,
    documentText: args.documentText,
    candidates: candidatesAsRows(args.candidates),
    rules: args.rules,
  });
  const result = runCovenantComputation(pkg, { rules: args.rules, createdAt: "1970-01-01T00:00:00.000Z" });
  const norm = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();
  let prefixOnlyCandidateMisses = 0;
  for (const cand of args.candidates) {
    if (!cand.excerpt || cand.excerpt.length < 24) continue;
    const excerpt = norm(cand.excerpt);
    const hit = result.baskets.some((b) => excerptReflectedByPrefixOnly(excerpt, norm(b.citationExcerpt)));
    if (!hit) prefixOnlyCandidateMisses += 1;
  }
  const errors = selfCheckComputation({
    packageKey: pkg.packageKey,
    runId: "decompose",
    sourceId: args.source.sourceId,
    result,
    candidates: args.candidates,
    definitions: args.definitions,
    conditions: args.conditions,
    now: "1970-01-01T00:00:00.000Z",
  });
  const row: Row = {
    sourceId: args.source.sourceId,
    ticker: args.source.ticker ?? "",
    baskets: result.baskets.length,
    needsInputCaps: result.baskets.filter((b) => b.capStatus === "NEEDS_INPUT").length,
    omission: 0,
    unboundException: 0,
    highRefusal: 0,
    discoveryCandidate: 0,
    prefixOnlyCandidateMisses,
    discoveryDefinition: 0,
    unsupported: 0,
    other: 0,
  };
  for (const error of errors) {
    const cause = causeOf(error.class, error.message);
    if (cause === "omission-no-bound-text") row.omission += 1;
    else if (cause === "unbound-exception-excerpt") row.unboundException += 1;
    else if (cause === "doc-level-high-refusal") row.highRefusal += 1;
    else if (cause === "discovery-candidate") row.discoveryCandidate += 1;
    else if (cause === "discovery-definition") row.discoveryDefinition += 1;
    else if (cause === "unsupported-semantics") row.unsupported += 1;
    else row.other += 1;
  }
  return row;
}

function printRows(rows: Row[], note: string): void {
  console.log(note);
  console.log(
    ["sourceId", "ticker", "baskets", "needsInputCaps", "omission", "unboundException", "highRefusal", "discoveryCandidate", "prefixOnlyCandidateMisses", "discoveryDefinition", "unsupported", "other"].join("\t"),
  );
  const tot: Row = {
    sourceId: "TOTAL",
    ticker: "",
    baskets: 0,
    needsInputCaps: 0,
    omission: 0,
    unboundException: 0,
    highRefusal: 0,
    discoveryCandidate: 0,
    prefixOnlyCandidateMisses: 0,
    discoveryDefinition: 0,
    unsupported: 0,
    other: 0,
  };
  for (const row of rows) {
    console.log(
      [row.sourceId, row.ticker, row.baskets, row.needsInputCaps, row.omission, row.unboundException, row.highRefusal, row.discoveryCandidate, row.prefixOnlyCandidateMisses, row.discoveryDefinition, row.unsupported, row.other].join("\t"),
    );
    tot.baskets += row.baskets;
    tot.needsInputCaps += row.needsInputCaps;
    tot.omission += row.omission;
    tot.unboundException += row.unboundException;
    tot.highRefusal += row.highRefusal;
    tot.discoveryCandidate += row.discoveryCandidate;
    tot.prefixOnlyCandidateMisses += row.prefixOnlyCandidateMisses;
    tot.discoveryDefinition += row.discoveryDefinition;
    tot.unsupported += row.unsupported;
    tot.other += row.other;
  }
  console.log(
    [tot.sourceId, tot.ticker, tot.baskets, tot.needsInputCaps, tot.omission, tot.unboundException, tot.highRefusal, tot.discoveryCandidate, tot.prefixOnlyCandidateMisses, tot.discoveryDefinition, tot.unsupported, tot.other].join("\t"),
  );
  console.log(
    `COVERAGE_GAP omission-no-bound-text=${tot.omission} unbound-exception-excerpt=${tot.unboundException} doc-level-high-refusal=${tot.highRefusal}`,
  );
  console.log(
    "doc-level-high-refusal is evaluation.ts. clf:sweep does not call it, so a Neon sweep total does not include that row.",
  );
  console.log(
    "needsInputCaps is capStatus NEEDS_INPUT (missing EBITDA, usage, or an unbound metric). Those are refused caps, not COVERAGE_GAP.",
  );
  console.log(
    "prefixOnlyCandidateMisses is the old first-40-characters candidate check. discoveryCandidate is the sweep check after citation anchors.",
  );
}

function argNum(name: string): number | null {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (!hit) return null;
  const n = Number(hit.slice(name.length + 3));
  return Number.isFinite(n) && n > 0 ? n : null;
}

async function offline(): Promise<void> {
  const rules = emptyRuleSet(0);
  const rows: Row[] = [];
  for (const fixture of FIXTURES) {
    const text = readFileSync(fixture.path, "utf8");
    rows.push(
      tally({
        source: { sourceId: fixture.sourceId, ticker: fixture.sourceId },
        documentText: text,
        candidates: [],
        definitions: [],
        conditions: [],
        rules,
      }),
    );
  }
  printRows(
    rows,
    "offline fixtures. No kf_precedent candidates, definitions, or conditions are attached, so discovery and unbound-exception stay 0 unless a source binds zero baskets.",
  );
}

async function neon(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is required for --neon");
    process.exit(2);
  }
  if (process.env.NEON_TRANSPORT !== "https") {
    console.error("NEON_TRANSPORT=https is required for --neon");
    process.exit(2);
  }
  const max = argNum("max");
  const executor = await createNeonHttpsExecutor(url);
  let rules = emptyRuleSet(0);
  try {
    rules = await loadLatestRulesetFromNeon(executor);
  } catch (err) {
    console.error("ruleset load failed; continuing with an empty ruleset:", redactConnectionSecrets(err instanceof Error ? err.message : String(err)));
  }
  const rows: Row[] = [];
  let after = "";
  while (max == null || rows.length < max) {
    const limit = max == null ? 20 : Math.min(20, max - rows.length);
    const sources = await fetchKnowledgeSources(executor, { afterSourceId: after, limit });
    if (sources.length === 0) break;
    for (const source of sources) {
      const [text, candidates, definitions, conditions] = await Promise.all([
        fetchDocumentText(executor, source),
        fetchCandidates(executor, source.sourceId),
        fetchDefinitions(executor, source.sourceId),
        fetchConditions(executor, source.sourceId),
      ]);
      rows.push(tally({ source, documentText: text, candidates, definitions, conditions, rules }));
      after = source.sourceId;
      if (rows.length % 10 === 0) console.error(`read ${rows.length} sources`);
      if (max != null && rows.length >= max) break;
    }
  }
  printRows(rows, `neon dry-run read-only. sources=${rows.length} ruleset=v${rules.rulesetVersion}. No writes.`);
}

async function main(): Promise<void> {
  try {
    if (process.argv.includes("--neon")) await neon();
    else await offline();
  } catch (err) {
    console.error("decompose-coverage-gaps failed:", redactConnectionSecrets(err instanceof Error ? err.message : String(err)));
    process.exit(1);
  }
}

main();
