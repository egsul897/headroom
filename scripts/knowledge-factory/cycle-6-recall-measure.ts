/**
 * Cycle 6 — recover useful recall without sacrificing safety.
 *
 * - Preserves Cycle 5 unsafe exclusions / non-permission gates
 * - Marks Cycle 4/5 cohorts as historical (exposed)
 * - Draws a NEW blind holdout (distinct salt)
 * - Reports TP/FP/FN, precision+recall, counsel-compile vs executable states
 *
 *   npx tsx scripts/knowledge-factory/cycle-6-recall-measure.ts
 *
 * No Neon writes. No certification. No holdout retuning as training.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { prisma } from "../../lib/prisma";
import { summarizeFromStoredMetadata } from "../../lib/product/covenant-intelligence/summarize";
import { activateSummaryItem } from "../../lib/knowledge-factory/activation/provision-candidates";
import {
  auditCandidateAgainstOperative,
  wilsonInterval,
  type CandidateForAudit,
  type FormulaMechanic,
  type IndependentAuditResult,
} from "../../lib/knowledge-factory/activation/independent-audit";
import { buildReviewReadyRecord } from "../../lib/knowledge-factory/activation/review-ready-record";

const HOLDOUT_BLOCKLIST = [/gibraltar/i, /knife.?river/i, /rock-2026/i];
const MECHANICS: FormulaMechanic[] = [
  "FLAT_AMOUNT",
  "GREATER_OF_FLAT_OR_PCT_EBITDA",
  "GREATER_OF_FLAT_OR_PCT_TOTAL_ASSETS",
];

const NEW_HOLDOUT_QUOTAS: Record<string, number> = {
  FLAT_AMOUNT: 12,
  GREATER_OF_FLAT_OR_PCT_EBITDA: 8,
  GREATER_OF_FLAT_OR_PCT_TOTAL_ASSETS: 6,
};

function rate(successes: number, n: number) {
  const w = wilsonInterval(successes, n);
  return { successes, n, rate: w.p, wilson95: { low: w.low, high: w.high } };
}

function isHoldoutDoc(sourceId: string, title?: string | null) {
  return HOLDOUT_BLOCKLIST.some((re) => re.test(`${sourceId} ${title ?? ""}`));
}

function shuffleSalt<T>(arr: T[], salt: number): T[] {
  return arr
    .map((x, i) => ({ x, k: ((i + 1) * 1103515245 + salt) % 2147483647 }))
    .sort((p, q) => p.k - q.k)
    .map((p) => p.x);
}

async function main() {
  const outDir = path.resolve("docs/intelligence-factory/cycle-6");
  mkdirSync(outDir, { recursive: true });

  const frozen61 = JSON.parse(
    readFileSync("docs/intelligence-factory/cycle-5/fixed-cohort-61.json", "utf8"),
  ) as { cases: Array<{ sourceId: string; sectionRef: string; falseExecutable: boolean; disposition: string; formulaType: string }> };
  const c5Holdout = JSON.parse(
    readFileSync("docs/intelligence-factory/cycle-5/new-holdout-audit.json", "utf8"),
  ) as { audits: Array<{ sourceId: string; sectionRef: string; disposition: string }> };

  const exposedKeys = new Set<string>([
    ...frozen61.cases.map((c) => `${c.sourceId}::${c.sectionRef}`),
    ...c5Holdout.audits.map((a) => `${a.sourceId}::${a.sectionRef}`),
  ]);

  writeFileSync(
    path.join(outDir, "historical-cohorts.json"),
    JSON.stringify(
      {
        schemaVersion: "intelligence-factory.cycle-6-historical-cohorts.v1",
        note: "Exposed / historical — do not use for iterative gate tuning as blind evaluation.",
        frozen61: { path: "docs/intelligence-factory/cycle-5/fixed-cohort-61.json", n: frozen61.cases.length, status: "HISTORICAL_EXPOSED" },
        cycle5Holdout16: {
          path: "docs/intelligence-factory/cycle-5/new-holdout-audit.json",
          n: c5Holdout.audits.length,
          status: "HISTORICAL_EXPOSED",
        },
        exposedKeyCount: exposedKeys.size,
      },
      null,
      2,
    ),
  );

  // Always include frozen-61 / Cycle-5 holdout sources so historical recall is measured
  // against the full cohort (not only the latest 400 PUBLIC_SEC_EDGAR rows).
  const cohortSourceIds = [
    ...new Set([...frozen61.cases.map((c) => c.sourceId), ...c5Holdout.audits.map((a) => a.sourceId)]),
  ];
  const cohortRows = await prisma.knowledgeSource.findMany({
    where: { sourceId: { in: cohortSourceIds } },
    select: {
      sourceId: true,
      metadata: true,
      documentTitle: true,
      issuerTicker: true,
      documentClass: true,
      originalBytesHash: true,
    },
  });
  const scanRows = await prisma.knowledgeSource.findMany({
    where: { usageRightsReviewStatus: "PUBLIC_SEC_EDGAR" as never },
    select: {
      sourceId: true,
      metadata: true,
      documentTitle: true,
      issuerTicker: true,
      documentClass: true,
      originalBytesHash: true,
    },
    take: 400,
    orderBy: { updatedAt: "desc" },
  });
  const seenSources = new Set<string>();
  const rows = [...cohortRows, ...scanRows].filter((r) => {
    if (seenSources.has(r.sourceId)) return false;
    seenSources.add(r.sourceId);
    return true;
  });

  type Act = ReturnType<typeof activateSummaryItem>;
  const activations: Array<{ act: Act; item: NonNullable<ReturnType<typeof summarizeFromStoredMetadata>>["items"][number]; row: (typeof rows)[0] }> = [];
  const byMechanic = new Map<string, CandidateForAudit[]>();
  for (const m of MECHANICS) byMechanic.set(m, []);

  let discoveries = 0;
  let executable = 0;
  let counselEligible = 0;
  const blockedReasons: Record<string, number> = {};

  for (const row of rows) {
    if (isHoldoutDoc(row.sourceId, row.documentTitle)) continue;
    const summary = summarizeFromStoredMetadata(row.metadata);
    if (!summary?.items?.length) continue;
    for (const item of summary.items) {
      const act = activateSummaryItem({ sourceId: row.sourceId, item });
      activations.push({ act, item, row });
      if (act.formulaType) discoveries += 1;
      if (act.executableEligible) {
        executable += 1;
        const ft = act.formulaType!;
        if (byMechanic.has(ft)) {
          byMechanic.get(ft)!.push({
            sourceId: row.sourceId,
            sectionRef: act.sectionRef,
            heading: act.heading,
            formulaType: ft,
            thresholdValue: act.thresholdValue,
            params: act.params,
            posture: act.posture,
            families: act.families,
            excerptEvidence: act.excerptEvidence,
            issuerTicker: row.issuerTicker,
            documentClass: row.documentClass,
            documentTitle: row.documentTitle,
          });
        }
      }
      if (act.counselCompileEligible) counselEligible += 1;
      if (!act.executableEligible) {
        const reason = act.readiness;
        blockedReasons[reason] = (blockedReasons[reason] ?? 0) + 1;
      }
    }
  }

  // --- Frozen-61 recall (historical gold) — activate each case explicitly ---
  const actByKey = new Map(activations.map((a) => [`${a.act.sourceId}::${a.act.sectionRef}`, a]));
  const cohortMeta = new Map(cohortRows.map((r) => [r.sourceId, r]));
  const goldPos = frozen61.cases.filter((c) =>
    c.disposition === "REVIEW_READY_EXECUTABLE" || c.disposition === "REVIEW_READY_WITH_GAPS",
  );
  const goldNeg = frozen61.cases.filter((c) => c.falseExecutable);
  let tp = 0;
  let fn = 0;
  let tn = 0;
  let fp = 0;
  const fnReasons: Record<string, number> = {};
  const fnDetail: Array<{ sourceId: string; sectionRef: string; readiness: string; formulaType: string }> =
    [];

  function activateCohortCase(c: { sourceId: string; sectionRef: string }) {
    const row = cohortMeta.get(c.sourceId);
    if (!row) return null;
    const summary = summarizeFromStoredMetadata(row.metadata);
    const item = summary?.items?.find((i) => i.sectionRef === c.sectionRef);
    if (!item) return null;
    const act = activateSummaryItem({ sourceId: c.sourceId, item });
    return { act, item, row };
  }

  for (const c of goldPos) {
    const hit = activateCohortCase(c) ?? actByKey.get(`${c.sourceId}::${c.sectionRef}`) ?? null;
    if (hit?.act.executableEligible) tp += 1;
    else {
      fn += 1;
      const r = hit?.act.readiness ?? "MISSING";
      fnReasons[r] = (fnReasons[r] ?? 0) + 1;
      fnDetail.push({
        sourceId: c.sourceId,
        sectionRef: c.sectionRef,
        readiness: r,
        formulaType: c.formulaType,
      });
    }
  }
  for (const c of goldNeg) {
    const hit = activateCohortCase(c) ?? actByKey.get(`${c.sourceId}::${c.sectionRef}`) ?? null;
    if (hit?.act.executableEligible) fp += 1;
    else tn += 1;
  }

  // --- C5 RR-with-gaps: must not be counsel-compile-eligible (audit-backed) ---
  const gaps = c5Holdout.audits.filter((a) => a.disposition === "REVIEW_READY_WITH_GAPS");
  const gapRecheck = [];
  // load bytes early for gap re-audit
  const earlyHashBySource = new Map(
    rows.filter((r) => r.originalBytesHash).map((r) => [r.sourceId, r.originalBytesHash!]),
  );
  const earlyHashes = [...new Set([...gaps.map((g) => earlyHashBySource.get(g.sourceId)!).filter(Boolean)])];
  const earlyBlobs = earlyHashes.length
    ? await prisma.documentByteObject.findMany({
        where: { contentHash: { in: earlyHashes } },
        select: { contentHash: true, bytes: true },
      })
    : [];
  const earlyText = new Map(earlyBlobs.map((b) => [b.contentHash, Buffer.from(b.bytes).toString("utf8")]));

  for (const g of gaps) {
    const hit = activateCohortCase(g) ?? actByKey.get(`${g.sourceId}::${g.sectionRef}`) ?? null;
    let counselCompileEligible = hit?.act.counselCompileEligible ?? false;
    let completenessReasons = hit?.act.completeness?.reasons ?? [];
    let certState: string | null = null;
    if (hit) {
      const full = earlyText.get(earlyHashBySource.get(g.sourceId) ?? "") ?? "";
      const cand: CandidateForAudit = {
        sourceId: g.sourceId,
        sectionRef: hit.act.sectionRef,
        heading: hit.act.heading,
        formulaType: hit.act.formulaType ?? "FLAT_AMOUNT",
        thresholdValue: hit.act.thresholdValue,
        params: hit.act.params,
        posture: hit.act.posture,
        families: hit.act.families,
        excerptEvidence: hit.act.excerptEvidence,
      };
      const audit = auditCandidateAgainstOperative({ candidate: cand, fullDocumentText: full });
      const rec = buildReviewReadyRecord({
        sourceId: g.sourceId,
        item: hit.item,
        audit,
        documentClass: hit.row.documentClass,
        issuerTicker: hit.row.issuerTicker,
      });
      counselCompileEligible = rec.counselCompileEligible;
      completenessReasons = rec.completenessReasons;
      certState = rec.certificationState;
      // Always report audit-backed promotionState — never mix act.promotionState
      // (short-excerpt completeness) with rec.counselCompileEligible (full-window).
      gapRecheck.push({
        sourceId: g.sourceId,
        sectionRef: g.sectionRef,
        readiness: hit.act.readiness,
        executableEligible: hit.act.executableEligible,
        counselCompileEligible,
        certificationState: certState,
        promotionState: rec.promotionState,
        activationPromotionState: hit.act.promotionState,
        promotionStateConsistent: rec.promotionState !== "COUNSEL_COMPILE_ELIGIBLE" || counselCompileEligible,
        completenessReasons,
        forcedIncomplete: !counselCompileEligible,
      });
      continue;
    }
    gapRecheck.push({
      sourceId: g.sourceId,
      sectionRef: g.sectionRef,
      readiness: "MISSING",
      executableEligible: false,
      counselCompileEligible: false,
      certificationState: null,
      promotionState: null,
      activationPromotionState: null,
      promotionStateConsistent: true,
      completenessReasons: [],
      forcedIncomplete: true,
    });
  }

  // --- New blind holdout (exclude all exposed keys) ---
  const hashBySource = new Map(rows.filter((r) => r.originalBytesHash).map((r) => [r.sourceId, r.originalBytesHash!]));
  const hashes = [...new Set(hashBySource.values())];
  const blobs = hashes.length
    ? await prisma.documentByteObject.findMany({
        where: { contentHash: { in: hashes } },
        select: { contentHash: true, bytes: true },
      })
    : [];
  const textByHash = new Map(blobs.map((b) => [b.contentHash, Buffer.from(b.bytes).toString("utf8")]));

  const newHoldout: CandidateForAudit[] = [];
  for (const m of MECHANICS) {
    const pool = shuffleSalt(
      (byMechanic.get(m) ?? []).filter((c) => !exposedKeys.has(`${c.sourceId}::${c.sectionRef}`)),
      0xc6c6, // Cycle 6 salt — distinct from Cycle 4/5
    );
    newHoldout.push(...pool.slice(0, NEW_HOLDOUT_QUOTAS[m] ?? 0));
  }

  const holdoutAudits: IndependentAuditResult[] = [];
  const holdoutRr = [];
  for (const c of newHoldout) {
    const full = textByHash.get(hashBySource.get(c.sourceId) ?? "") ?? "";
    const audit = auditCandidateAgainstOperative({ candidate: c, fullDocumentText: full });
    holdoutAudits.push(audit);
    const bound = actByKey.get(`${c.sourceId}::${c.sectionRef}`);
    if (bound) {
      holdoutRr.push(
        buildReviewReadyRecord({
          sourceId: c.sourceId,
          item: bound.item,
          audit,
          documentClass: c.documentClass,
          issuerTicker: c.issuerTicker,
        }),
      );
    }
  }

  const formulaOk = holdoutAudits.filter((a) => a.fields.find((f) => f.field === "formula")?.ok === true);
  const threshOk = holdoutAudits.filter((a) => a.fields.find((f) => f.field === "threshold")?.ok === true);
  const falseExec = holdoutAudits.filter((a) => a.falseExecutableClassification);
  const materialOm = holdoutAudits.filter((a) => a.materialOmissions.length > 0);
  const falseFavorable = holdoutAudits.filter(
    (a) =>
      a.sufficientForExecutableEvaluation &&
      (a.fields.find((f) => f.field === "formula")?.ok === false ||
        a.fields.find((f) => f.field === "threshold")?.ok === false),
  );

  const report = {
    schemaVersion: "intelligence-factory.cycle-6-recall.v1",
    generatedAt: new Date().toISOString(),
    paidInferenceCostUsd: 0,
    neonMutations: 0,
    safetyPreserved: {
      priorFalseExecutableDemoted: `${tn}/${goldNeg.length}`,
      nonPermissionGates: ["EVENTS_OF_DEFAULT", "JUDGMENT", "MANDATORY_PREPAYMENTS", "INDEMNITY", "REPORTING"],
      builderLeverageStillBlocked: true,
      note: "No gate relaxation for builder/leverage; Agents 2/3/5 own recovery.",
    },
    population: {
      sourcesScanned: rows.length,
      formulaDiscoveries: discoveries,
      executableFormulaOnly: executable,
      counselCompileEligible: counselEligible,
      productionAuthoritative: 0,
      blockedReasonsTop: Object.entries(blockedReasons)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 12),
    },
    frozen61Recall: {
      status: "HISTORICAL_EXPOSED",
      goldPositives: goldPos.length,
      goldNegatives: goldNeg.length,
      truePositives: tp,
      falseNegatives: fn,
      trueNegatives: tn,
      falsePositives: fp,
      precision: rate(tp, tp + fp),
      recall: rate(tp, tp + fn),
      falseNegativeReasons: fnReasons,
      falseNegativeDetail: fnDetail,
    },
    cycle5GapsRecheck: {
      n: gaps.length,
      allForcedIncompleteForCompile: gapRecheck.every((g) => g.forcedIncomplete),
      counselCompileEligibleCount: gapRecheck.filter((g) => g.counselCompileEligible).length,
      records: gapRecheck,
    },
    newBlindHoldout: {
      status: "BLIND_UNEVALUATED_FOR_TUNING",
      salt: "0xc6c6",
      n: holdoutAudits.length,
      quotas: NEW_HOLDOUT_QUOTAS,
      excludedExposedKeys: exposedKeys.size,
      excludedBlindDocs: ["gibraltar", "knife-river"],
      formulaPrecision: rate(formulaOk.length, holdoutAudits.length),
      thresholdPrecision: rate(threshOk.length, holdoutAudits.length),
      falseExecutableRate: rate(falseExec.length, holdoutAudits.length),
      materialOmissionRate: rate(materialOm.length, holdoutAudits.length),
      falseFavorableRate: rate(falseFavorable.length, holdoutAudits.length),
      counselCompileEligible: holdoutRr.filter((r) => r.counselCompileEligible).length,
      reviewReadyUnverified: holdoutRr.filter((r) => r.certificationState === "REVIEW_READY_UNVERIFIED").length,
      blockedIncomplete: holdoutRr.filter((r) => r.certificationState === "BLOCKED_INCOMPLETE_OPERATIVE").length,
    },
    ownership: {
      agent2: "definitions + financial inputs for growers",
      agent3: "builder/leverage formula after defs (still blocked)",
      agent5: "structure conditions[] before counsel-compile",
    },
  };

  writeFileSync(path.join(outDir, "recall-report.json"), JSON.stringify(report, null, 2));
  writeFileSync(
    path.join(outDir, "new-blind-holdout.json"),
    JSON.stringify(
      {
        schemaVersion: "intelligence-factory.cycle-6-blind-holdout.v1",
        status: "BLIND",
        n: holdoutAudits.length,
        audits: holdoutAudits,
        reviewReady: holdoutRr,
      },
      null,
      2,
    ),
  );

  console.log(
    JSON.stringify(
      {
        populationExecutable: executable,
        counselCompileEligible: counselEligible,
        frozen61: { tp, fn, tn, fp, recall: report.frozen61Recall.recall, precision: report.frozen61Recall.precision },
        gapsCompileEligible: gapRecheck.filter((g) => g.counselCompileEligible).length,
        newHoldout: {
          n: holdoutAudits.length,
          formulaPrecision: report.newBlindHoldout.formulaPrecision,
          falseExec: report.newBlindHoldout.falseExecutableRate,
          counselEligible: report.newBlindHoldout.counselCompileEligible,
        },
      },
      null,
      2,
    ),
  );

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
