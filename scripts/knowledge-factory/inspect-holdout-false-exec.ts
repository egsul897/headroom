/**
 * One-off inspection of Cycle 5 holdout false-executable (acceptance review).
 * Read-only. Does not retune gates against the holdout.
 */
import { prisma } from "../../lib/prisma";
import { summarizeFromStoredMetadata } from "../../lib/product/covenant-intelligence/summarize";
import { activateSummaryItem } from "../../lib/knowledge-factory/activation/provision-candidates";
import {
  extractOperativeWindow,
  independentFormulaFromOperative,
} from "../../lib/knowledge-factory/activation/independent-audit";

async function main() {
  const sourceId = "ehb:d6850bb1094c5499596f775e";
  const row = await prisma.knowledgeSource.findUnique({
    where: { sourceId },
    select: {
      sourceId: true,
      metadata: true,
      documentTitle: true,
      originalBytesHash: true,
      documentClass: true,
    },
  });
  if (!row?.originalBytesHash) throw new Error("missing source");
  const summary = summarizeFromStoredMetadata(row.metadata);
  const target = summary?.items?.find((i) => i.sectionRef === "6.01(g)");
  if (!target) throw new Error("missing item 6.01(g)");
  const act = activateSummaryItem({ sourceId, item: target });
  const blob = await prisma.documentByteObject.findUnique({
    where: { contentHash: row.originalBytesHash },
    select: { bytes: true },
  });
  const text = Buffer.from(blob!.bytes).toString("utf8");
  const win = extractOperativeWindow(text, "6.01(g)", target.operativeLanguageExcerpt);
  const indep = independentFormulaFromOperative(win, 250);
  const builderHit = win.match(/.{0,100}(?:Available Amount|Cumulative Credit|builder basket).{0,100}/i);
  const moneyHit = win.match(/.{0,100}250,000,000.{0,160}/i);
  console.log(
    JSON.stringify(
      {
        sourceId,
        documentTitle: row.documentTitle,
        documentClass: row.documentClass,
        sectionRef: target.sectionRef,
        heading: target.heading,
        posture: target.posture,
        families: target.families,
        activation: {
          readiness: act.readiness,
          executableEligible: act.executableEligible,
          formulaType: act.formulaType,
          thresholdValue: act.thresholdValue,
        },
        independent: indep,
        windowChars: win.length,
        builderContext: builderHit?.[0]?.replace(/\s+/g, " ")?.slice(0, 280) ?? null,
        thresholdContext: moneyHit?.[0]?.replace(/\s+/g, " ")?.slice(0, 280) ?? null,
        looksLikeEventOfDefault: /ERISA|Event of Default/i.test(win),
        productionPathway:
          "Could enter counsel-compile as FLAT UNVERIFIED if counsel ACCEPTed; not auto-written; not CERTIFIED. Should be blocked as EOD threshold / non-basket.",
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
