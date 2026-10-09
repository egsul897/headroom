/**
 * Cycle 4 — stratified independent legal audit of formula candidates.
 *
 * Loads operative bytes from Neon DocumentByteObject, audits against
 * operative text (not summary token overlap), emits rates + review-ready
 * records for the existing counsel-compile path (PR #227).
 *
 *   npx tsx scripts/knowledge-factory/audit-formula-candidates.ts
 *   npx tsx scripts/knowledge-factory/audit-formula-candidates.ts --per-mechanic=12
 *
 * No Neon writes. No certification. Gibraltar/Knife River holdouts excluded.
 */
import { mkdirSync, writeFileSync } from "node:fs";
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
import {
  computeLeverageMetrics,
  evaluateProvision,
  type CovenantProvisionInput,
  type FinancialSnapshotInput,
} from "../../lib/covenant-engine";

const HOLDOUT_BLOCKLIST = [/gibraltar/i, /knife.?river/i, /rock-2026/i];

const MECHANICS: FormulaMechanic[] = [
  "FLAT_AMOUNT",
  "BUILDER_BASKET",
  "GREATER_OF_FLAT_OR_PCT_EBITDA",
  "GREATER_OF_FLAT_OR_PCT_TOTAL_ASSETS",
  "LEVERAGE_RATIO_ROOM",
];

/** Oversample complex / failure-prone mechanics. */
const DEFAULT_QUOTAS: Record<FormulaMechanic, number> = {
  FLAT_AMOUNT: 12,
  BUILDER_BASKET: 14,
  GREATER_OF_FLAT_OR_PCT_EBITDA: 16,
  GREATER_OF_FLAT_OR_PCT_TOTAL_ASSETS: 12,
  LEVERAGE_RATIO_ROOM: 8,
  OTHER: 0,
};

const SYNTHETIC_FIN: FinancialSnapshotInput = {
  ebitda: 500,
  cash: 50,
  interestExpense: 40,
  cumulativeNetIncome: 100,
  equityProceedsSinceIssue: 0,
  assumedNewDebtRatePct: 7,
  totalDebt: 800,
  securedDebt: 400,
  totalAssets: 2000,
};

function argNum(name: string, fallback: number): number {
  const hit = process.argv.find((a) => a.startsWith(`${name}=`));
  if (!hit) return fallback;
  const n = Number(hit.slice(name.length + 1));
  return Number.isFinite(n) ? n : fallback;
}

function isHoldout(sourceId: string, title?: string | null): boolean {
  const hay = `${sourceId} ${title ?? ""}`;
  return HOLDOUT_BLOCKLIST.some((re) => re.test(hay));
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(((i * 17 + 31) % (i + 1))); // deterministic-ish mix without Math.random drift
    const t = a[i]!;
    a[i] = a[j]!;
    a[j] = t;
  }
  // second pass with index salt for better spread
  return a
    .map((x, i) => ({ x, k: (i * 2654435761) % 2147483647 }))
    .sort((p, q) => p.k - q.k)
    .map((p) => p.x);
}

