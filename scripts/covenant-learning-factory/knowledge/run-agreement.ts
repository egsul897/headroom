#!/usr/bin/env tsx
/** Run the end-to-end agreement pipeline on a text file (.txt or .txt.gz) and print the per-family summary as JSON. */
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { runAgreementPipeline } from "../../../lib/covenant-learning-factory/pipeline/agreement-pipeline";
const f = process.argv[2] ?? "";
if (!f) throw new Error("usage: run-agreement.ts FILE[.gz] [sourceId]");
const buf = readFileSync(f);
const text = (f.endsWith(".gz") ? gunzipSync(buf) : buf).toString("utf8");
const r = runAgreementPipeline({ sourceId: process.argv[3] ?? f, text });
console.log(JSON.stringify({ textSha256: r.textSha256, parserVersion: r.parserVersion, basis: r.basis, stats: r.stats,
  families: r.families.map((x) => ({ family: x.family, outcome: x.outcome, checklist: x.checklistStatus, sections: x.sectionPaths,
    baskets: x.baskets.length, computed: x.baskets.filter((b) => b.capStatus === "COMPUTED").map((b) => `${b.sectionRef} ${b.cap} ${b.currency ?? ""}`.trim()).slice(0, 4),
    needsInputs: x.needsInputs.slice(0, 5) })) }, null, 1));
