/**
 * Reproducible Position / Simulate / Ask integration demo.
 * LEGACY_ENGINE + verified-gate refusals + optional FIXTURE verified executable path.
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
import { attemptVerifiedSimulate, summarizeVerifiedSimulate } from "../../lib/product/unified-position/certified-simulate-bridge";
import { loadCapacityReadiness } from "../../lib/product/customer-intelligence/capacity-readiness";
import { getCovenantOverview, loadCovenantDataOrEmpty, loadCovenantOverviewInputs } from "../../lib/covenant-overview-service";
import { buildCovenantOverview } from "../../lib/covenant-overview-builder";
import { computeCovenantPosition } from "../../lib/covenant-engine";
import { computeTransactionEffects } from "../../lib/product/unified-position/transaction-effects";
import { DEMO_EXERCISES } from "../../lib/product/north-star-workflow/demo-exercises";
import {
  buildFixtureVerifiedPackage,
  runFixtureCertifiedPath,
} from "../../lib/product/north-star-workflow/fixture-verified-package";
import {
  applyAttributedUsageToCapacity,
  indexAttributedUsages,
  resolveRowAttribution,
  type AttributedLedgerUsageInput,
} from "../../lib/product/unified-position/attributed-utilization";
import { loadAttributedUtilization } from "../../lib/product/unified-position/attributed-utilization-server";

const COMPANY_ID = process.argv[2] ?? process.env.DEMO_COMPANY_ID ?? "coherent";
const OUT_DIR = resolve("docs/product/unified-position");

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const report: Record<string, unknown> = {
    schema: "unified-position-demo.v2",
    companyId: COMPANY_ID,
    paidProvidersCalled: false,
    postsToLedger: false,
    authorityNote: "LEGACY_ENGINE · NOT_CERTIFIED_4E — demonstration; verified path fail-closed without VEP",
    startedAt: new Date().toISOString(),
    executableOutcomes: [] as unknown[],
    correctRefusals: [] as unknown[],
  };

  const readiness = await loadCapacityReadiness(COMPANY_ID);
  report.positionReadiness = {
    status: readiness.status,
    capacityAuthority: readiness.capacityAuthority,
    canEvaluateExecutableCapacity: readiness.canEvaluateExecutableCapacity,
    ns4ApprovedSnapshotCount: readiness.ns4ApprovedSnapshotCount,
    headline: readiness.headline,
  };

  let overviewUtilization: unknown = null;
  try {
    const overview = await getCovenantOverview(COMPANY_ID);
    const attribution = await loadAttributedUtilization(COMPANY_ID).catch(() => null);
    const capacityRows = overview.covenantFamilies.flatMap((f) => f.rows.filter((r) => r.kind === "CAPACITY"));
    const tracked = capacityRows.filter((r) => r.kind === "CAPACITY" && r.usageState === "TRACKED");
    const notTracked = capacityRows.filter((r) => r.kind === "CAPACITY" && r.usageState === "NOT_TRACKED");
    overviewUtilization = {
      capacityRowCount: capacityRows.length,
      trackedCount: tracked.length,
      notTrackedCount: notTracked.length,
      notTrackedAllNull:
        notTracked.every((r) => r.kind === "CAPACITY" && r.used === null && r.remaining === null && r.utilizationPct === null),
      attributedActiveUsageCount: attribution?.activeUsageCount ?? 0,
      attributedKeys: attribution?.entries.map((e) => e.key) ?? [],
      sampleTracked: tracked.slice(0, 3).map((r) =>
        r.kind === "CAPACITY"
          ? {
              name: r.name,
              currentCapacity: r.currentCapacity,
              used: r.used,
              remaining: r.remaining,
              utilizationPct: r.utilizationPct,
            }
          : null,
      ),
    };
  } catch (e) {
    overviewUtilization = { error: e instanceof Error ? e.message : String(e) };
  }
  report.overviewUtilization = overviewUtilization;

  // In-memory attributed-utilization proof (does not write ContractLedgerUsage).
  // Joins a synthetic 4C usage to a real Permission.code from this company.
  try {
    const inputs = await loadCovenantOverviewInputs(COMPANY_ID);
    const joinCode = inputs.permissionRows.find((p) => p.code)?.code ?? null;
    if (joinCode) {
      const synthetic: AttributedLedgerUsageInput = {
        usageId: `demo-attr-${COMPANY_ID}-${joinCode}`.slice(0, 80),
        amount: { amount: "75000000", currency: "USD" },
        capacityPath: { kind: "RULE", ruleId: joinCode },
        status: "RECORDED",
      };
      const index = indexAttributedUsages(COMPANY_ID, [synthetic]);
      const overviewWithAttr = buildCovenantOverview({
        ...inputs,
        attributedUtilization: index,
      });
      const tracked = overviewWithAttr.covenantFamilies
        .flatMap((f) => f.rows)
        .filter((r) => r.kind === "CAPACITY" && r.usageState === "TRACKED");
      const sample = tracked[0];
      const hit = resolveRowAttribution(index, [joinCode]);
      report.attributedUtilizationDemo = {
        persisted: false,
        joinCode,
        trackedRowCount: tracked.length,
        sample:
          sample && sample.kind === "CAPACITY"
            ? {
                name: sample.name,
                sectionRef: sample.sectionRef,
                currentCapacity: sample.currentCapacity,
                used: sample.used,
                remaining: sample.remaining,
                utilizationPct: sample.utilizationPct,
              }
            : null,
        applyCheck: applyAttributedUsageToCapacity({
          currentCapacity: sample && sample.kind === "CAPACITY" ? sample.currentCapacity : 200,
          capacityUnlimited: false,
          attributed: hit,
        }),
      };
      if (tracked.length > 0) {
        (report.executableOutcomes as unknown[]).push({
          kind: "ATTRIBUTED_BASKET_UTILIZATION",
          joinCode,
          usedMillions: sample && sample.kind === "CAPACITY" ? sample.used : null,
          remainingMillions: sample && sample.kind === "CAPACITY" ? sample.remaining : null,
        });
      }
    } else {
      report.attributedUtilizationDemo = { persisted: false, joinCode: null, note: "No Permission.code to join" };
    }
  } catch (e) {
    report.attributedUtilizationDemo = { error: e instanceof Error ? e.message : String(e) };
  }

  // Ratio calculation (financially supported)
  try {
    const asOf = new Date("2026-06-30T12:00:00.000Z");
    const data = await loadCovenantDataOrEmpty(COMPANY_ID, asOf);
    const position = computeCovenantPosition(data);
    const effects = computeTransactionEffects({
      data,
      kind: "DEBT_INCURRENCE",
      amountMillions: 100,
      secured: true,
    });
    report.ratioAndEffects = {
      preTotalNetLeverage: position.metrics.totalNetLeverage,
      securedDebt: data.financials.securedDebt,
      totalDebt: data.financials.totalDebt,
      ebitda: data.financials.ebitda,
      effects,
    };
    if (effects && !("refused" in effects)) {
      (report.executableOutcomes as unknown[]).push({
        kind: "LEGACY_PRE_POST_DEBT_INCURRENCE",
        amountMillions: 100,
        preTnl: effects.pre.totalNetLeverage,
        postTnl: effects.post.totalNetLeverage,
      });
    }
  } catch (e) {
    report.ratioAndEffects = { error: e instanceof Error ? e.message : String(e) };
  }

  const scenarios = [
    { label: "below_limit_secured", q: "Can we incur $50 million of secured debt on 2026-06-30?" },
    { label: "at_limit_probe", q: "Can we incur $100 million of secured debt on 2026-06-30?" },
    { label: "above_limit_probe", q: "Can we incur $5000 million of secured debt on 2026-06-30?" },
    { label: "dividend", q: "Can we pay a $25 million dividend on 2026-06-30?" },
    { label: "investment", q: "Can we make a $25 million investment on 2026-06-30?" },
    { label: "unsecured", q: "Can we incur $75 million of unsecured debt on 2026-06-30?" },
    { label: "repayment", q: "Can we repay $50 million of secured debt on 2026-06-30?" },
    { label: "equity_contribution", q: "Can we make a $25 million eligible equity contribution on 2026-06-30?" },
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
    if (draft.amountMillions != null) {
      const kind =
        /repay/.test(s.q.toLowerCase())
          ? "DEBT_REPAYMENT"
          : /equity contribution|eligible equity/.test(s.q.toLowerCase())
            ? "ELIGIBLE_EQUITY_CONTRIBUTION"
            : draft.kind === "SECURED_DEBT" ||
                draft.kind === "UNSECURED_DEBT" ||
                draft.kind === "RESTRICTED_PAYMENT" ||
                draft.kind === "INVESTMENT"
              ? draft.kind
              : null;
      if (kind) {
        legacy = await runLegacyEngineSimulation({
          companyId: COMPANY_ID,
          kind,
          amountMillions: draft.amountMillions,
          secured: draft.secured,
          asOfDate: draft.evaluationDate ? new Date(`${draft.evaluationDate}T12:00:00.000Z`) : undefined,
        });
      }
    }

    const verified = await attemptVerifiedSimulate({
      companyId: COMPANY_ID,
      evaluationDate: draft.evaluationDate ?? "",
      amountMillions: draft.amountMillions ?? 0,
      kind: draft.kind,
      secured: draft.secured,
      verifiedPackage: null,
    });
    const verifiedSummary = summarizeVerifiedSimulate(verified);
    if (!verifiedSummary.executable) {
      (report.correctRefusals as unknown[]).push({
        label: s.label,
        blockers: verifiedSummary.blockers,
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

    const askObj = ask as {
      answer?: { kind?: string };
      simulateHref?: string | null;
      executableOutcomes?: unknown;
      legacySimulation?: { overallStatus?: string; completeness?: { verdict?: string } };
    };

    results.push({
      label: s.label,
      question: s.q,
      draft,
      simulateHref,
      legacySimulation: legacy,
      verifiedSummary,
      askAnswerKind: askObj?.answer?.kind ?? null,
      askSimulateHref: askObj?.simulateHref ?? null,
      askExecutableOutcomes: askObj?.executableOutcomes ?? null,
      askLegacyStatus: askObj?.legacySimulation?.overallStatus ?? null,
      consistency:
        legacy &&
        typeof legacy === "object" &&
        !("refused" in (legacy as object)) &&
        askObj?.legacySimulation?.overallStatus != null
          ? {
              legacyStatus: (legacy as { overallStatus: string }).overallStatus,
              askLegacyStatus: askObj.legacySimulation.overallStatus,
              match:
                (legacy as { overallStatus: string }).overallStatus ===
                askObj.legacySimulation.overallStatus,
            }
          : null,
    });
  }
  report.scenarios = results;

  // FIXTURE verified executable path (synthetic — labeled; not customer CERTIFIED)
  const exercise = DEMO_EXERCISES.find((e) => !e.fixtureIr.blockVerifiedPackage) ?? DEMO_EXERCISES[0]!;
  const fixturePkg = buildFixtureVerifiedPackage(exercise);
  const fixtureRun = runFixtureCertifiedPath(exercise);
  report.fixtureVerifiedExecutable = {
    exerciseId: exercise.id,
    packageBlocked: "blocked" in fixturePkg && fixturePkg.blocked,
    runBlocked: fixtureRun.blocked,
    blocker: fixtureRun.blocker,
    capacityOutcome: fixtureRun.capacity?.outcome ?? null,
    simulationOutcome: fixtureRun.simulation?.outcome ?? null,
    note: "FIXTURE_IR — SYNTHETIC VerifiedExecutionPackage; demonstrates verified pre/post when gates pass",
  };
  if (!fixtureRun.blocked && fixtureRun.simulation?.outcome === "EXECUTED") {
    (report.executableOutcomes as unknown[]).push({
      kind: "FIXTURE_VERIFIED_SIMULATION",
      exerciseId: exercise.id,
      capacityOutcome: fixtureRun.capacity?.outcome,
      simulationOutcome: fixtureRun.simulation.outcome,
    });
  } else if (!fixtureRun.blocked && fixtureRun.capacity?.outcome === "EXECUTED") {
    (report.executableOutcomes as unknown[]).push({
      kind: "FIXTURE_VERIFIED_CAPACITY",
      exerciseId: exercise.id,
      capacityOutcome: fixtureRun.capacity.outcome,
    });
  } else {
    (report.correctRefusals as unknown[]).push({
      label: "fixture_verified",
      blockers: [fixtureRun.blocker ?? "FIXTURE_BLOCKED"],
    });
  }

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
