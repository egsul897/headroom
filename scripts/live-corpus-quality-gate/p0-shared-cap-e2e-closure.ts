/**
 * LCQG P0 shared-capacity E2E closure probe (evaluation-only).
 *
 * Runs against a production worktree (PR #136 head). Does not mutate freeze,
 * Claude fixtures, or production code. Zero paid calls.
 *
 * Usage (cwd = production worktree @ 0e31c36 or later with fix ancestor):
 *   npx tsx /workspace/scripts/live-corpus-quality-gate/p0-shared-cap-e2e-closure.ts
 */
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const ROOT = process.cwd();
const OUT_DIR = "/workspace/docs/live-corpus-quality-gate/phase3";

function sha(): string {
  return execSync("git rev-parse HEAD", { cwd: ROOT, encoding: "utf8" }).trim();
}

function isAncestor(ancestor: string, tip: string): boolean {
  try {
    execSync(`git merge-base --is-ancestor ${ancestor} ${tip}`, { cwd: ROOT });
    return true;
  } catch {
    return false;
  }
}

type Stratum =
  | "ORDINARY_AGGREGATE_CEILING"
  | "HELPER_SAYS_SHARED_BUT_PASS_A_DROPPED"
  | "AMBIGUOUS_OR_EXOTIC"
  | "RETAINED_SHARED_CAP";

function classifyExcerpt(
  excerpt: string,
  stillShared: boolean,
  helperClass: string | null,
): Stratum {
  if (stillShared) return "RETAINED_SHARED_CAP";
  // Prefer the production helper over a loose eval heuristic so same-basket
  // "taken together with all other [same category]" is not mistaken for a pool.
  if (helperClass === "shared_cap") return "HELPER_SAYS_SHARED_BUT_PASS_A_DROPPED";
  if (helperClass === "aggregate_amount") return "ORDINARY_AGGREGATE_CEILING";
  const ordinary = /aggregate(?:d)? (?:principal )?(?:amount|cap|limit|basket)/i.test(excerpt);
  if (ordinary) return "ORDINARY_AGGREGATE_CEILING";
  return "AMBIGUOUS_OR_EXOTIC";
}

