/**
 * Cycle 6 diagnostic — frozen-61 TP/FP/FN with full source load (not 400-scan).
 */
import { readFileSync } from "node:fs";
import { prisma } from "../../lib/prisma";
import { summarizeFromStoredMetadata } from "../../lib/product/covenant-intelligence/summarize";
import { activateSummaryItem } from "../../lib/knowledge-factory/activation/provision-candidates";

async function main() {
  const frozen = JSON.parse(
    readFileSync("docs/intelligence-factory/cycle-5/fixed-cohort-61.json", "utf8"),
  ) as {
    cases: Array<{
      sourceId: string;
      sectionRef: string;
      falseExecutable: boolean;
      disposition: string;
      formulaType: string;
    }>;
  };
  const goldNeg = frozen.cases.filter((c) => c.falseExecutable);
  const goldPos = frozen.cases.filter(
    (c) => c.disposition === "REVIEW_READY_EXECUTABLE" || c.disposition === "REVIEW_READY_WITH_GAPS",
  );

  async function actCase(c: (typeof frozen.cases)[0]) {
    const row = await prisma.knowledgeSource.findUnique({
      where: { sourceId: c.sourceId },
      select: { metadata: true, documentTitle: true },
    });
    if (!row) return { c, status: "NO_ROW" as const };
    const summary = summarizeFromStoredMetadata(row.metadata);
    const item = summary?.items?.find((i) => i.sectionRef === c.sectionRef);
    if (!item) return { c, status: "NO_ITEM" as const };
    const act = activateSummaryItem({ sourceId: c.sourceId, item });
    return { c, status: "OK" as const, act, item, title: row.documentTitle };
  }

  const fps = [];
  for (const c of goldNeg) {
    const r = await actCase(c);
    if (r.status === "OK" && r.act.executableEligible) {
      fps.push({
        sourceId: c.sourceId,
        sectionRef: c.sectionRef,
        heading: r.act.heading.slice(0, 80),
        families: r.act.families,
        ft: r.act.formulaType,
        thr: r.act.thresholdValue,
        failedGates: (r.act.eligibilityGates || [])
          .filter((g) => !g.ok)
          .map((g) => `${g.gate}:${g.detail}`),
        excerpt: (r.item.operativeLanguageExcerpt || "").slice(0, 280),
        baskets: (r.item.materialBasketsThresholds || []).slice(0, 2),
      });
    }
  }
  console.log("FPS", JSON.stringify(fps, null, 2));

  const blockedNp = [];
  for (const c of goldPos) {
    const r = await actCase(c);
    if (r.status === "OK" && r.act.readiness === "BLOCKED_NON_PERMISSION_THRESHOLD") {
      blockedNp.push({
        sourceId: c.sourceId,
        sectionRef: c.sectionRef,
        heading: r.act.heading,
        families: r.act.families,
        ft: c.formulaType,
        excerpt: (r.item.operativeLanguageExcerpt || "").slice(0, 320),
      });
    }
  }
  console.log("GOLD+_NP_BLOCK", JSON.stringify(blockedNp, null, 2));

  let tp = 0;
  let fn = 0;
  let tn = 0;
  let fp = 0;
  const fnDetail = [];
  for (const c of goldPos) {
    const r = await actCase(c);
    if (r.status === "OK" && r.act.executableEligible) tp += 1;
    else {
      fn += 1;
      fnDetail.push({
        sectionRef: c.sectionRef,
        ft: c.formulaType,
        ready: r.status === "OK" ? r.act.readiness : r.status,
        heading: r.status === "OK" ? r.act.heading.slice(0, 50) : "",
        failed:
          r.status === "OK"
            ? (r.act.eligibilityGates || []).filter((g) => !g.ok).map((g) => g.gate)
            : [],
      });
    }
  }
  for (const c of goldNeg) {
    const r = await actCase(c);
    if (r.status === "OK" && r.act.executableEligible) fp += 1;
    else tn += 1;
  }
  console.log(
    JSON.stringify(
      { tp, fn, tn, fp, recall: tp / (tp + fn), precision: tp / (tp + fp || 1), fnDetail },
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
