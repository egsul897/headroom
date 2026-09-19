/**
 * HD-4 SIGKILL crash child (mission §19). Runs the REAL production dual-pass Pass A through the harness's durable
 * callers with a scripted, delayed provider. The parent watches the durable-call directory and SIGKILLs this process
 * mid-run; a second launch over the same directory must replay every persisted call and execute only the rest.
 * Zero model calls. Usage: npx tsx scripts/phase-3-601-hd4-crash-child.ts <evidenceDir> [delayMs]
 */
import { writeFileSync } from "node:fs";
import { resumablePassA } from "./phase-3-601-hd4-resume";
import { buildHd4Scenario, scriptedPassACaller, stripVolatile, HD4_BATCH_CHARS, HD4_DOC_ID } from "./phase-3-601-hd4-scripted";

const dir = process.argv[2]!;
const delayMs = Number(process.argv[3] ?? "100");
if (!dir) { console.error("usage: crash-child <evidenceDir> [delayMs]"); process.exit(2); }

void (async () => {
  const built = await buildHd4Scenario();
  const liveCalls: string[] = [];
  const out = await resumablePassA({ evidenceDir: dir, missionId: "hd4-sigkill-cert", candidateRef: built.scenario.id, documentId: HD4_DOC_ID, sourceContext: built.sourceContext, structuralIndex: built.index, batchChars: HD4_BATCH_CHARS, liveCallerFor: (passId) => scriptedPassACaller({ delayMs, onCall: (stage) => liveCalls.push(`${passId}:${stage}`) }) });
  const result = { pid: process.pid, source: out.source, usable: out.usable, frozenContentHash: out.inventory.frozenContentHash, items: out.inventory.items.length, telemetryCostUsd: out.inventory.telemetryCostUsd, liveCalls, accounting: out.execution?.accounting.total ?? null, log: out.execution?.accounting.log ?? [], inventoryProjection: stripVolatile(out.inventory), finishedAt: new Date().toISOString() };
  writeFileSync(`${dir}/child-result.json`, JSON.stringify(result, null, 1));
  console.log(JSON.stringify({ source: out.source, usable: out.usable, hash: out.inventory.frozenContentHash, accounting: result.accounting }));
})().catch((e) => { console.error("CHILD FATAL", e instanceof Error ? e.stack : e); process.exit(1); });
