#!/usr/bin/env tsx
/**
 * Dev-set coverage report (baseline metric for the product target on PR 383):
 *   - provision categorization: share of customer-summary items categorized OTHER, with their recorded otherReason;
 *   - limited baskets: share computed / needs-input / uncomputed per agreement;
 *   - financial covenant levels: every maintenance level / level-by-date schedule the pipeline emits, and every
 *     ratio threshold with its test kind (for before/after review).
 *
 *   npx tsx scripts/covenant-learning-factory/dev-set-coverage.ts <fileList.txt> <out.json>
 *
 * The file list holds one document path per line (TRAIN_DEV / dev-set documents only). Any path whose package is a
 * HELD_OUT or BLIND cohort must not be listed; the script refuses paths naming a protected package or folder.
 * Deterministic, offline: no network, no Neon, no AI.
 */
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { join, basename, dirname } from "node:path";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import { extractTextAsync } from "../../lib/knowledge-factory/pipeline/text";
import { runAgreementPipeline } from "../../lib/covenant-learning-factory/pipeline/agreement-pipeline";
import { CorpusStore, defaultCorpusPaths } from "../../lib/knowledge-factory/store/corpus-store";
import { processAcquiredDocument } from "../../lib/knowledge-factory/pipeline/run";
import { buildDocumentCovenantSummary } from "../../lib/product/covenant-intelligence/summarize";

const PROTECTED = /held[-_ ]?out|blind|frozen|sealed|mhk-2026-credit-agreement/i;

async function customerSummary(id: string, bytes: Buffer, filename: string) {
  const workRoot = mkdtempSync(join(tmpdir(), "devcov-"));
  try {
    const store = new CorpusStore(defaultCorpusPaths(join(workRoot, "corpus")));
    const contentHash = createHash("sha256").update(bytes).digest("hex");
    const sourceId = `customer:dev:${id}:${contentHash.slice(0, 16)}`;
    const processed = await processAcquiredDocument(store, {
      discovered: {
        sourceId,
        filing: { accessionNumber: `dev-${id}`, formType: "UPLOAD", filingDate: "2026-10-17", issuer: { cik: "0000000000", name: id } },
        exhibit: { filename, description: filename, exhibitType: "EX-10", sourceUrl: `fixture://dev/${id}/${filename}` },
        discoverySignals: ["customer-upload-intelligence"],
      } as never,
      bytes, contentHash, provenance: "customer-upload", usageRightsReviewStatus: "UNREVIEWED",
    } as never);
    return buildDocumentCovenantSummary({
      sourceId, documentTitle: processed.source.documentTitle || filename, issuerName: id, issuerCik: "0000000000",
      documentClass: processed.source.documentClass,
      candidates: store.loadCandidates(sourceId), definitions: store.loadDefinitions(sourceId),
      structuralNodes: store.loadStructuralNodes(sourceId), crossReferences: store.loadCrossReferences(sourceId),
    });
  } finally { rmSync(workRoot, { recursive: true, force: true }); }
}

const pct = (a: number, b: number) => (b ? Math.round((1000 * a) / b) / 10 : null);

async function main() {
  const [list, outPath] = process.argv.slice(2);
  if (!list || !outPath) throw new Error("usage: dev-set-coverage.ts <fileList.txt> <out.json>");
  const files = readFileSync(list, "utf8").split("\n").map((s) => s.trim()).filter(Boolean);
  const report: Record<string, unknown>[] = [];
  for (const p of files) {
    if (PROTECTED.test(p)) throw new Error(`refusing a protected (HELD_OUT/BLIND/FROZEN) document: ${p}`);
    const id = basename(dirname(p)) + "/" + basename(p);
    const bytes = readFileSync(p);
    const { text } = await extractTextAsync(bytes, basename(p));
    const r = runAgreementPipeline({ sourceId: `dev-${createHash("sha256").update(id).digest("hex").slice(0, 8)}`, text }) as unknown as Record<string, any>;
    const baskets = (r.computedBaskets ?? []) as Array<{ capKind: string; capStatus: string; category: string; sectionRef: string; capCanonical: string | null }>;
    const limited = baskets.filter((b) => b.capKind !== "UNLIMITED" && b.category !== "UNLIMITED");
    const by = (s: string) => limited.filter((b) => b.capStatus === s).length;
    let items: Array<{ category: string; otherReason?: string; sectionRef: string; heading: string }> = [];
    try { items = ((await customerSummary(id.replace(/[^A-Za-z0-9]/g, "_"), bytes, basename(p))) as { items: typeof items }).items; } catch { items = []; }
    const other = items.filter((i) => i.category === "OTHER");
    const reasons: Record<string, number> = {};
    for (const i of other) { const k = (i.otherReason ?? "(none recorded)").replace(/:.*/, ""); reasons[k] = (reasons[k] ?? 0) + 1; }
    report.push({
      id,
      categorization: { items: items.length, other: other.length, otherPct: pct(other.length, items.length), otherWithReason: other.filter((i) => !!i.otherReason).length, otherReasons: reasons },
      limitedBaskets: { total: limited.length, computed: by("COMPUTED"), needsInput: by("NEEDS_INPUT"), uncomputed: limited.length - by("COMPUTED") - by("NEEDS_INPUT"), computedPct: pct(by("COMPUTED"), limited.length), needsInputPct: pct(by("NEEDS_INPUT"), limited.length) },
      // Adapted to this tree: runAgreementPipeline exposes computed ratios
      // (r.ratios[].thresholds) rather than a headroom row list; each
      // threshold row carries testKind when the unified parser confirmed it.
      ratioThresholds: ((r.ratios ?? []) as Array<Record<string, any>>).flatMap((ratio) => ((ratio.thresholds ?? []) as Array<Record<string, any>>).map((t) => ({ name: ratio.displayName, limit: t.canonical, direction: t.direction, testKind: t.testKind ?? null, sectionRef: t.sectionRef, status: t.headroomStatus }))),
      maintenanceLevels: ((r.maintenanceLevels ?? []) as Array<Record<string, any>>).map((m) => ({ sectionRef: m.sectionRef, testKind: m.testKind, metric: m.metric, ratioName: m.ratioName, direction: m.direction, levelStatus: m.levelStatus, level: m.level, schedule: (m.schedule ?? []).map((s: any) => `${s.from ?? "-inf"}..${s.to ?? "+inf"}=${s.level}`), modifiers: (m.modifiers ?? []).map((x: any) => `${x.kind}:${x.amount ?? "?"}`), missing: m.missing })),
    });
    console.error(id, "items", items.length, "other", other.length, "limited", limited.length);
  }
  const tot = (f: (x: any) => number) => report.reduce((s, x) => s + f(x), 0);
  const summary = {
    agreements: report.length,
    items: tot((x) => x.categorization.items), other: tot((x) => x.categorization.other),
    otherPct: pct(tot((x) => x.categorization.other), tot((x) => x.categorization.items)),
    limitedBaskets: tot((x) => x.limitedBaskets.total), computed: tot((x) => x.limitedBaskets.computed), needsInput: tot((x) => x.limitedBaskets.needsInput), uncomputed: tot((x) => x.limitedBaskets.uncomputed),
    maintenanceLevels: tot((x) => x.maintenanceLevels.length),
  };
  writeFileSync(outPath, JSON.stringify({ summary, report }, null, 1));
  console.log(JSON.stringify(summary));
}
main().catch((e) => { console.error(e); process.exit(1); });
