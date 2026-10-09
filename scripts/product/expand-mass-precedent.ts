/**
 * Mass precedent expansion: analyze diverse Neon-backed financing docs,
 * exercise transaction questions, persist covenantSummary (DISCOVERED only).
 * Deterministic — zero paid inference. No certification promotion.
 *
 *   npx tsx scripts/product/expand-mass-precedent.ts --limit=25
 *   npx tsx scripts/product/expand-mass-precedent.ts --limit=40 --min-bytes=80000 --refresh-stale
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { prisma } from "../../lib/prisma";
import { loadDurableSourceBytes } from "../../lib/knowledge-factory/preservation/durable-store";
import { extractTextAsync } from "../../lib/knowledge-factory/pipeline/text";
import {
  extractStructure,
  discoverDefinitions,
  discoverCrossReferences,
} from "../../lib/knowledge-factory/pipeline/structural";
import { discoverCovenantCandidates } from "../../lib/knowledge-factory/pipeline/candidates";
import { extractConditionsAndExceptions } from "../../lib/knowledge-factory/pipeline/conditions";
import { buildDocumentCovenantSummary } from "../../lib/product/covenant-intelligence/summarize";
import { answerFromSummaryItems } from "../../lib/product/covenant-intelligence/ask-retrieve";

const QUESTIONS = [
  "Can the borrower incur additional unsecured indebtedness?",
  "What restrictions apply to additional secured debt?",
  "What restricted-payment / dividend baskets are available?",
  "What investments or acquisitions are permitted?",
  "What asset-sale restrictions apply?",
  "Can debt be refinanced or replaced?",
  "What guarantee capacity exists for subsidiaries?",
  "How do debt and lien permissions interact?",
  "Which baskets share capacity or use an Available Amount builder?",
  "What incremental facility capacity paths are available?",
  "What constitutes Consolidated EBITDA?",
];

const FINANCING_RE =
  /credit agreement|indenture|intercreditor|facility|term loan|revolving|amendment|joinder|guarantee|collateral|abl|senior notes|notes due|loan agreement|supplemental indenture/i;

function argInt(name: string, fallback: number): number {
  const hit = process.argv.find((a) => a.startsWith(`${name}=`));
  if (!hit) return fallback;
  const n = Number(hit.split("=")[1]);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function mechStats(items: ReturnType<typeof buildDocumentCovenantSummary>["items"]) {
  const allBaskets = items.flatMap((i) => i.materialBasketsThresholds ?? []);
  return {
    growerBaskets: allBaskets.filter((b) => /Greater-of|grower/i.test(b)).length,
    sharedCapacitySignals: allBaskets.filter((b) => /Shared|aggregated capacity/i.test(b)).length,
    builderSignals: allBaskets.filter((b) => /Available Amount|Builder/i.test(b)).length,
    noaSignals: allBaskets.filter((b) => /Not Otherwise Applied|NOA /i.test(b)).length,
    antiStackSignals: allBaskets.filter((b) => /Anti-stacking|without-duplication/i.test(b)).length,
    reclassSignals: allBaskets.filter((b) => /reclassif|Divide-and-classify/i.test(b)).length,
    incrementalPathSignals: allBaskets.filter((b) =>
      /Incremental path|Incremental Amount is a multi-component/i.test(b),
    ).length,
    ratioThresholds: allBaskets.filter((b) =>
      /Ratio threshold|Pro forma leverage|Borrower election/i.test(b),
    ).length,
    itemsWithDependencies: items.filter((i) => (i.dependencies?.length ?? 0) > 0).length,
    itemsWithConditions: items.filter((i) => (i.conditions?.length ?? 0) > 0).length,
    itemsWithExceptions: items.filter((i) => (i.exceptions?.length ?? 0) > 0).length,
    generalProhibitions: items.filter((i) => i.posture === "GENERAL_PROHIBITION").length,
    basketSignals: allBaskets.length,
  };
}

function alreadyProcessedRecently(meta: Record<string, unknown>, hours: number): boolean {
  const refresh = meta.definitionRefresh as { at?: string; challenge?: string } | undefined;
  const at = refresh?.at;
  if (!at) return false;
  if (refresh?.challenge === "mass-precedent-expansion") {
    const age = Date.now() - new Date(at).getTime();
    return age < hours * 3600_000;
  }
  // Treat other recent refreshes as skippable unless --refresh-stale
  const age = Date.now() - new Date(at).getTime();
  return age < hours * 3600_000;
}

async function analyzeAndPersist(sourceId: string) {
  const row = await prisma.knowledgeSource.findUnique({ where: { sourceId } });
  if (!row?.storageRef) return { sourceId, error: "MISSING_BYTES" as const };

  const { bytes } = await loadDurableSourceBytes({ sourceId });
  const { text } = await extractTextAsync(bytes, row.exhibitFilename || "ex.htm");
  const structural = extractStructure(sourceId, text);
  const scan = structural.normalizedText;
  const definitions = discoverDefinitions(sourceId, scan, structural.nodes);
  const xrefs = discoverCrossReferences(sourceId, scan);
  const candidates = discoverCovenantCandidates(sourceId, scan, structural.nodes);
  const conditions = extractConditionsAndExceptions(sourceId, scan, structural.nodes);
  const summary = buildDocumentCovenantSummary({
    sourceId,
    documentTitle: row.documentTitle || sourceId,
    issuerName: row.issuerName ?? undefined,
    issuerCik: row.issuerCik,
    documentClass: row.documentClass,
    candidates,
    definitions,
    structuralNodes: structural.nodes,
    crossReferences: xrefs,
  });
  const mech = mechStats(summary.items);

  const answers = QUESTIONS.map((question) => {
    const answer = answerFromSummaryItems({
      question,
      items: summary.items.map((i) => ({ ...i, sourceId })),
      definedTerms: definitions.map((d) => ({
        term: d.term,
        excerpt: (d.excerpt ?? "").slice(0, 400),
      })),
      researchOnly: true,
      limit: 5,
    });
    const dualRegime =
      /secured debt/i.test(question) &&
      /\[LIENS REGIME\]/i.test(answer.detail) &&
      /\[INDEBTEDNESS REGIME\]/i.test(answer.detail);
    return {
      question,
      kind: answer.kind,
      sections: answer.citations.map((c) => c.sectionRef).slice(0, 5),
      defLead: answer.citations.some((c) => /^Definition:/i.test(c.sectionRef)),
      dualRegime: /secured debt/i.test(question) ? dualRegime : undefined,
      answered: answer.kind === "answered",
      citationCount: answer.citations.length,
      preview: answer.detail.slice(0, 220).replace(/\s+/g, " "),
    };
  });

  const textSignals = {
    greaterOf: (text.match(/\bgreater of\b/gi) || []).length,
    availableAmount: (text.match(/\bAvailable Amount\b/g) || []).length,
    takenTogether: (text.match(/\btaken together with\b/gi) || []).length,
    incremental: (text.match(/\bIncremental (?:Cap|Amount|Facility|Facilities)\b/gi) || []).length,
    notOtherwiseApplied: (text.match(/\bNot Otherwise Applied\b/g) || []).length,
  };

  const coverageGaps = {
    growerUnderExtracted:
      textSignals.greaterOf > 10 && mech.growerBaskets < Math.min(8, Math.floor(textSignals.greaterOf / 8)),
    missingBuilderWhileTextHasAA: textSignals.availableAmount > 0 && mech.builderSignals === 0,
    missingSharedWhileTextHasTT: textSignals.takenTogether > 3 && mech.sharedCapacitySignals === 0,
    missingIncrementalPaths: textSignals.incremental > 2 && mech.incrementalPathSignals === 0,
    missingNoaWhileTextHasNoa: textSignals.notOtherwiseApplied > 0 && mech.noaSignals === 0,
  };

  const prev =
    row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
      ? (row.metadata as Record<string, unknown>)
      : {};
  await prisma.knowledgeSource.update({
    where: { sourceId },
    data: {
      metadata: JSON.parse(
        JSON.stringify({
          ...prev,
          analysis: {
            structuralNodes: structural.nodes.length,
            definitions: definitions.length,
            covenantCandidates: candidates.length,
            crossReferences: xrefs.length,
            conditionsExceptions: conditions.length,
          },
          covenantSummary: summary,
          definitionRefresh: {
            scanner: "definition-scan.v2-entities",
            defs: definitions.length,
            candidates: candidates.length,
            at: new Date().toISOString(),
            paidInferenceCalls: 0,
            challenge: "mass-precedent-expansion",
          },
          promotedToLegalTruth: 0,
        }),
      ),
    },
  });

  return {
    sourceId,
    title: row.documentTitle || sourceId,
    issuer: row.issuerName || "?",
    documentClass: row.documentClass,
    byteSize: row.byteSize,
    defs: definitions.length,
    candidates: candidates.length,
    conditions: conditions.length,
    xrefs: xrefs.length,
    summaryItems: summary.items.length,
    families: Object.keys(summary.countsByCategory),
    mechanics: mech,
    textSignals,
    coverageGaps,
    answers,
    answeredCount: answers.filter((a) => a.answered).length,
    dualRegimeOk: answers.find((a) => a.dualRegime != null)?.dualRegime ?? null,
    persisted: true,
    promotedToLegalTruth: 0,
  };
}

async function main() {
  const limit = argInt("--limit", 25);
  const minBytes = argInt("--min-bytes", 80_000);
  const refreshStale = process.argv.includes("--refresh-stale");
  const skipHours = argInt("--skip-hours", 6);

  const rows = await prisma.knowledgeSource.findMany({
    where: {
      storageRef: { not: null },
      OR: [
        { byteSize: { gte: minBytes } },
        { sourceId: { startsWith: "research:" } },
        { sourceId: { startsWith: "fixture:" } },
        { sourceId: { startsWith: "edgar:" } },
      ],
    },
    select: {
      sourceId: true,
      documentTitle: true,
      documentClass: true,
      issuerName: true,
      exhibitFilename: true,
      byteSize: true,
      metadata: true,
      provenance: true,
    },
    orderBy: [{ byteSize: "desc" }, { sourceId: "asc" }],
    take: 8_000,
  });

  const alreadyThisChallenge = new Set<string>();
  const candidates = [];
  for (const row of rows) {
    const hay = `${row.documentTitle || ""} ${row.exhibitFilename || ""} ${row.documentClass || ""}`;
    if (!FINANCING_RE.test(hay) && !/CREDIT|INDENTURE|AMENDMENT|INTERCREDITOR|ABL|TERM_LOAN/i.test(row.documentClass || "")) {
      continue;
    }
    const meta =
      row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
        ? (row.metadata as Record<string, unknown>)
        : {};
    const summary = meta.covenantSummary as { items?: unknown[]; schemaVersion?: string } | undefined;
    const items = Array.isArray(summary?.items) ? summary!.items!.length : 0;
    const analysis = meta.analysis as { covenantCandidates?: number; definitions?: number } | undefined;
    const refresh = meta.definitionRefresh as { challenge?: string; at?: string } | undefined;
    if (refresh?.challenge === "mass-precedent-expansion") {
      alreadyThisChallenge.add(row.sourceId);
      if (!refreshStale) continue;
    }
    if (!refreshStale && alreadyProcessedRecently(meta, skipHours) && items >= 40) continue;

    // Prefer substantive full agreements with recoverable structure over thin/OCR shells.
    let priority = 0;
    priority += Math.min(25, Math.floor((row.byteSize || 0) / 150_000));
    const defs = analysis?.definitions ?? 0;
    const cands = analysis?.covenantCandidates ?? 0;
    // Known-good structure gets a large boost; chronic thins are only kept for diversity.
    if (cands >= 100 || items >= 60) priority += 40;
    else if (cands >= 40 || items >= 30) priority += 28;
    else if (cands >= 15 || items >= 15) priority += 12;
    else if (row.sourceId.startsWith("ehb:") && items < 15) priority -= 25;
    if (defs >= 100) priority += 18;
    else if (defs >= 40) priority += 10;
    if (/CREDIT_AGREEMENT|TERM_LOAN|ABL|INDENTURE/i.test(row.documentClass || "")) priority += 14;
    if (/INDENTURE|INTERCREDITOR|ABL/i.test(row.documentClass || hay)) priority += 10;
    if (/research:cbcfl:/i.test(row.sourceId)) priority += 22;
    if (/^edgar:/i.test(row.sourceId) && (row.byteSize || 0) > 400_000) priority += 16;
    if (/^fixture:/i.test(row.sourceId) && /credit-agreement|credit_agreement|credit agreement/i.test(hay)) {
      priority += 18;
    }
    if (/amendment|joinder|supplemental indenture/i.test(hay) && cands < 40) priority -= 6;
    // De-prioritize already-system-challenged staples slightly so new issuers rise
    if (/gibraltar|chewy|brightview|livenation|alkermes|aeo2|conmed/i.test(row.sourceId + hay)) {
      priority -= 12;
    }
    // Skip empty shells that previously failed to yield candidates
    if (cands > 0 && cands < 3 && defs < 5 && items < 3) priority -= 40;
    candidates.push({
      sourceId: row.sourceId,
      issuer: row.issuerName || "?",
      title: (row.documentTitle || "").slice(0, 80),
      bytes: row.byteSize || 0,
      items,
      priority,
      class: row.documentClass,
    });
  }

  candidates.sort((a, b) => b.priority - a.priority || b.bytes - a.bytes);
  const selected = candidates.slice(0, limit);

  console.log(
    JSON.stringify(
      {
        pool: candidates.length,
        selected: selected.length,
        skippedRecentMass: alreadyThisChallenge.size,
        minBytes,
        refreshStale,
      },
      null,
      2,
    ),
  );

  const results = [];
  for (const s of selected) {
    console.log(`\n=== ${s.sourceId} (${s.issuer}) bytes=${s.bytes} priorItems=${s.items} prio=${s.priority} ===`);
    try {
      const r = await analyzeAndPersist(s.sourceId);
      if ("error" in r) {
        console.log(`  ERROR ${r.error}`);
        results.push(r);
        continue;
      }
      results.push(r);
      console.log(
        `  defs=${r.defs} cands=${r.candidates} items=${r.summaryItems} growers=${r.mechanics.growerBaskets} builders=${r.mechanics.builderSignals} incr=${r.mechanics.incrementalPathSignals} answered=${r.answeredCount}/${QUESTIONS.length} dual=${r.dualRegimeOk}`,
      );
      console.log(`  gaps=${JSON.stringify(r.coverageGaps)}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`  FAIL ${msg}`);
      results.push({ sourceId: s.sourceId, error: msg });
    }
  }

  const ok = results.filter((r) => "persisted" in r && r.persisted);
  const outDir = path.resolve("docs/product/covenant-intelligence-loop");
  mkdirSync(outDir, { recursive: true });
  const payload = {
    generatedAt: new Date().toISOString(),
    paidInferenceCalls: 0,
    promotedToLegalTruth: 0,
    verificationStatus: "AGENT_REVIEWED_PROVISIONAL",
    challenge: "mass-precedent-expansion",
    selected: selected.map((s) => s.sourceId),
    totals: {
      attempted: results.length,
      persisted: ok.length,
      dualRegimeTrue: ok.filter((r) => "dualRegimeOk" in r && r.dualRegimeOk === true).length,
      dualRegimeFalse: ok.filter((r) => "dualRegimeOk" in r && r.dualRegimeOk === false).length,
      withGaps: ok.filter(
        (r) => "coverageGaps" in r && Object.values(r.coverageGaps).some(Boolean),
      ).length,
      sumSummaryItems: ok.reduce((n, r) => n + (("summaryItems" in r && r.summaryItems) || 0), 0),
      sumBasketSignals: ok.reduce(
        (n, r) => n + (("mechanics" in r && r.mechanics?.basketSignals) || 0),
        0,
      ),
      sumGrowers: ok.reduce((n, r) => n + (("mechanics" in r && r.mechanics?.growerBaskets) || 0), 0),
      sumBuilders: ok.reduce((n, r) => n + (("mechanics" in r && r.mechanics?.builderSignals) || 0), 0),
      sumIncremental: ok.reduce(
        (n, r) => n + (("mechanics" in r && r.mechanics?.incrementalPathSignals) || 0),
        0,
      ),
    },
    results,
  };
  writeFileSync(path.join(outDir, "latest-mass-precedent-expansion.json"), JSON.stringify(payload, null, 2));
  writeFileSync(
    path.join(outDir, `mass-precedent-expansion-${new Date().toISOString().replace(/[:.]/g, "-")}.json`),
    JSON.stringify(payload, null, 2),
  );
  console.log(JSON.stringify(payload.totals, null, 2));
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  try {
    await prisma.$disconnect();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
