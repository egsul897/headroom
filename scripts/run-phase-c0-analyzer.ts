/**
 * Phase C0 (task "PROVE THE CONTRACT ANALYZER BEFORE PHASE C" §7/§13/§25-28)
 * - runs the real analyzer vertical slice (lib/contract-model/analyzer/**)
 * against the unseen FWRG 2021 Credit Agreement fixture, evaluates it blind
 * against the human ground truth, runs the adversarial-verification pass,
 * and writes one resumable JSON log recording exactly what happened -
 * including real token/latency/retry telemetry when a real LLM credential
 * is used (never fabricated; see lib/contract-model/analyzer/telemetry.ts).
 *
 * Resumable/idempotent (task §25): if a log for this exact
 * provider+model+promptVersion+schemaVersion already exists, this script
 * does not re-call the model - it re-runs only the (free, deterministic)
 * evaluation/verification steps against the already-persisted raw output,
 * unless FORCE=1 is set. This means a successful expensive real-LLM call is
 * never silently wasted by a later invocation of this script.
 *
 * Usage: npx tsx scripts/run-phase-c0-analyzer.ts [--force]
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import { getAnalyzerProvider } from "../lib/contract-model/analyzer/get-analyzer-provider";
import { evaluateAll } from "../lib/contract-model/analyzer/evaluator";
import { verifyAllRulesAgainstSource } from "../lib/contract-model/analyzer/verify";
import { HUMAN_PROVISIONS } from "../tests/fixtures/unseen-packages/fwrg-2021-credit-agreement/human-ground-truth";
import type { ContractAnalysisResult } from "../lib/contract-model/analyzer/schema";
import type { AnalyzerCallTelemetry } from "../lib/contract-model/analyzer/telemetry";

const FIXTURE_DIR = join(__dirname, "..", "tests", "fixtures", "unseen-packages", "fwrg-2021-credit-agreement");
const RESULTS_DIR = join(FIXTURE_DIR, "analyzer-runs");

interface RunLog {
  providerName: string;
  model: string;
  promptVersion: string;
  schemaVersion: string;
  ranAt: string;
  telemetry: AnalyzerCallTelemetry | null;
  rawResult: ContractAnalysisResult;
  evaluationBefore: ReturnType<typeof evaluateAll>;
  evaluationAfter: ReturnType<typeof evaluateAll>;
}

async function main() {
  const force = process.argv.includes("--force");
  const documentText = readFileSync(join(FIXTURE_DIR, "article-6-negative-covenants.txt"), "utf-8");
  const definitionsText = readFileSync(join(FIXTURE_DIR, "definitions-excerpt.txt"), "utf-8");

  const { provider, providerName, model, promptVersion, schemaVersion } = getAnalyzerProvider();
  const logPath = join(RESULTS_DIR, `${providerName}__${model.replace(/\//g, "-")}.json`);

  let log: RunLog;
  if (existsSync(logPath) && !force) {
    console.log(`[resume] Found existing run at ${logPath} - skipping the model call, re-running evaluation only. Pass --force to re-call the model.`);
    const prior = JSON.parse(readFileSync(logPath, "utf-8")) as RunLog;
    const verifiedRules = verifyAllRulesAgainstSource(prior.rawResult.rules, documentText);
    log = { ...prior, evaluationAfter: evaluateAll(HUMAN_PROVISIONS, verifiedRules) };
  } else {
    console.log(`[run] provider=${providerName} model=${model} promptVersion=${promptVersion} schemaVersion=${schemaVersion}`);
    const rawResult = await provider.analyze({ documentText, definitionsText });
    const telemetry = "lastCallTelemetry" in provider ? ((provider as { lastCallTelemetry: AnalyzerCallTelemetry | null }).lastCallTelemetry) : null;

    const evaluationBefore = evaluateAll(HUMAN_PROVISIONS, rawResult.rules);
    const verifiedRules = verifyAllRulesAgainstSource(rawResult.rules, documentText);
    const evaluationAfter = evaluateAll(HUMAN_PROVISIONS, verifiedRules);

    log = { providerName, model, promptVersion, schemaVersion, ranAt: new Date().toISOString(), telemetry, rawResult, evaluationBefore, evaluationAfter };
    mkdirSync(RESULTS_DIR, { recursive: true });
    writeFileSync(logPath, JSON.stringify(log, null, 2));
    console.log(`[saved] ${logPath}`);
  }

  console.log("\n=== BEFORE adversarial verification ===");
  console.log(`MATCHED_CORRECT=${log.evaluationBefore.matchedCorrect} MATCHED_INCORRECT_FLAGGED=${log.evaluationBefore.matchedIncorrectFlagged} MATCHED_INCORRECT_UNFLAGGED=${log.evaluationBefore.matchedIncorrectUnflagged} MISSING=${log.evaluationBefore.missing}`);
  console.log(`DANGEROUS_UNFLAGGED_ERROR_RATE=${(log.evaluationBefore.dangerousUnflaggedErrorRate * 100).toFixed(1)}% DANGEROUS_FLAGGED_ERROR_RATE=${(log.evaluationBefore.dangerousFlaggedErrorRate * 100).toFixed(1)}%`);
  console.log("\n=== AFTER adversarial verification ===");
  console.log(`MATCHED_CORRECT=${log.evaluationAfter.matchedCorrect} MATCHED_INCORRECT_FLAGGED=${log.evaluationAfter.matchedIncorrectFlagged} MATCHED_INCORRECT_UNFLAGGED=${log.evaluationAfter.matchedIncorrectUnflagged} MISSING=${log.evaluationAfter.missing}`);
  console.log(`DANGEROUS_UNFLAGGED_ERROR_RATE=${(log.evaluationAfter.dangerousUnflaggedErrorRate * 100).toFixed(1)}% DANGEROUS_FLAGGED_ERROR_RATE=${(log.evaluationAfter.dangerousFlaggedErrorRate * 100).toFixed(1)}%`);
  if (log.telemetry) {
    console.log("\n=== Telemetry ===");
    console.log(JSON.stringify(log.telemetry, null, 2));
  } else {
    console.log("\n=== Telemetry ===\nnone (synthetic provider - zero network calls, zero real tokens/cost)");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