async function main() {
  const perOverride = argNum("--per-mechanic", 0);
  const sourceLimit = argNum("--limit", 400); // match Cycle 3 activation scan
  const quotas = { ...DEFAULT_QUOTAS };
  if (perOverride > 0) {
    for (const m of MECHANICS) quotas[m] = perOverride;
  }

  const outDir = path.resolve("docs/intelligence-factory/cycle-4");
  mkdirSync(outDir, { recursive: true });

  // Collect executable candidates (same activation logic / limit as Cycle 3 → 2,254)
  const rows = await prisma.knowledgeSource.findMany({
    where: { usageRightsReviewStatus: "PUBLIC_SEC_EDGAR" as never },
    select: {
      sourceId: true,
      metadata: true,
      documentTitle: true,
      issuerTicker: true,
      documentClass: true,
      originalBytesHash: true,
    },
    take: sourceLimit,
    orderBy: { updatedAt: "desc" },
  });

  const byMechanic = new Map<FormulaMechanic, CandidateForAudit[]>();
  for (const m of MECHANICS) byMechanic.set(m, []);

  const itemByKey = new Map<string, { item: NonNullable<ReturnType<typeof summarizeFromStoredMetadata>>["items"][number]; row: (typeof rows)[0] }>();

  for (const row of rows) {
    if (isHoldout(row.sourceId, row.documentTitle)) continue;
    const summary = summarizeFromStoredMetadata(row.metadata);
    if (!summary?.items?.length) continue;
    for (const item of summary.items) {
      const activated = activateSummaryItem({ sourceId: row.sourceId, item });
      if (!activated.allChecksPassed || activated.readiness !== "EXECUTABLE_FORMULA_CANDIDATE") continue;
      const ft = activated.formulaType as FormulaMechanic;
      if (!byMechanic.has(ft)) continue;
      const cand: CandidateForAudit = {
        sourceId: row.sourceId,
        sectionRef: activated.sectionRef,
        heading: activated.heading,
        formulaType: activated.formulaType!,
        thresholdValue: activated.thresholdValue,
        params: activated.params,
        posture: activated.posture,
        families: activated.families,
        excerptEvidence: activated.excerptEvidence,
        issuerTicker: row.issuerTicker,
        documentClass: row.documentClass,
        documentTitle: row.documentTitle,
      };
      byMechanic.get(ft)!.push(cand);
      itemByKey.set(`${row.sourceId}::${item.sectionRef}`, { item, row });
    }
  }

  const populationCounts = Object.fromEntries(
    MECHANICS.map((m) => [m, byMechanic.get(m)!.length]),
  );

  // Stratified sample
  const sample: CandidateForAudit[] = [];
  for (const m of MECHANICS) {
    const pool = shuffle(byMechanic.get(m)!);
    sample.push(...pool.slice(0, quotas[m]));
  }

  // Load bytes for sampled sources
  const hashBySource = new Map<string, string>();
  for (const c of sample) {
    const row = rows.find((r) => r.sourceId === c.sourceId);
    if (row?.originalBytesHash) hashBySource.set(c.sourceId, row.originalBytesHash);
  }
  const hashes = [...new Set(hashBySource.values())];
  const blobs = hashes.length
    ? await prisma.documentByteObject.findMany({
        where: { contentHash: { in: hashes } },
        select: { contentHash: true, bytes: true },
      })
    : [];
  const textByHash = new Map<string, string>();
  for (const b of blobs) {
    textByHash.set(b.contentHash, Buffer.from(b.bytes).toString("utf8"));
  }

  const audits: IndependentAuditResult[] = [];
  const reviewReady = [];
  for (const c of sample) {
    const hash = hashBySource.get(c.sourceId);
    const full = hash ? textByHash.get(hash) ?? "" : "";
    const audit = auditCandidateAgainstOperative({ candidate: c, fullDocumentText: full });
    audits.push(audit);
    const key = `${c.sourceId}::${c.sectionRef}`;
    const bound = itemByKey.get(key);
    if (bound) {
      reviewReady.push(
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

  // Rates
  const evaluated = audits.filter((a) => a.disposition !== "INSUFFICIENT_OPERATIVE_TEXT");
  const formulaOk = evaluated.filter((a) => a.fields.find((f) => f.field === "formula")?.ok === true);
  const thresholdOk = evaluated.filter((a) => a.fields.find((f) => f.field === "threshold")?.ok === true);
  const falseExec = audits.filter((a) => a.falseExecutableClassification);
  const materialOm = audits.filter((a) => a.materialOmissions.length > 0);
  const humanReview = audits.filter(
    (a) => a.disposition === "REQUIRES_HUMAN_REVIEW" || a.disposition === "INSUFFICIENT_OPERATIVE_TEXT",
  );
  const reviewReadyExec = audits.filter(
    (a) => a.disposition === "REVIEW_READY_EXECUTABLE" || a.disposition === "REVIEW_READY_WITH_GAPS",
  );
  const lesserOfFails = audits.filter((a) => a.materialOmissions.includes("incorrect_greater_of_vs_lesser_of"));
  const missedCond = audits.filter((a) => a.materialOmissions.includes("missed_condition_language"));
  const missedShared = audits.filter((a) => a.materialOmissions.includes("missed_shared_capacity_dependency"));
  const badEntity = audits.filter((a) => a.materialOmissions.includes("entity_scope_unresolved"));
  const missedExceptions = audits.filter((a) =>
    a.fields.some((f) => f.field === "exceptions_present_in_operative" && /exception language present/i.test(f.detail)) &&
    !/\b(?:except|provided,? however)\b/i.test(
      sample.find((c) => c.sourceId === a.sourceId && c.sectionRef === a.sectionRef)?.excerptEvidence ?? "",
    ),
  );

  function rate(successes: number, n: number) {
    const w = wilsonInterval(successes, n);
    return { successes, n, rate: w.p, wilson95: { low: w.low, high: w.high } };
  }

  const byMechanicPrecision: Record<string, unknown> = {};
  for (const m of MECHANICS) {
    const subset = evaluated.filter((a) => a.mechanic === m);
    const fOk = subset.filter((a) => a.fields.find((f) => f.field === "formula")?.ok === true).length;
    const tOk = subset.filter((a) => a.fields.find((f) => f.field === "threshold")?.ok === true).length;
    byMechanicPrecision[m] = {
      audited: subset.length,
      formulaPrecision: rate(fOk, subset.length),
      thresholdPrecision: rate(tOk, subset.length),
      falseExecutable: rate(subset.filter((a) => a.falseExecutableClassification).length, subset.length),
    };
  }

  // Authentic calculation examples from review-ready greater-of / flat that pass
  const authenticExamples = [];
  for (const rec of reviewReady.filter((r) => r.counselCompileEligible).slice(0, 8)) {
    const ft = rec.parsedFormula.formulaType;
    if (!ft || rec.parsedFormula.thresholdValue == null) continue;
    if (!["FLAT_AMOUNT", "GREATER_OF_FLAT_OR_PCT_EBITDA", "GREATER_OF_FLAT_OR_PCT_TOTAL_ASSETS"].includes(ft)) {
      continue;
    }
    const provision: CovenantProvisionInput = {
      id: `audit-ex:${rec.sourceId}:${rec.sectionRef}`,
      documentId: `audit-doc:${rec.sourceId}`,
      code: `audit_${authenticExamples.length}`,
      basketName: rec.heading.slice(0, 80),
      sectionRef: rec.sectionRef,
      formulaType: ft as CovenantProvisionInput["formulaType"],
      thresholdValue: rec.parsedFormula.thresholdValue,
      params: rec.parsedFormula.params,
    };
    const evaluatedProv = evaluateProvision(provision, SYNTHETIC_FIN, computeLeverageMetrics(SYNTHETIC_FIN));
    authenticExamples.push({
      sourceId: rec.sourceId,
      sectionRef: rec.sectionRef,
      issuerTicker: rec.issuerTicker,
      formulaType: ft,
      thresholdValue: rec.parsedFormula.thresholdValue,
      params: rec.parsedFormula.params,
      independentAuditDisposition: rec.independentAudit.disposition,
      financialInputsLabel: "SYNTHETIC_LABELED_FINANCIAL_INPUTS_NOT_COMPANY_CAPACITY",
      financialInputs: SYNTHETIC_FIN,
      evaluationStatus: evaluatedProv.status,
      capacityMillions: evaluatedProv.capacity ?? null,
      legalPermissionDistinctFromCapacity: true,
      note: "Numerical capacity under labeled synthetic inputs ≠ overall legal permission to incur.",
      certificationState: rec.certificationState,
    });
  }

  const report = {
    schemaVersion: "intelligence-factory.cycle-4-audit.v1",
    generatedAt: new Date().toISOString(),
    paidInferenceCostUsd: 0,
    neonMutations: 0,
    holdoutsExcluded: ["gibraltar-2026-credit-agreement", "knife-river-blind"],
    peerCoordination: {
      pr225: "https://github.com/egsul897/headroom/pull/225",
      pr227: "https://github.com/egsul897/headroom/pull/227",
      activationPath: "counsel-compile-accepted-interpretation",
    },
    population: {
      sourcesScanned: rows.length,
      executableCandidatesByMechanic: populationCounts,
      totalExecutableInScan: Object.values(populationCounts).reduce((a, b) => a + b, 0),
    },
    sample: {
      audited: audits.length,
      quotas,
      byMechanicSampled: Object.fromEntries(
        MECHANICS.map((m) => [m, audits.filter((a) => a.mechanic === m).length]),
      ),
    },
    rates: {
      formulaPrecision: rate(formulaOk.length, evaluated.length),
      thresholdPrecision: rate(thresholdOk.length, evaluated.length),
      incorrectGreaterVsLesserOf: rate(lesserOfFails.length, audits.length),
      missedConditions: rate(missedCond.length, audits.length),
      missedExceptions: rate(missedExceptions.length, audits.length),
      missedSharedCapacity: rate(missedShared.length, audits.length),
      incorrectEntityScope: rate(badEntity.length, audits.length),
      materialLegalOmissionRate: rate(materialOm.length, audits.length),
      falseExecutableClassificationRate: rate(falseExec.length, audits.length),
      requiresHumanReviewRate: rate(humanReview.length, audits.length),
      reviewReadyRate: rate(reviewReadyExec.length, audits.length),
      insufficientOperativeText: rate(
        audits.filter((a) => a.disposition === "INSUFFICIENT_OPERATIVE_TEXT").length,
        audits.length,
      ),
      byMechanic: byMechanicPrecision,
    },
    dispositions: audits.reduce(
      (acc, a) => {
        acc[a.disposition] = (acc[a.disposition] ?? 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    ),
    reviewReadyCount: reviewReady.filter((r) => r.counselCompileEligible).length,
    newlyAcceptedInterpretations: 0,
    newDurablePermissions: 0,
    authorizationNote: "No counsel ACCEPT and no Permission writes performed.",
    authenticCalculationExamples: authenticExamples,
    // Full audits kept for local analysis; commit-friendly sample below.
    auditSample: audits,
  };

  writeFileSync(path.join(outDir, "independent-audit-report.json"), JSON.stringify(report, null, 2));
  // Compact report for humans / PR (rates + short sample)
  writeFileSync(
    path.join(outDir, "independent-audit-summary.json"),
    JSON.stringify(
      {
        ...report,
        auditSample: audits.slice(0, 12).map((a) => ({
          sourceId: a.sourceId,
          sectionRef: a.sectionRef,
          formulaType: a.formulaType,
          disposition: a.disposition,
          independentFormula: a.independentFormula,
          independentThresholdMillions: a.independentThresholdMillions,
          materialOmissions: a.materialOmissions,
          sufficientForExecutableEvaluation: a.sufficientForExecutableEvaluation,
          falseExecutableClassification: a.falseExecutableClassification,
        })),
      },
      null,
      2,
    ),
  );
  writeFileSync(
    path.join(outDir, "review-ready-activation-records.json"),
    JSON.stringify(
      {
        schemaVersion: "intelligence-factory.review-ready-batch.v1",
        generatedAt: report.generatedAt,
        certification: "NOT_CERTIFIED / REVIEW_READY_UNVERIFIED only",
        counselCompileEligible: reviewReady.filter((r) => r.counselCompileEligible).length,
        records: reviewReady.filter((r) => r.counselCompileEligible).slice(0, 40),
        blockedSample: reviewReady.filter((r) => !r.counselCompileEligible).slice(0, 20),
      },
      null,
      2,
    ),
  );

  console.log(
    JSON.stringify(
      {
        audited: audits.length,
        population: populationCounts,
        formulaPrecision: report.rates.formulaPrecision,
        thresholdPrecision: report.rates.thresholdPrecision,
        falseExecutable: report.rates.falseExecutableClassificationRate,
        materialOmissions: report.rates.materialLegalOmissionRate,
        reviewReadyEligible: report.reviewReadyCount,
        authenticExamples: authenticExamples.length,
        dispositions: report.dispositions,
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
