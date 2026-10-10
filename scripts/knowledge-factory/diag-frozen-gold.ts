import { readFileSync } from "node:fs";
import { prisma } from "../../lib/prisma";
import { summarizeFromStoredMetadata } from "../../lib/product/covenant-intelligence/summarize";
import { activateSummaryItem } from "../../lib/knowledge-factory/activation/provision-candidates";

async function main() {
  const cohort = JSON.parse(
    readFileSync("docs/intelligence-factory/cycle-5/fixed-cohort-61.json", "utf8"),
  ) as {
    cases: Array<{
      sourceId: string;
      sectionRef: string;
      disposition: string;
      formulaType: string;
    }>;
  };
  const gold = cohort.cases.filter(
    (c) => c.disposition === "REVIEW_READY_EXECUTABLE" || c.disposition === "REVIEW_READY_WITH_GAPS",
  );
  for (const c of gold) {
    const row = await prisma.knowledgeSource.findUnique({
      where: { sourceId: c.sourceId },
      select: { metadata: true },
    });
    if (!row) {
      console.log(JSON.stringify({ sectionRef: c.sectionRef, status: "NO_ROW" }));
      continue;
    }
    const summary = summarizeFromStoredMetadata(row.metadata);
    const item = summary?.items?.find((i) => i.sectionRef === c.sectionRef);
    if (!item) {
      console.log(JSON.stringify({ sectionRef: c.sectionRef, status: "NO_ITEM", priorFt: c.formulaType }));
      continue;
    }
    const act = activateSummaryItem({ sourceId: c.sourceId, item });
    const failedGates = (act.eligibilityGates ?? []).filter((g) => g.ok === false).map((g) => g.gate);
    console.log(
      JSON.stringify({
        sectionRef: c.sectionRef,
        priorFt: c.formulaType,
        ready: act.readiness,
        exec: act.executableEligible,
        ft: act.formulaType,
        failedGates,
        excerptLen: (item.operativeLanguageExcerpt ?? "").length,
        basketLen: (item.materialBasketsThresholds ?? []).join(" ").length,
        heading: item.heading.slice(0, 48),
      }),
    );
  }
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
