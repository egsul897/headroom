/**
 * Phase 2B - runs the real discovery pipeline (real Sonnet 5 calls via
 * AI_GATEWAY_API_KEY, authorized by the user) against FWRG/LSB regression
 * fixtures, and writes the raw results + summary to disk for evaluation.
 * Zero writes to any protected/production data - reads fixture text only.
 */
import fs from "node:fs";
import path from "node:path";
import { parseDocumentStructure } from "../lib/contract-model/compiler/stage-structure";
import { buildStructuralIndex } from "../lib/contract-model/compiler/structural-index";
import { getStageCaller } from "../lib/contract-model/compiler/llm-caller";
import { runDiscoveryPipeline } from "../lib/contract-model/compiler/discovery/pipeline";

async function run(label: string, dir: string) {
  const text = fs.readFileSync(path.join(dir, "definitions-excerpt.txt"), "utf-8") + "\n\n" + fs.readFileSync(path.join(dir, "article-6-negative-covenants.txt"), "utf-8");
  const nodes = parseDocumentStructure({ documentId: label, label, text });
  const nodesByDocument = new Map([[label, { text, nodes }]]);
  const index = buildStructuralIndex(nodesByDocument, [], []);
  const caller = getStageCaller();
  console.error(`[${label}] running discovery via ${caller.providerName}/${caller.model}...`);
  const result = await runDiscoveryPipeline(caller, label, index);
  const outPath = path.join(__dirname, "..", "tmp-phase-2b-" + label + "-discovery.json");
  fs.writeFileSync(outPath, JSON.stringify(result, null, 2));
  console.error(`[${label}] wrote ${outPath}`);
  console.error(`[${label}] summary:`, JSON.stringify(result.summary, null, 2));
  return result;
}

async function main() {
  await run("fwrg", path.join(__dirname, "..", "tests", "fixtures", "unseen-packages", "fwrg-2021-credit-agreement"));
  await run("lsb", path.join(__dirname, "..", "tests", "fixtures", "unseen-packages", "lsb-2023-abl-credit-agreement"));
}
main().catch((err) => {
  console.error(err);
  process.exit(1);
});
