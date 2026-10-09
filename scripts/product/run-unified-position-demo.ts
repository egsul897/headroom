/**
 * Reproducible Position / Simulate / Ask integration demo.
 * Uses LEGACY_ENGINE + labeled financials — never invents CERTIFIED capacity.
 * Does not post hypothetical effects to the ledger.
 *
 * Usage: npx tsx scripts/product/run-unified-position-demo.ts [companyId]
 */
import { writeFileSync, mkdirSync } from "fs";
import { resolve } from "path";
import { parseTransactionDraft, analyzeContemplatedTransaction } from "../../lib/product/north-star-workflow/transaction-analysis";
import { runLegacyEngineSimulation } from "../../lib/product/unified-position/legacy-simulate-bridge";
import {
  buildSimulateHandoffHref,
  simulateActionFromAskKind,
} from "../../lib/product/unified-position/simulate-handoff";
import { loadCapacityReadiness } from "../../lib/product/customer-intelligence/capacity-readiness";
import { getCovenantOverview, loadCovenantDataOrEmpty } from "../../lib/covenant-overview-service";
import { computeCovenantPosition } from "../../lib/covenant-engine";

const COMPANY_ID = process.argv[2] ?? process.env.DEMO_COMPANY_ID ?? "coherent";
const OUT_DIR = resolve("docs/product/unified-position");

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const report: Record<string, unknown> = {
    schema: "unified-position-demo.v1",
    companyId: COMPANY_ID,
    paidProvidersCalled: false,
    postsToLedger: false,
    authorityNote: "LEGACY_ENGINE · NOT_CERTIFIED_4E — demonstration only",
    startedAt: new Date().toISOString(),
  };

  const readiness = await loadCapacityReadiness(COMPANY_ID);
  report.positionReadiness = {
    status: readiness.status,
    capacityAuthority: readiness.capacityAuthority,
    canEvaluateExecutableCapacity: readiness.canEvaluateExecutableCapacity,
    ns4ApprovedSnapshotCount: readiness.ns4ApprovedSnapshotCount,
    headline: readiness.headline,
  };

  let overviewUtilizationHonesty: unknown = null;
  try {
    const overview = await getCovenantOverview(COMPANY_ID);
    const capacityRows = overview.covenantFamilies.flatMap((f) => f.rows.filter((r) => r.kind === "CAPACITY"));
    overviewUtilizationHonesty = {
      capacityRowCount: capacityRows.length,
      allUtilizationPctNull: capacityRows.every((r) => r.kind === "CAPACITY" && r.utilizationPct === null),
      allRemainingNullWhenNotTracked: capacityRows.every(
        (r) => r.kind === "CAPACITY" && (r.usageState !== "NOT_TRACKED" || r.remaining === null),
      ),
    };
  } catch (e) {
    overviewUtilizationHonesty = { error: e instanceof Error ? e.message : String(e) };
  }
  report.overviewUtilizationHonesty = overviewUtilizationHonesty;

  const scenarios = [
    { label: "below_limit_secured", q: "Can we incur $50 million of secured debt on 2026-06-30?" },
    { label: "at_limit_probe", q: "Can we incur $100 million of secured debt on 2026-06-30?" },
    { label: "above_limit_probe", q: "Can we incur $5000 million of secured debt on 2026-06-30?" },
    { label: "dividend", q: "Can we pay a $25 million dividend on 2026-06-30?" },
    { label: "investment", q: "Can we make a $25 million investment on 2026-06-30?" },
    { label: "unsecured", q: "Can we incur $75 million of unsecured debt on 2026-06-30?" },
    { label: "missing_amount", q: "Can we incur secured debt on 2026-06-30?" },
  ];

  const results: unknown[] = [];
  for (const s of scenarios) {
    const draft = parseTransactionDraft(s.q);
    const action = simulateActionFromAskKind(draft.kind);
    const simulateHref =
      action && draft.amountMillions != null
        ? buildSimulateHandoffHref(COMPANY_ID, {
            action,
            amountMillions: draft.amountMillions,
            secured: draft.secured,
            evaluationDate: draft.evaluationDate,
            source: "demo",
          })
        : null;

    let legacy: unknown = null;
    if (
      draft.amountMillions != null &&
      (draft.kind === "SECURED_DEBT" ||
        draft.kind === "UNSECURED_DEBT" ||
        draft.kind === "RESTRICTED_PAYMENT" ||
        draft.kind === "INVESTMENT")
    ) {
      legacy = await runLegacyEngineSimulation({
        companyId: COMPANY_ID,
        kind: draft.kind,
        amountMillions: draft.amountMillions,
        secured: draft.secured,
        asOfDate: draft.evaluationDate ? new Date(`${draft.evaluationDate}T12:00:00.000Z`) : undefined,
      });
    }

    let ask: unknown = null;
    try {
      ask = await analyzeContemplatedTransaction({
        companyId: COMPANY_ID,
        question: s.q,
        confirmed: true,
      });
    } catch (e) {
      ask = { error: e instanceof Error ? e.message : String(e) };
    }

    results.push({
      label: s.label,
      question: s.q,
      draft,
      simulateHref,
      legacySimulation: legacy,
      askAnswerKind: (ask as { answer?: { kind?: string } })?.answer?.kind ?? null,
      askSimulateHref: (ask as { simulateHref?: string | null })?.simulateHref ?? null,
    });
  }
  report.scenarios = results;

  // Cross-document note from a debt run when possible
  try {
    const asOf = new Date("2026-06-30T12:00:00.000Z");
    const data = await loadCovenantDataOrEmpty(COMPANY_ID, asOf);
    const position = computeCovenantPosition(data);
    report.crossDocumentPosition = {
      documentCount: position.documents.length,
      secured: position.crossDocumentSecured,
      unsecured: position.crossDocumentUnsecured,
      note: "Permission under one agreement does not override a prohibition under another.",
    };
  } catch (e) {
    report.crossDocumentPosition = { error: e instanceof Error ? e.message : String(e) };
  }

  report.finishedAt = new Date().toISOString();
  const outPath = resolve(OUT_DIR, "demo-report.json");
  writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  console.log(`\nWrote ${outPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
