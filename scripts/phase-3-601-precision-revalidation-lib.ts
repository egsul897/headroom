/**
 * PHASE 3 FINAL / 6.01 FINAL FUNDED POST-PRECISION PAID REVALIDATION - mission constants and identity.
 * Everything else (frozen inventory candidate, resume proof, plan, frozen rates, resumed cost, guard) is the certified
 * revalidation library, reused unchanged.
 */
import { existsSync } from "node:fs";
import { readJson, sh } from "./phase-3-601-revalidation-lib";

export const MISSION_ID = "phase-3-final-601-precision-revalidation";
export const RAW = "tests/fixtures/unseen-packages/phase-3-final-601-precision-revalidation";
export const PREVIOUS_RAW = "tests/fixtures/unseen-packages/phase-3-final-601-revalidation";
export const STARTING_SHA = "6cc1c5de51a56d93bf9094714c3f1337169be71f";
export const CERTIFIED_PRODUCTION_SHA = "80671aa8562d3aa0ac2c6bd3120f56cda6aa91aa";
export const CERTIFIED_TREES: Record<string, string> = { "lib": "82832050f837e18599bfa127b4722ade879e7c24", "lib/contract-model/compiler": "365c6fd79324816e1473d9857d642cf8fa146518", "lib/contract-model/compiler/semantic": "84a709051ed7d959407b286d34e75ebae442891d" };
/** Mission §3: the ONLY hard cap. */
export const HARD_CAP_USD = 12.2;
/** Mission §3/§4: the frozen conservative resumed estimate (148 §8), which the live estimator must reproduce exactly. */
export const CONSERVATIVE_ESTIMATE_USD = 12.153745;
export const EXPECTED_PLANNER_TOKENS = 290_402;
export const EXPECTED_PLAN_HASH = "b2b9540a144348dab91cc80eacd0d9b472e9e93a61a8fd359e1a507cf5cf17ce";
export const EXPECTED_CENSUS = { shards: 7, oversized: 0, CERTIFIED_CONTEXT_COMPLETE: 5, CERTIFIED_WITH_EXPLICIT_INTERNAL_LIMITATION: 2, CERTIFIED_WITH_EXPLICIT_EXTERNAL_LIMITATION: 0, PLANNING_FAILED_REQUIRED_CONTEXT_UNDELIVERABLE: 0 };
export const THIN_SHARD = { shardId: "shard:86cc5e439f113d6053a9", requiredContextChars: 63_998, ceiling: 64_000, turn1Tokens: 61_670 };
export const FROZEN_INVENTORY = { fileSha256: "9ab4ca8422b77c3f39bad4f0715ab21af3d80fb4225c32c8f29095e94b69bdc7", frozenContentHash: "88e7419f61f96b827db31d91e9047e699fb54685d11d94d432b081e0d7eb1b0c", items: 326 };
export const EXPECTED_RESUME = { method: "RECORDED_SOURCE_CONTEXT_HASH", sourceContextHash: "08752002dcea9074ab0531f3a04507a9364be1088029cdbf335cc59a620c0eec", partitionHash: "271ed1589981c852826c8f9bc8863e38f318b823f1bc56393b59ff28bde0018e" };
/** Cumulative Section 6.01 spend before this mission (117-revalidation-verdict.json cost.cumulativeSection601Usd). */
export const HISTORICAL_601_SPEND_USD: number = (readJson<{ cost: { cumulativeSection601Usd: number } }>("docs/phase-3-final-601/117-revalidation-verdict.json")).cost.cumulativeSection601Usd;
/** Audit witnesses of the generic delivery machinery (mission §17) - harness-only names, never in production. */
export const WITNESS_KEYS = ["term:fixed incremental amount", "term:voluntary prepayment incremental amount", "term:ratio incremental amount", "term:extension amount", "section:2.18(b)"];
export const BRANCH = "claude/headroom-scaffold-covenant-engine-jrijk8";

const MISSION_OWNED = (f: string) => f.startsWith("scripts/phase-3-601-precision-revalidation") || /^docs\/phase-3-final-601\/15[0-9]-/.test(f) || f.startsWith(RAW) || f === "docs/phase-3-final-601/README.md";

/** §1 - HEAD is the starting SHA (or a descendant carrying only this mission's evidence/harness) AND the production tree is the certified one. */
export function missionIdentity() {
  const head = sh("git rev-parse HEAD");
  const isDescendant = (() => { try { sh(`git merge-base --is-ancestor ${STARTING_SHA} HEAD`); return true; } catch { return false; } })();
  const changedSinceStart = head === STARTING_SHA ? [] : sh(`git diff --name-only ${STARTING_SHA} HEAD`).split("\n").filter(Boolean);
  const foreign = changedSinceStart.filter((f) => !MISSION_OWNED(f));
  const dirty = sh("git status --porcelain").split("\n").map((l) => l.trim()).filter(Boolean).filter((l) => !MISSION_OWNED(l.replace(/^\S+\s+/, "")));
  const trees = Object.fromEntries(Object.entries(CERTIFIED_TREES).map(([p, expected]) => [p, { expected, actual: sh(`git rev-parse HEAD:${p}`), workingTreeDiffersFromHead: sh(`git diff --name-only HEAD -- ${p}/`).split("\n").filter(Boolean) }]));
  const productionDriftFromCertified = sh(`git diff --name-only ${CERTIFIED_PRODUCTION_SHA} -- lib/`).split("\n").filter(Boolean);
  let remote: string | null = null;
  try { remote = sh(`git ls-remote origin refs/heads/${BRANCH}`).split(/\s+/)[0] ?? null; } catch { try { remote = sh(`git rev-parse origin/${BRANCH}`); } catch { remote = null; } }
  const precheck = ["147-committed-tree-recertification", "148-final-preflight", "149-final-preflight-gate"].map((n) => ({ artifact: n, present: existsSync(`docs/phase-3-final-601/${n}.json`) }));
  const gate149 = existsSync("docs/phase-3-final-601/149-final-preflight-gate.json") ? readJson<{ summary: { PASS: number; FAIL: number }; failing: string[] }>("docs/phase-3-final-601/149-final-preflight-gate.json") : null;
  const checks = {
    head: { expected: STARTING_SHA, actual: head, isDescendant, filesOutsideMission: foreign, match: head === STARTING_SHA || (isDescendant && foreign.length === 0) },
    workingTreeClean: { dirtyOutsideMission: dirty, match: dirty.length === 0 },
    productionTreeIsCertified: { certifiedSha: CERTIFIED_PRODUCTION_SHA, trees, driftFromCertified: productionDriftFromCertified, match: Object.values(trees).every((t) => t.expected === t.actual && t.workingTreeDiffersFromHead.length === 0) && productionDriftFromCertified.length === 0 },
    remoteAtSameHead: { remote, match: remote === head },
    precheckArtifacts: { present: precheck, gate149: gate149 ? { PASS: gate149.summary.PASS, FAIL: gate149.summary.FAIL, failing: gate149.failing } : null, match: precheck.every((p) => p.present) && gate149?.summary.PASS === 17 && gate149?.summary.FAIL === 1 && gate149.failing.length === 1 && /gateway balance >= conservative resumed cost/.test(gate149.failing[0]!) },
  };
  return { ...checks, allMatch: Object.values(checks).every((c) => c.match) };
}
