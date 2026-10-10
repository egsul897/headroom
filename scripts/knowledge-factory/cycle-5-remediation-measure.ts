/**
 * Cycle 5 — legal correctness remediation measurement.
 *
 * 1) Re-score frozen Cycle 4 61-case cohort (regression; do not retune).
 * 2) Independently recheck prior review-ready records.
 * 3) Draw a NEW stratified holdout (different shuffle salt); never Gibraltar/Knife River.
 * 4) Report formula/threshold precision, omissions, false-executable, false-favorable,
 *    review-ready precision, unresolved dependencies.
 *
 *   npx tsx scripts/knowledge-factory/cycle-5-remediation-measure.ts
 *
 * No Neon writes. No certification. $0 paid inference.
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
  "BUILDER_BASKET",
  "GREATER_OF_FLAT_OR_PCT_EBITDA",
  "GREATER_OF_FLAT_OR_PCT_TOTAL_ASSETS",
  "LEVERAGE_RATIO_ROOM",
];

const HOLDOUT_QUOTAS: Record<FormulaMechanic, number> = {
  FLAT_AMOUNT: 10,
  BUILDER_BASKET: 8,
  GREATER_OF_FLAT_OR_PCT_EBITDA: 10,
  GREATER_OF_FLAT_OR_PCT_TOTAL_ASSETS: 8,
  LEVERAGE_RATIO_ROOM: 6,
  OTHER: 0,
};

function isHoldout(sourceId: string, title?: string | null): boolean {
  return HOLDOUT_BLOCKLIST.some((re) => re.test(`${sourceId} ${title ?? ""}`));
}

function rate(successes: number, n: number) {
  const w = wilsonInterval(successes, n);
  return { successes, n, rate: w.p, wilson95: { low: w.low, high: w.high } };
}

function shuffleSalt<T>(arr: T[], salt: number): T[] {
  return arr
    .map((x, i) => ({ x, k: ((i + 1) * 2654435761 + salt * 97) % 2147483647 }))
    .sort((p, q) => p.k - q.k)
    .map((p) => p.x);
}

type Row = {
  sourceId: string;
  metadata: unknown;
  documentTitle: string | null;
  issuerTicker: string | null;
  documentClass: string | null;
  originalBytesHash: string | null;
};

async function loadRows(limit: number): Promise<Row[]> {
  return prisma.knowledgeSource.findMany({
    where: { usageRightsReviewStatus: "PUBLIC_SEC_EDGAR" as never },
    select: {
      sourceId: true,
      metadata: true,
      documentTitle: true,
      issuerTicker: true,
      documentClass: true,
      originalBytesHash: true,
    },
    take: limit,
    orderBy: { updatedAt: "desc" },
  });
}

async function loadTextByHash(hashes: string[]): Promise<Map<string, string>> {
  const uniq = [...new Set(hashes.filter(Boolean))];
  const blobs = uniq.length
    ? await prisma.documentByteObject.findMany({
        where: { contentHash: { in: uniq } },
        select: { contentHash: true, bytes: true },
      })
    : [];
  const map = new Map<string, string>();
  for (const b of blobs) map.set(b.contentHash, Buffer.from(b.bytes).toString("utf8"));
  return map;
}

function collectCandidates(rows: Row[]) {
  const byMechanic = new Map<FormulaMechanic, CandidateForAudit[]>();
  for (const m of MECHANICS) byMechanic.set(m, []);
  const itemByKey = new Map<
    string,
    { item: NonNullable<ReturnType<typeof summarizeFromStoredMetadata>>["items"][number]; row: Row }
  >();
  const activationByKey = new Map<string, ReturnType<typeof activateSummaryItem>>();
  let discovered = 0;
  let executable = 0;

  for (const row of rows) {
    if (isHoldout(row.sourceId, row.documentTitle)) continue;
    const summary = summarizeFromStoredMetadata(row.metadata);
    if (!summary?.items?.length) continue;
    for (const item of summary.items) {
      const activated = activateSummaryItem({ sourceId: row.sourceId, item });
      const key = `${row.sourceId}::${item.sectionRef}`;
      activationByKey.set(key, activated);
      itemByKey.set(key, { item, row });
      if (activated.formulaType) discovered += 1;
      if (!activated.executableEligible || !activated.formulaType) continue;
      executable += 1;
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
    }
  }
  return { byMechanic, itemByKey, activationByKey, discovered, executable };
}

function summarizeAudits(audits: IndependentAuditResult[]) {
  const formulaOk = audits.filter((a) => a.fields.find((f) => f.field === "formula")?.ok === true);
  const thresholdOk = audits.filter((a) => a.fields.find((f) => f.field === "threshold")?.ok === true);
  const falseExec = audits.filter((a) => a.falseExecutableClassification);
  const materialOm = audits.filter((a) => a.materialOmissions.length > 0);
  const reviewReady = audits.filter(
    (a) => a.disposition === "REVIEW_READY_EXECUTABLE" || a.disposition === "REVIEW_READY_WITH_GAPS",
  );
  // False favorable: marked review-ready / sufficient but formula or threshold wrong
  const falseFavorable = audits.filter(
    (a) =>
      (a.disposition === "REVIEW_READY_EXECUTABLE" || a.sufficientForExecutableEvaluation) &&
      (a.fields.find((f) => f.field === "formula")?.ok === false ||
        a.fields.find((f) => f.field === "threshold")?.ok === false),
  );
  const byMechanic: Record<string, unknown> = {};
  for (const m of MECHANICS) {
    const subset = audits.filter((a) => a.mechanic === m);
    byMechanic[m] = {
      audited: subset.length,
      formulaPrecision: rate(
        subset.filter((a) => a.fields.find((f) => f.field === "formula")?.ok === true).length,
        subset.length,
      ),
      thresholdPrecision: rate(
        subset.filter((a) => a.fields.find((f) => f.field === "threshold")?.ok === true).length,
        subset.length,
      ),
      falseExecutable: rate(subset.filter((a) => a.falseExecutableClassification).length, subset.length),
    };
  }
  return {
    formulaPrecision: rate(formulaOk.length, audits.length),
    thresholdPrecision: rate(thresholdOk.length, audits.length),
    materialLegalOmissionRate: rate(materialOm.length, audits.length),
    falseExecutableClassificationRate: rate(falseExec.length, audits.length),
    falseFavorableOutcomeRate: rate(falseFavorable.length, audits.length),
    reviewReadyRate: rate(reviewReady.length, audits.length),
    byMechanic,
    dispositions: audits.reduce(
      (acc, a) => {
        acc[a.disposition] = (acc[a.disposition] ?? 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    ),
  };
}

async function main() {
  const outDir = path.resolve("docs/intelligence-factory/cycle-5");
  mkdirSync(outDir, { recursive: true });

  const cohortDoc = JSON.parse(
    readFileSync(path.resolve("docs/intelligence-factory/cycle-5/fixed-cohort-61.json"), "utf8"),
  ) as {
    cases: Array<{
      sourceId: string;
      sectionRef: string;
      formulaType: string;
      falseExecutable: boolean;
      disposition: string;
    }>;
  };
  const priorRr = JSON.parse(
    readFileSync(
      path.resolve("docs/intelligence-factory/cycle-4/review-ready-activation-records.json"),
      "utf8",
    ),
  ) as { records: Array<{ sourceId: string; sectionRef: string }> };

  const rows = await loadRows(400);
  const { byMechanic, itemByKey, activationByKey, discovered, executable } = collectCandidates(rows);

  const hashBySource = new Map<string, string>();
  for (const row of rows) {
    if (row.originalBytesHash) hashBySource.set(row.sourceId, row.originalBytesHash);
  }
  const textByHash = await loadTextByHash([...hashBySource.values()]);

  // --- Fixed 61 cohort regression ---
  const cohortAudits: IndependentAuditResult[] = [];
  const cohortActivation = [];
  const rootCauses: Array<Record<string, unknown>> = [];

  for (const c of cohortDoc.cases) {
    const key = `${c.sourceId}::${c.sectionRef}`;
    const bound = itemByKey.get(key);
    const act = activationByKey.get(key);
    const hash = hashBySource.get(c.sourceId);
    const full = hash ? textByHash.get(hash) ?? "" : "";

    // Rebuild candidate from current activation if present; else from frozen type for audit of operative text
    let cand: CandidateForAudit | null = null;
    if (bound && act) {
      cand = {
        sourceId: c.sourceId,
        sectionRef: c.sectionRef,
        heading: act.heading,
        formulaType: act.formulaType ?? c.formulaType,
        thresholdValue: act.thresholdValue,
        params: act.params,
        posture: act.posture,
        families: act.families,
        excerptEvidence: act.excerptEvidence,
        issuerTicker: bound.row.issuerTicker,
        documentClass: bound.row.documentClass,
        documentTitle: bound.row.documentTitle,
      };
    } else if (bound) {
      const activated = activateSummaryItem({ sourceId: c.sourceId, item: bound.item });
      cand = {
        sourceId: c.sourceId,
        sectionRef: c.sectionRef,
        heading: activated.heading,
        formulaType: activated.formulaType ?? c.formulaType,
        thresholdValue: activated.thresholdValue,
        params: activated.params,
        posture: activated.posture,
        families: activated.families,
        excerptEvidence: activated.excerptEvidence,
        issuerTicker: bound.row.issuerTicker,
        documentClass: bound.row.documentClass,
        documentTitle: bound.row.documentTitle,
      };
      activationByKey.set(key, activated);
    }

    const actNow = activationByKey.get(key);
    cohortActivation.push({
      sourceId: c.sourceId,
      sectionRef: c.sectionRef,
      priorFormulaType: c.formulaType,
      priorFalseExecutable: c.falseExecutable,
      priorDisposition: c.disposition,
      currentReadiness: actNow?.readiness ?? "MISSING",
      currentFormulaType: actNow?.formulaType ?? null,
      executableEligible: actNow?.executableEligible ?? false,
      unresolvedDependencies: actNow?.unresolvedDependencies ?? [],
      ownershipHints: actNow?.ownershipHints ?? [],
    });

    if (cand) {
      const audit = auditCandidateAgainstOperative({ candidate: cand, fullDocumentText: full });
      // Production-reachable false executable: still marked executableEligible AND audit says false
      const productionReachableFalse =
        (actNow?.executableEligible === true) && audit.falseExecutableClassification;
      cohortAudits.push(audit);
      if (c.falseExecutable || productionReachableFalse || audit.falseExecutableClassification) {
        rootCauses.push({
          sourceId: c.sourceId,
          sectionRef: c.sectionRef,
          priorFormulaType: c.formulaType,
          currentFormulaType: actNow?.formulaType ?? null,
          currentReadiness: actNow?.readiness ?? "MISSING",
          executableEligible: actNow?.executableEligible ?? false,
          independentFormula: audit.independentFormula,
          materialOmissions: audit.materialOmissions,
          disposition: audit.disposition,
          productionReachableFalseExecutable: productionReachableFalse,
          rootCauseCategory: categorizeRootCause({
            prior: c.formulaType,
            current: actNow?.formulaType ?? null,
            readiness: actNow?.readiness ?? "MISSING",
            indep: audit.independentFormula,
            omissions: audit.materialOmissions,
            wasFalse: c.falseExecutable,
          }),
          remediated: Boolean(c.falseExecutable && actNow?.executableEligible === false),
        });
      }
    } else {
      rootCauses.push({
        sourceId: c.sourceId,
        sectionRef: c.sectionRef,
        priorFormulaType: c.formulaType,
        currentReadiness: "MISSING_FROM_SCAN",
        rootCauseCategory: "missing_from_rescan",
        remediated: c.falseExecutable, // no longer executable in scan
        productionReachableFalseExecutable: false,
      });
    }
  }

  // Also mark prior-false cases that demoted without re-appearing in rootCauses loop edge cases
  for (const a of cohortActivation) {
    if (a.priorFalseExecutable && !a.executableEligible) {
      const hit = rootCauses.find(
        (r) => r.sourceId === a.sourceId && r.sectionRef === a.sectionRef,
      );
      if (hit) hit.remediated = true;
    }
  }

  // --- Recheck prior 27 review-ready ---
  const rrRecheck = [];
  for (const rec of priorRr.records) {
    const key = `${rec.sourceId}::${rec.sectionRef}`;
    const bound = itemByKey.get(key);
    const act = activationByKey.get(key);
    const hash = hashBySource.get(rec.sourceId);
    const full = hash ? textByHash.get(hash) ?? "" : "";
    if (!bound || !act) {
      rrRecheck.push({
        sourceId: rec.sourceId,
        sectionRef: rec.sectionRef,
        status: "MISSING_FROM_SCAN",
        survivesRecheck: false,
      });
      continue;
    }
    const cand: CandidateForAudit = {
      sourceId: rec.sourceId,
      sectionRef: rec.sectionRef,
      heading: act.heading,
      formulaType: act.formulaType!,
      thresholdValue: act.thresholdValue,
      params: act.params,
      posture: act.posture,
      families: act.families,
      excerptEvidence: act.excerptEvidence,
      issuerTicker: bound.row.issuerTicker,
      documentClass: bound.row.documentClass,
      documentTitle: bound.row.documentTitle,
    };
    const audit = auditCandidateAgainstOperative({ candidate: cand, fullDocumentText: full });
    const built = buildReviewReadyRecord({
      sourceId: rec.sourceId,
      item: bound.item,
      audit,
      documentClass: bound.row.documentClass,
      issuerTicker: bound.row.issuerTicker,
    });
    const survives =
      built.counselCompileEligible &&
      !audit.falseExecutableClassification &&
      (audit.disposition === "REVIEW_READY_EXECUTABLE" || audit.disposition === "REVIEW_READY_WITH_GAPS") &&
      act.executableEligible;
    rrRecheck.push({
      sourceId: rec.sourceId,
      sectionRef: rec.sectionRef,
      status: survives ? "SURVIVES_RECHECK" : "DROPPED",
      survivesRecheck: survives,
      currentReadiness: act.readiness,
      disposition: audit.disposition,
      formulaType: act.formulaType,
      materialOmissions: audit.materialOmissions,
      certificationState: built.certificationState,
      note: "Review-ready is not counsel-accepted.",
    });
  }

  // --- New holdout cohort (salt ≠ Cycle 4) ---
  const fixedKeys = new Set(cohortDoc.cases.map((c) => `${c.sourceId}::${c.sectionRef}`));
  const holdoutSample: CandidateForAudit[] = [];
  for (const m of MECHANICS) {
    const pool = shuffleSalt(
      byMechanic.get(m)!.filter((c) => !fixedKeys.has(`${c.sourceId}::${c.sectionRef}`)),
      0xc5c5, // Cycle 5 salt — distinct from Cycle 4
    );
    holdoutSample.push(...pool.slice(0, HOLDOUT_QUOTAS[m]));
  }

  const holdoutAudits: IndependentAuditResult[] = [];
  const holdoutRr = [];
  for (const c of holdoutSample) {
    const hash = hashBySource.get(c.sourceId);
    const full = hash ? textByHash.get(hash) ?? "" : "";
    const audit = auditCandidateAgainstOperative({ candidate: c, fullDocumentText: full });
    holdoutAudits.push(audit);
    const bound = itemByKey.get(`${c.sourceId}::${c.sectionRef}`);
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

  const priorFalse = cohortDoc.cases.filter((c) => c.falseExecutable).length;
  const remediatedCount = rootCauses.filter((r) => r.remediated === true).length;
  const stillProductionFalse = rootCauses.filter((r) => r.productionReachableFalseExecutable === true).length;
  const stillExecutableAmongPriorFalse = cohortActivation.filter(
    (a) => a.priorFalseExecutable && a.executableEligible,
  ).length;

  const categoryCounts: Record<string, number> = {};
  for (const r of rootCauses) {
    const cat = String(r.rootCauseCategory ?? "unknown");
    categoryCounts[cat] = (categoryCounts[cat] ?? 0) + 1;
  }

  const cohortRates = summarizeAudits(cohortAudits);
  const holdoutRates = summarizeAudits(holdoutAudits);

  // Review-ready precision among current executable-eligible audited in holdout
  const holdoutExecAudits = holdoutAudits.filter((a) => {
    const act = activationByKey.get(`${a.sourceId}::${a.sectionRef}`);
    return act?.executableEligible;
  });
  const rrPrecision = rate(
    holdoutExecAudits.filter(
      (a) =>
        !a.falseExecutableClassification &&
        (a.disposition === "REVIEW_READY_EXECUTABLE" || a.disposition === "REVIEW_READY_WITH_GAPS"),
    ).length,
    holdoutExecAudits.length,
  );

  const report = {
    schemaVersion: "intelligence-factory.cycle-5-remediation.v1",
    generatedAt: new Date().toISOString(),
    paidInferenceCostUsd: 0,
    neonMutations: 0,
    peerCoordination: {
      pr225: "https://github.com/egsul897/headroom/pull/225",
      pr227: "https://github.com/egsul897/headroom/pull/227",
      pr232: "https://github.com/egsul897/headroom/pull/232",
      agent2: "contractual financial definitions and inputs",
      agent3: "mathematical formula correctness",
      agent5: "cross-document conditions and shared capacity",
      neonActivation: "durable reviewed-rule lifecycle",
      coordinator: "PR integration and ownership",
    },
    population: {
      sourcesScanned: rows.length,
      formulaDiscoveries: discovered,
      executableEligibleAfterGates: executable,
      note: "Discovery retained; executable set reduced by eligibility gates (BUILDER/LEVERAGE blocked).",
    },
    fixedCohort61: {
      n: cohortDoc.cases.length,
      priorFalseExecutable: priorFalse,
      remediatedOfPriorFalse: remediatedCount,
      stillExecutableAmongPriorFalse,
      productionReachableFalseExecutable: stillProductionFalse,
      ratesOnRescore: cohortRates,
      activationTransition: {
        stillExecutable: cohortActivation.filter((a) => a.executableEligible).length,
        blockedMechanicGate: cohortActivation.filter((a) => a.currentReadiness === "BLOCKED_MECHANIC_GATE")
          .length,
        blockedSharedCapacity: cohortActivation.filter(
          (a) => a.currentReadiness === "BLOCKED_SHARED_CAPACITY",
        ).length,
        reviewRequired: cohortActivation.filter((a) => a.currentReadiness === "REVIEW_REQUIRED").length,
        discoveredFormula: cohortActivation.filter((a) => a.currentReadiness === "DISCOVERED_FORMULA")
          .length,
        missing: cohortActivation.filter((a) => a.currentReadiness === "MISSING").length,
      },
      rootCauseCategories: categoryCounts,
    },
    reviewReadyRecheck: {
      priorCount: priorRr.records.length,
      surviving: rrRecheck.filter((r) => r.survivesRecheck).length,
      dropped: rrRecheck.filter((r) => !r.survivesRecheck).length,
      records: rrRecheck,
    },
    newHoldout: {
      n: holdoutAudits.length,
      quotas: HOLDOUT_QUOTAS,
      excludedBlindHoldouts: ["gibraltar-2026-credit-agreement", "knife-river-blind"],
      rates: holdoutRates,
      reviewReadyPrecisionAmongExecutable: rrPrecision,
      counselCompileEligible: holdoutRr.filter((r) => r.counselCompileEligible).length,
    },
    generalizableFixes: [
      "Eligibility gates separate formula discovery from EXECUTABLE permission",
      "BUILDER_BASKET / LEVERAGE_RATIO_ROOM blocked behind BLOCKED_MECHANIC_GATE",
      "Shared-capacity fail-closed (BLOCKED_SHARED_CAPACITY)",
      "parseCounselFormulaForTest: greater-of preferred over Available Amount mention",
      "Builder requires strong definitional capacity language",
      "Non-operative headings (Notices, Evidence of Indebtedness) blocked from executable",
    ],
    authorizationNote: "No counsel ACCEPT, no VERIFIED SemanticTruth, no durable Permission writes.",
  };

  writeFileSync(path.join(outDir, "remediation-report.json"), JSON.stringify(report, null, 2));
  writeFileSync(
    path.join(outDir, "false-executable-root-causes.json"),
    JSON.stringify(
      {
        schemaVersion: "intelligence-factory.cycle-5-root-causes.v1",
        priorFalseExecutable: priorFalse,
        remediated: remediatedCount,
        productionReachableRemaining: stillProductionFalse,
        categories: categoryCounts,
        cases: rootCauses,
      },
      null,
      2,
    ),
  );
  writeFileSync(
    path.join(outDir, "review-ready-recheck.json"),
    JSON.stringify(
      {
        schemaVersion: "intelligence-factory.cycle-5-rr-recheck.v1",
        prior: priorRr.records.length,
        surviving: rrRecheck.filter((r) => r.survivesRecheck).length,
        records: rrRecheck,
      },
      null,
      2,
    ),
  );
  writeFileSync(
    path.join(outDir, "new-holdout-audit.json"),
    JSON.stringify(
      {
        schemaVersion: "intelligence-factory.cycle-5-holdout.v1",
        n: holdoutAudits.length,
        rates: holdoutRates,
        audits: holdoutAudits,
      },
      null,
      2,
    ),
  );
  writeFileSync(
    path.join(outDir, "review-ready-holdout-records.json"),
    JSON.stringify(
      {
        schemaVersion: "intelligence-factory.cycle-5-holdout-review-ready.v1",
        certification: "NOT_CERTIFIED / REVIEW_READY_UNVERIFIED only — not counsel-accepted",
        activationPath: "counsel-compile-accepted-interpretation",
        peers: ["#225", "#227", "#232"],
        counselCompileEligible: holdoutRr.filter((r) => r.counselCompileEligible).length,
        records: holdoutRr.filter((r) => r.counselCompileEligible),
      },
      null,
      2,
    ),
  );

  console.log(
    JSON.stringify(
      {
        fixedCohort: {
          n: cohortDoc.cases.length,
          priorFalse: priorFalse,
          remediated: remediatedCount,
          stillExecPriorFalse: stillExecutableAmongPriorFalse,
          productionReachableFalse: stillProductionFalse,
          formulaPrecision: cohortRates.formulaPrecision,
          falseExec: cohortRates.falseExecutableClassificationRate,
        },
        reviewReadySurviving: rrRecheck.filter((r) => r.survivesRecheck).length,
        holdout: {
          n: holdoutAudits.length,
          formulaPrecision: holdoutRates.formulaPrecision,
          falseExec: holdoutRates.falseExecutableClassificationRate,
          falseFavorable: holdoutRates.falseFavorableOutcomeRate,
        },
        populationExecutable: executable,
        rootCauseCategories: categoryCounts,
      },
      null,
      2,
    ),
  );

  await prisma.$disconnect();
}

function categorizeRootCause(p: {
  prior: string;
  current: string | null;
  readiness: string;
  indep: string | null;
  omissions: string[];
  wasFalse: boolean;
}): string {
  if (p.readiness === "BLOCKED_MECHANIC_GATE") {
    if (p.prior === "BUILDER_BASKET") return "builder_misclassify_or_ungated_builder";
    if (p.prior === "LEVERAGE_RATIO_ROOM") return "leverage_ungated";
    return "mechanic_gate_block";
  }
  if (p.readiness === "BLOCKED_SHARED_CAPACITY") return "shared_capacity_ungated";
  if (p.prior === "BUILDER_BASKET" && p.current && p.current.startsWith("GREATER_OF")) {
    return "builder_over_greater_of_precedence";
  }
  if (p.prior === "BUILDER_BASKET" && (p.indep === "FLAT_AMOUNT" || p.current === "FLAT_AMOUNT")) {
    return "builder_over_flat_precedence";
  }
  if (p.omissions.includes("missed_condition_language")) return "missed_conditions";
  if (p.omissions.includes("missed_shared_capacity_dependency")) return "missed_shared_capacity";
  if (p.omissions.includes("entity_scope_unresolved")) return "entity_scope";
  if (p.indep == null) return "operative_window_or_non_basket_section";
  if (p.prior !== p.indep && p.prior !== p.current) return "formula_type_mismatch";
  if (p.wasFalse) return "threshold_or_formula_mismatch";
  return "other";
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
