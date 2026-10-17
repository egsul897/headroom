/**
 * PR scoreboard gate: compare the PR's merged scoreboard report against the base branch's report scored on the same
 * inputs (pr-gate style; no committed baseline involved). Exit 1 when HELDOUT errors rise, HELDOUT
 * UNSUPPORTED_SEMANTICS rises, a HELDOUT source regresses materially, or a HELDOUT source disappears; exit 3 when the
 * two reports are incomparable (different snapshot / ruleset / scorer config, e.g. a PR that changes the benchmark
 * inputs or the scorer: that needs an owner-approved rebaseline, not a green gate).
 *   npx tsx scripts/covenant-learning-factory/scoreboard/compare-to-base.ts BASE.json PR.json [--summary=PATH]
 * The no-learned-rules totals and refused self-credit are printed for both sides (report-only). No AI / LLM calls.
 */
import { appendFileSync, readFileSync } from "node:fs";
import { compareToBaseline, DEFAULT_THRESHOLDS, IncomparableEvaluationError, type ScoreboardReport } from "../../../lib/covenant-learning-factory/scoreboard";

const [basePath, prPath] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const summary = process.argv.find((a) => a.startsWith("--summary="))?.slice(10);
if (!basePath || !prPath) throw new Error("usage: compare-to-base.ts BASE.json PR.json [--summary=PATH]");
const base = JSON.parse(readFileSync(basePath, "utf8")) as ScoreboardReport;
const pr = JSON.parse(readFileSync(prPath, "utf8")) as ScoreboardReport;
const nr = (r: ScoreboardReport) => (r.noRulesTotals ? { HELDOUT: r.noRulesTotals.HELDOUT.total, DEV: r.noRulesTotals.DEV.total } : null);
const lines: string[] = [];
let code = 0;
try {
  const g = compareToBaseline(base, pr, { thresholds: DEFAULT_THRESHOLDS });
  code = g.pass ? 0 : 1;
  lines.push(
    `## CLF scoreboard vs base: ${g.pass ? "PASS" : "FAIL"}`,
    `HELDOUT ${g.heldoutBefore} → ${g.heldoutAfter}; DEV ${g.devBefore} → ${g.devAfter}`,
    `no-learned-rules (report-only): base ${JSON.stringify(nr(base))} → PR ${JSON.stringify(nr(pr))}`,
    `refused self-credit (report-only): base ${JSON.stringify(base.selfCredit?.refused ?? null)} → PR ${JSON.stringify(pr.selfCredit?.refused ?? null)}; rules without provenance ${base.selfCredit?.rulesWithoutProvenance ?? "n/a"} → ${pr.selfCredit?.rulesWithoutProvenance ?? "n/a"}`,
    ...g.reasons.map((r) => `- ${r}`),
    ...g.deltas.slice(0, 40).map((d) => `  Δ ${d.delta > 0 ? "+" : ""}${d.delta} ${d.split} ${d.sourceId} ${JSON.stringify(d.byClass)}`),
  );
} catch (err) {
  if (!(err instanceof IncomparableEvaluationError)) throw err;
  code = 3;
  lines.push("## CLF scoreboard vs base: INCOMPARABLE (benchmark inputs or scorer changed; owner-approved rebaseline required)", ...err.problems.map((p) => `- ${p}`));
}
console.log(lines.join("\n"));
if (summary) appendFileSync(summary, lines.join("\n") + "\n");
process.exit(code);
