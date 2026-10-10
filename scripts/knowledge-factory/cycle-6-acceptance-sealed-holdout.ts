/**
 * Cycle 6 acceptance — seal a NEW disjoint blind holdout (salt 0xc6a1).
 *
 * Excludes:
 *   - frozen-61 + Cycle 5 holdout (HISTORICAL_EXPOSED)
 *   - Cycle 6 salt-0xc6c6 holdout (now EXPOSED_EVALUATION_ARTIFACT)
 *   - Gibraltar / Knife River blind docs
 *
 * Does NOT retune gates against prior holdouts. Records provenance only.
 * No Neon writes. No certification.
 *
 *   npx tsx scripts/knowledge-factory/cycle-6-acceptance-sealed-holdout.ts
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { prisma } from "../../lib/prisma";
import { summarizeFromStoredMetadata } from "../../lib/product/covenant-intelligence/summarize";
import { activateSummaryItem } from "../../lib/knowledge-factory/activation/provision-candidates";
import {
  auditCandidateAgainstOperative,
  wilsonInterval,
  type CandidateForAudit,
  type FormulaMechanic,
} from "../../lib/knowledge-factory/activation/independent-audit";
import {
  buildReviewReadyRecord,
  mayEnterCounselCompilePath,
} from "../../lib/knowledge-factory/activation/review-ready-record";

const HOLDOUT_BLOCKLIST = [/gibraltar/i, /knife.?river/i, /rock-2026/i];
const MECHANICS: FormulaMechanic[] = [
  "FLAT_AMOUNT",
  "GREATER_OF_FLAT_OR_PCT_EBITDA",
  "GREATER_OF_FLAT_OR_PCT_TOTAL_ASSETS",
];
const QUOTAS: Record<string, number> = {
  FLAT_AMOUNT: 10,
  GREATER_OF_FLAT_OR_PCT_EBITDA: 6,
  GREATER_OF_FLAT_OR_PCT_TOTAL_ASSETS: 6,
};
const SALT = 0xc6a1;

function rate(successes: number, n: number) {
  const w = wilsonInterval(successes, n);
  return { successes, n, rate: w.p, wilson95: { low: w.low, high: w.high } };
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
  ) as { cases: Array<{ sourceId: string; sectionRef: string }> };
  const c5Holdout = JSON.parse(
    readFileSync("docs/intelligence-factory/cycle-5/new-holdout-audit.json", "utf8"),
  ) as { audits: Array<{ sourceId: string; sectionRef: string }> };

  const exposedKeys = new Set<string>([
    ...frozen61.cases.map((c) => `${c.sourceId}::${c.sectionRef}`),
    ...c5Holdout.audits.map((a) => `${a.sourceId}::${a.sectionRef}`),
  ]);

  const c6HoldoutPath = path.join(outDir, "new-blind-holdout.json");
  if (existsSync(c6HoldoutPath)) {
    const c6 = JSON.parse(readFileSync(c6HoldoutPath, "utf8")) as {
      audits: Array<{ sourceId: string; sectionRef: string }>;
    };
    for (const a of c6.audits ?? []) exposedKeys.add(`${a.sourceId}::${a.sectionRef}`);
  }

  writeFileSync(
    path.join(outDir, "historical-cohorts.json"),
    JSON.stringify(
      {
        schemaVersion: "intelligence-factory.cycle-6-historical-cohorts.v1",
        note: "Exposed / historical — do not use for iterative gate tuning as blind evaluation.",
        frozen61: {
          path: "docs/intelligence-factory/cycle-5/fixed-cohort-61.json",
          n: frozen61.cases.length,
          status: "HISTORICAL_EXPOSED",
        },
        cycle5Holdout16: {
          path: "docs/intelligence-factory/cycle-5/new-holdout-audit.json",
          n: c5Holdout.audits.length,
          status: "HISTORICAL_EXPOSED",
        },
        cycle6BlindHoldout14: {
          path: "docs/intelligence-factory/cycle-6/new-blind-holdout.json",
          n: 14,
          salt: "0xc6c6",
          status: "EXPOSED_EVALUATION_ARTIFACT",
          note: "Inspected for taxonomy; not a tuning target.",
        },
        exposedKeyCount: exposedKeys.size,
      },
      null,
      2,
    ),
  );

  let rows;
  try {
    rows = await prisma.knowledgeSource.findMany({
      where: { usageRightsReviewStatus: "PUBLIC_SEC_EDGAR" as never },
      select: {
        sourceId: true,
        metadata: true,
        documentTitle: true,
        issuerTicker: true,
        documentClass: true,
        originalBytesHash: true,
      },
      take: 450,
      orderBy: { updatedAt: "desc" },
    });
  } catch (e) {
    const report = {
      schemaVersion: "intelligence-factory.cycle-6-acceptance-sealed.v1",
      generatedAt: new Date().toISOString(),
      salt: `0x${SALT.toString(16)}`,
      status: "BLOCKED_BY_NEON_CONNECTIVITY",
      error: e instanceof Error ? e.message : String(e),
      neonMutations: 0,
      paidInferenceCostUsd: 0,
      note: "Sealed protocol recorded; live audit deferred until Neon readable. Do NOT claim UNSEEN_FORMULA_RELIABILITY_VALIDATED.",
      excludedExposedKeys: exposedKeys.size,
    };
    writeFileSync(path.join(outDir, "acceptance-sealed-holdout.json"), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
    process.exit(0);
  }

  const byMechanic = new Map<string, CandidateForAudit[]>();
  for (const m of MECHANICS) byMechanic.set(m, []);
  const actByKey = new Map<
    string,
    { act: ReturnType<typeof activateSummaryItem>; item: NonNullable<ReturnType<typeof summarizeFromStoredMetadata>>["items"][number]; row: (typeof rows)[0] }
  >();

  for (const row of rows) {
    if (HOLDOUT_BLOCKLIST.some((re) => re.test(`${row.sourceId} ${row.documentTitle ?? ""}`))) continue;
    const summary = summarizeFromStoredMetadata(row.metadata);
    if (!summary?.items?.length) continue;
    for (const item of summary.items) {
      const act = activateSummaryItem({ sourceId: row.sourceId, item });
      actByKey.set(`${row.sourceId}::${act.sectionRef}`, { act, item, row });
      if (!act.executableEligible || !act.formulaType) continue;
      if (!byMechanic.has(act.formulaType)) continue;
      byMechanic.get(act.formulaType)!.push({
        sourceId: row.sourceId,
        sectionRef: act.sectionRef,
        heading: act.heading,
        formulaType: act.formulaType,
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

  const sealed: CandidateForAudit[] = [];
  for (const m of MECHANICS) {
    const pool = shuffleSalt(
      (byMechanic.get(m) ?? []).filter((c) => !exposedKeys.has(`${c.sourceId}::${c.sectionRef}`)),
      SALT,
    );
    sealed.push(...pool.slice(0, QUOTAS[m] ?? 0));
  }

  const hashBySource = new Map(rows.filter((r) => r.originalBytesHash).map((r) => [r.sourceId, r.originalBytesHash!]));
  const hashes = [...new Set(sealed.map((c) => hashBySource.get(c.sourceId)).filter(Boolean))] as string[];
  const blobs = hashes.length
    ? await prisma.documentByteObject.findMany({
        where: { contentHash: { in: hashes } },
        select: { contentHash: true, bytes: true },
      })
    : [];
  const textByHash = new Map(blobs.map((b) => [b.contentHash, Buffer.from(b.bytes).toString("utf8")]));

  const audits = [];
  const reviewReady = [];
  for (const c of sealed) {
    const full = textByHash.get(hashBySource.get(c.sourceId) ?? "") ?? "";
    const audit = auditCandidateAgainstOperative({ candidate: c, fullDocumentText: full });
    audits.push(audit);
    const bound = actByKey.get(`${c.sourceId}::${c.sectionRef}`);
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

  const formulaOk = audits.filter((a) => a.fields.find((f) => f.field === "formula")?.ok === true);
  const threshOk = audits.filter((a) => a.fields.find((f) => f.field === "threshold")?.ok === true);
  const falseExec = audits.filter((a) => a.falseExecutableClassification);
  const materialOm = audits.filter((a) => a.materialOmissions.length > 0);
  const falseFavorable = audits.filter(
    (a) =>
      a.sufficientForExecutableEvaluation &&
      (a.fields.find((f) => f.field === "formula")?.ok === false ||
        a.fields.find((f) => f.field === "threshold")?.ok === false),
  );

  const report = {
    schemaVersion: "intelligence-factory.cycle-6-acceptance-sealed.v1",
    generatedAt: new Date().toISOString(),
    salt: `0x${SALT.toString(16)}`,
    status: "SEALED_BLIND_UNEVALUATED_FOR_TUNING",
    neonMutations: 0,
    paidInferenceCostUsd: 0,
    n: audits.length,
    quotas: QUOTAS,
    excludedExposedKeys: exposedKeys.size,
    excludedBlindDocs: ["gibraltar", "knife-river"],
    provenance: {
      selection: "executableEligible activations from PUBLIC_SEC_EDGAR scan, stratified by mechanic",
      shuffle: `deterministic LCG salt ${SALT}`,
      leakageControls: [
        "excluded frozen-61",
        "excluded cycle-5 holdout",
        "excluded cycle-6 0xc6c6 holdout",
        "excluded gibraltar/knife-river",
      ],
    },
    formulaPrecision: rate(formulaOk.length, audits.length),
    thresholdPrecision: rate(threshOk.length, audits.length),
    falseExecutableRate: rate(falseExec.length, audits.length),
    materialOmissionRate: rate(materialOm.length, audits.length),
    falseFavorableRate: rate(falseFavorable.length, audits.length),
    counselCompileEligible: reviewReady.filter((r) => r.counselCompileEligible).length,
    mayEnterCounselCompilePath: reviewReady.filter((r) => mayEnterCounselCompilePath(r)).length,
    promotionStateCounselWithoutFlag: reviewReady.filter(
      (r) => r.promotionState === "COUNSEL_COMPILE_ELIGIBLE" && !r.counselCompileEligible,
    ).length,
    productionAuthoritative: 0,
  };

  writeFileSync(path.join(outDir, "acceptance-sealed-holdout.json"), JSON.stringify({ ...report, audits, reviewReady }, null, 2));
  writeFileSync(path.join(outDir, "acceptance-sealed-summary.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
