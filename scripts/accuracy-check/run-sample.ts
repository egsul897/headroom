#!/usr/bin/env tsx
/**
 * Independent accuracy check — MEASUREMENT-ONLY harness (Grok, independent verification).
 * Read-only: runs the deterministic agreement pipeline on each sample document and dumps the
 * high-stakes outputs that the hand-verification scores. No engine code is modified; no network;
 * no Neon; no AI. The sample in datasets/measurement-only/accuracy-check-20261017/ must never be
 * used for tuning.
 *
 *   npx tsx scripts/accuracy-check/run-sample.ts <docsDir> <outDir>
 * Docs are EDGAR .htm exhibits named <TICKER>.htm (fetched separately; bytes are not committed).
 * Works on any branch whose runAgreementPipeline accepts {sourceId,text} (release-1 and #398).
 */
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { extractTextAsync } from "../../lib/knowledge-factory/pipeline/text";
import { runAgreementPipeline } from "../../lib/covenant-learning-factory/pipeline/agreement-pipeline";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import { CorpusStore, defaultCorpusPaths } from "../../lib/knowledge-factory/store/corpus-store";
import { processAcquiredDocument } from "../../lib/knowledge-factory/pipeline/run";
import { buildDocumentCovenantSummary } from "../../lib/product/covenant-intelligence/summarize";

/** The customer-upload path (analyze-upload.ts) minus Prisma/storage: same processAcquiredDocument + summary inputs. */
async function customerSummary(id: string, bytes: Buffer, filename: string) {
  const workRoot = mkdtempSync(join(tmpdir(), "acc-cust-"));
  try {
    const store = new CorpusStore(defaultCorpusPaths(join(workRoot, "corpus")));
    const contentHash = createHash("sha256").update(bytes).digest("hex");
    const sourceId = `customer:acc:${id}:${contentHash.slice(0, 16)}`;
    const processed = await processAcquiredDocument(store, {
      discovered: {
        sourceId,
        filing: { accessionNumber: `customer-${id}`, formType: "UPLOAD", filingDate: "2026-10-17", issuer: { cik: "0000000000", name: id } },
        exhibit: { filename, description: filename, exhibitType: "EX-10", sourceUrl: `fixture://customer/acc/${id}/${filename}` },
        discoverySignals: ["customer-upload-intelligence"],
      } as any,
      bytes, contentHash, provenance: "customer-upload", usageRightsReviewStatus: "UNREVIEWED",
    });
    return buildDocumentCovenantSummary({
      sourceId, documentTitle: processed.source.documentTitle || filename, issuerName: id, issuerCik: "0000000000",
      documentClass: processed.source.documentClass,
      candidates: store.loadCandidates(sourceId), definitions: store.loadDefinitions(sourceId),
      structuralNodes: store.loadStructuralNodes(sourceId), crossReferences: store.loadCrossReferences(sourceId),
    });
  } finally { rmSync(workRoot, { recursive: true, force: true }); }
}

async function main() {
  const [docsDir, outDir] = process.argv.slice(2);
  if (!docsDir || !outDir) throw new Error("usage: run-sample.ts <docsDir> <outDir>");
  mkdirSync(outDir, { recursive: true });
  const only = process.env.ONLY?.split(",");
  for (const f of readdirSync(docsDir).filter((x) => x.endsWith(".htm")).sort()) {
    const id = f.replace(/\.htm$/, "");
    if (only && !only.includes(id)) continue;
    const t0 = Date.now();
    const { text } = await extractTextAsync(readFileSync(join(docsDir, f)), f);
    writeFileSync(join(outDir, `${id}.txt`), text);
    let r: any;
    try { r = runAgreementPipeline({ sourceId: `acc-${id}`, text }); }
    catch (e) { writeFileSync(join(outDir, `${id}.json`), JSON.stringify({ id, error: String((e as Error)?.stack ?? e) }, null, 1)); console.log(id, "ERROR", String(e).slice(0, 200)); continue; }
    let customer: any = null;
    if (process.env.CUSTOMER !== "0") {
      try { customer = await customerSummary(id, readFileSync(join(docsDir, f)), f); }
      catch (e) { customer = { error: String((e as Error)?.message ?? e).slice(0, 500) }; }
    }
    const out = {
      customer,
      id, textLength: text.length, ms: Date.now() - t0, stats: r.stats,
      checklist: r.checklist,
      families: r.families,
      computedRatios: r.computedRatios,
      headroom: r.headroom,
      computedBaskets: r.computedBaskets.map((b: any) => ({ ...b, operativeText: undefined, text: undefined })),
      xbrl: r.xbrl ? { ebitda: r.xbrl.ebitda, ebitdaBaseHold: r.xbrl.ebitdaBaseHold, leverageCapacity: r.xbrl.leverageCapacity, ratioCapacity: r.xbrl.ratioCapacity, addBackTracker: r.xbrl.addBackTracker } : undefined,
    };
    writeFileSync(join(outDir, `${id}.json`), JSON.stringify(out, (_k, v) => (v instanceof Map ? Object.fromEntries(v) : typeof v === "bigint" ? String(v) : v), 1));
    console.log(id, text.length, `${Date.now() - t0}ms`, "ratios", r.computedRatios?.length ?? "n/a", "baskets", r.computedBaskets.length);
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