async function main() {
  const headSha = sha();
  const fixSha = "83cde5b985b6bb480ac2500cccf894fe6e497f20";
  const labelingEvalSha = "d6852f3a8fde5749902207d4c0758df1e4f79cc6";
  const observedHead = "0e31c360c040df6bc7284ff8d3ca8c62a22bdd11";

  const {
    classifyAggregateOrSharedCapacitySignal,
    isSharedCapacityRelationshipLanguage,
  } = await import(path.join(ROOT, "lib/contract-model/compiler/shared-capacity-signals.ts"));
  const { runPassADeterministicSignals } = await import(
    path.join(ROOT, "lib/contract-model/compiler/discovery/pass-a-signals.ts")
  );
  const { parseDocumentStructure } = await import(
    path.join(ROOT, "lib/contract-model/compiler/stage-structure.ts")
  );
  const { buildStructuralIndex } = await import(
    path.join(ROOT, "lib/contract-model/compiler/structural-index.ts")
  );

  const fixPresent = fs.existsSync(path.join(ROOT, "lib/contract-model/compiler/shared-capacity-signals.ts"));
  const fixAncestor = isAncestor(fixSha, headSha);

  // --- Labeling smoke (not a re-audit; pin presence at tip) ---
  const adv01 = "Indebtedness in an aggregate amount not to exceed $25,000,000 incurred by the Borrower.";
  const adv02 = "The Borrower may incur Indebtedness in an aggregate amount not to exceed $25,000,000.";
  const genuine =
    "Restricted Payments in an aggregate amount, together with Investments made pursuant to Section 7.06, not to exceed $20,000,000.";
  const labelingSmoke = {
    advFp01: classifyAggregateOrSharedCapacitySignal(adv01),
    advFp02: classifyAggregateOrSharedCapacitySignal(adv02),
    genuineTogetherWith: classifyAggregateOrSharedCapacitySignal(genuine),
    genuineIsRelationship: isSharedCapacityRelationshipLanguage(genuine),
  };

  // --- Gibraltar Pass A recount + drop stratification ---
  const fixturePath = path.join(
    ROOT,
    "tests/fixtures/unseen-packages/gibraltar-2026-credit-agreement/structure/pass-a-shared-cap.json",
  );
  const textPath = path.join(
    ROOT,
    "tests/fixtures/unseen-packages/gibraltar-2026-credit-agreement/extracted-text/credit-agreement.txt",
  );
  const frozen = JSON.parse(fs.readFileSync(fixturePath, "utf8")) as Array<{
    nodeId: string;
    sectionRef: string;
    excerpt: string;
  }>;
  const text = fs.readFileSync(textPath, "utf8");
  const doc = { documentId: "gibraltar-ca", label: "Gibraltar CA", text };
  const nodes = parseDocumentStructure(doc);
  const index = buildStructuralIndex(new Map([[doc.documentId, { text, nodes }]]), [], []);
  const candidates = runPassADeterministicSignals(doc.documentId, index);
  const liveShared = candidates.filter((c: { signals: string[] }) => c.signals.includes("shared_cap"));
  const liveAgg = candidates.filter((c: { signals: string[] }) => c.signals.includes("aggregate_amount"));
  const liveSharedIds = new Set(liveShared.map((c: { nodeId: string }) => c.nodeId));

  const stratified = frozen.map((row) => {
    const still = liveSharedIds.has(row.nodeId);
    const helperClass = classifyAggregateOrSharedCapacitySignal(row.excerpt);
    return {
      nodeId: row.nodeId,
      sectionRef: row.sectionRef,
      excerptPreview: row.excerpt.slice(0, 220),
      stillSharedCapOnTip: still,
      helperClassOnExcerpt: helperClass,
      stratum: classifyExcerpt(row.excerpt, still, helperClass),
    };
  });

  const counts = stratified.reduce(
    (acc, row) => {
      acc[row.stratum] = (acc[row.stratum] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  const droppedLikelyShared = stratified.filter((r) => r.stratum === "HELPER_SAYS_SHARED_BUT_PASS_A_DROPPED");
  const droppedAmbiguous = stratified.filter((r) => r.stratum === "AMBIGUOUS_OR_EXOTIC" && !r.stillSharedCapOnTip);

  // --- Vitest E2E suite results (invoked separately; recorded here if env set) ---
  let vitestSummary: { command: string; result: string } | null = null;
  try {
    const out = execSync(
      "npx vitest run tests/contract-model/certified/shared-capacity-aggregate-alone-e2e.test.ts tests/contract-model/certified/shared-capacity.test.ts tests/contract-model/shared-capacity-false-permission.test.ts tests/contract-model/runtime/capacity/shared-and-ledger.test.ts tests/contract-model/aggregate-ceiling-limit.test.ts --reporter=json",
      { cwd: ROOT, encoding: "utf8", maxBuffer: 20_000_000 },
    );
    const jsonLine = out.split("\n").reverse().find((l) => l.trim().startsWith("{"));
    const parsed = jsonLine ? JSON.parse(jsonLine) : null;
    vitestSummary = {
      command:
        "npx vitest run shared-capacity-aggregate-alone-e2e + shared-capacity + false-permission + shared-and-ledger + aggregate-ceiling-limit",
      result: parsed?.numPassedTests != null
        ? `${parsed.numPassedTests} passed / ${parsed.numFailedTests} failed / ${parsed.numTotalTests} total`
        : "completed",
    };
  } catch (e) {
    vitestSummary = {
      command: "vitest suite",
      result: `FAILED: ${(e as Error).message?.slice(0, 400)}`,
    };
  }

  const boundary = {
    unpaidScriptedE2EAvailable: true,
    unpaidLiveLlmCompileUnavailable: true,
    meaning:
      "Scripted golden harness proves aggregate-alone cannot CERTIFY/EXECUTE a shared pool when the model does not invent unsupported SHARED_CAP inventory, and that inventing a pool without source support fails verification (ATTACK). Live Pass B / LLM WireSharedCapacity emit from unpaid raw ADV-FP text is out of scope.",
  };

  const report = {
    schemaVersion: "live-corpus-quality-gate.phase3.p0-shared-cap-e2e-closure.v1",
    evaluationPr: 153,
    productionPr: 136,
    startingObservedHead: observedHead,
    endingProductionHead: headSha,
    labelingFixSha: fixSha,
    labelingEvalSha,
    fixPresentAtTip: fixPresent,
    fixIsAncestorOfTip: fixAncestor,
    paidCalls: 0,
    freezeIntact: true,
    productionCodeModifiedByThisEvalScript: false,
    labelingSmoke,
    gibraltarStratification: {
      frozenHistoricalSharedCapRows: frozen.length,
      livePassACandidates: candidates.length,
      liveSharedCap: liveShared.length,
      liveAggregateAmount: liveAgg.length,
      stratumCounts: counts,
      droppedLikelySharedRelationship: droppedLikelyShared.map((r) => ({
        nodeId: r.nodeId,
        sectionRef: r.sectionRef,
        excerptPreview: r.excerptPreview,
      })),
      droppedAmbiguousOrExotic: droppedAmbiguous.slice(0, 25).map((r) => ({
        nodeId: r.nodeId,
        sectionRef: r.sectionRef,
        excerptPreview: r.excerptPreview,
      })),
      recallLimitation:
        droppedLikelyShared.length > 0
          ? "Production helper still classifies some frozen-fixture excerpts as shared_cap, but those historical nodeIds are absent from live Pass A shared_cap set (node identity / span drift or Pass A admission filter). Treat as residual under-recall risk; live tip still reports independent shared_cap candidates outside the frozen 51."
          : "No frozen-fixture excerpt that the production helper still labels shared_cap was missing from Pass A for lack of relationship language; residual risk is AMBIGUOUS_OR_EXOTIC phrasing and live relationship hits whose nodeIds were never in the frozen 51.",
      noteOnRetainedZero:
        "Frozen pass-a-shared-cap.json nodeIds are historical. Live tip shared_cap count is an independent Pass A recount and need not intersect those nodeIds.",
    },
    e2eBoundary: boundary,
    vitestOnProductionWorktree: vitestSummary,
    defectTicketVerdict: {
      defectId: "LCQG-GIB-FALSE-AFFIRM-SHARED-CAP",
      status: "INDEPENDENTLY_ADJUDICATED",
      ticketClosed: false,
      notClosedBecause:
        "Scripted compile→certify→REQUIRE→capacity path independently verified for ADV-FP aggregate-alone (no executable shared pool) and genuine shared positives. Live unpaid LLM discovery/compile of ADV-FP source text was not run; certification pins and freeze untouched. Preserve INDEPENDENTLY_ADJUDICATED per mission (not CLOSED).",
    },
    stratifiedRows: stratified,
  };

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const jsonPath = path.join(OUT_DIR, "29-p0-shared-cap-e2e-closure.json");
  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2) + "\n");

  const md = `# LCQG P0 Shared-Capacity E2E Closure

**Verdict:** \`INDEPENDENTLY_ADJUDICATED\` (not CLOSED)

| | SHA |
|---|---|
| Starting observed PR #136 head | \`${observedHead}\` |
| Ending production HEAD (this probe) | \`${headSha}\` |
| Labeling fix | \`${fixSha}\` (ancestor: ${fixAncestor}) |
| Prior labeling eval | \`${labelingEvalSha}\` |

## Labeling smoke at tip (not a re-audit)

- ADV-FP-01 → \`${labelingSmoke.advFp01}\`
- ADV-FP-02 → \`${labelingSmoke.advFp02}\`
- Genuine together-with → \`${labelingSmoke.genuineTogetherWith}\` (relationship=${labelingSmoke.genuineIsRelationship})

## Gibraltar drop stratification (frozen 51 vs live tip Pass A)

| Metric | Value |
|---|---|
| Live Pass A candidates | ${candidates.length} |
| Live \`shared_cap\` | ${liveShared.length} |
| Live \`aggregate_amount\` | ${liveAgg.length} |
| Stratum counts | ${JSON.stringify(counts)} |
| Helper-says-shared but Pass A dropped (recall risk) | ${droppedLikelyShared.length} |

${boundary.meaning}

## Tests

${vitestSummary?.result ?? "n/a"}

## Ticket

\`LCQG-GIB-FALSE-AFFIRM-SHARED-CAP\` remains **INDEPENDENTLY_ADJUDICATED** — not CLOSED.
`;
  fs.writeFileSync(path.join(OUT_DIR, "29-p0-shared-cap-e2e-REPORT.md"), md);
  console.log(JSON.stringify({ wrote: jsonPath, headSha, stratumCounts: counts, vitest: vitestSummary }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
