/**
 * Working demonstration of the unified customer product:
 *   Position → Simulate → Ask handoff → amount recompute freshness
 *
 *   npx tsx scripts/product/run-unified-customer-demo.ts [--company-id coherent]
 */
import { mkdirSync, writeFileSync } from "fs";
import path from "path";
import {
  analyzeAskForSimulate,
  fingerprintSimulationRequest,
  loadPositionView,
  loadVerifiedCustomerState,
  runUnifiedSimulation,
} from "@/lib/product/unified-customer";

async function main() {
  const arg = (name: string) => {
    const i = process.argv.indexOf(name);
    return i >= 0 ? process.argv[i + 1] : undefined;
  };
  const companyId = arg("--company-id") ?? "coherent";

  const state = await loadVerifiedCustomerState(companyId);
  const position = await loadPositionView(companyId);

  const ask = await analyzeAskForSimulate({
    companyId,
    question: "Can we incur $100 million of secured debt on 2026-08-01?",
    confirmed: true,
  });

  // Simulate panel loads verified state at the Ask evaluation date — same fingerprint the UI sends.
  const datedState = await loadVerifiedCustomerState(companyId, {
    evaluationDate: ask.structuredTransaction.evaluationDate,
  });

  const sim100 = await runUnifiedSimulation({
    companyId,
    kind: ask.structuredTransaction.kind,
    amountMillions: ask.structuredTransaction.amountMillions ?? 100,
    secured: ask.structuredTransaction.secured,
    evaluationDate: ask.structuredTransaction.evaluationDate,
    expectedStateFingerprint: datedState.stateFingerprint,
  });

  const sim250 = await runUnifiedSimulation({
    companyId,
    kind: ask.structuredTransaction.kind,
    amountMillions: 250,
    secured: ask.structuredTransaction.secured,
    evaluationDate: ask.structuredTransaction.evaluationDate,
    expectedStateFingerprint: datedState.stateFingerprint,
    priorRequestFingerprint: sim100.requestFingerprint,
  });

  const stale = await runUnifiedSimulation({
    companyId,
    kind: "SECURED_DEBT",
    amountMillions: 100,
    secured: true,
    expectedStateFingerprint: "stale-fingerprint-deliberate",
  });

  const report = {
    generatedAt: new Date().toISOString(),
    companyId,
    engineIntegration: {
      sharedStateFingerprint: state.stateFingerprint,
      asOfDateIso: state.asOfDateIso,
      authority: state.authority,
      positionUsesSameFingerprint: position.stateFingerprint === state.stateFingerprint,
      askHandoffFingerprintMatchesDatedState:
        ask.structuredTransaction.stateFingerprint === datedState.stateFingerprint,
      datedStateFingerprint: datedState.stateFingerprint,
    },
    position: {
      outcome: position.outcome,
      ratios: position.ratios,
      remainingCapacity: position.remainingCapacity,
      sharedConstraints: position.sharedConstraints.slice(0, 4),
      evidenceCount: position.evidence.length,
      basketCount: position.baskets.length,
      thresholdCount: position.covenantThresholds.length,
    },
    askToSimulate: {
      simulateHref: ask.simulateHref,
      structuredTransaction: ask.structuredTransaction,
      answerKind: ask.analysis.answer.kind,
      answerHeadline: ask.analysis.answer.headline,
    },
    simulate: {
      amount100: {
        requestFingerprint: sim100.requestFingerprint,
        outcome: sim100.outcome,
        engineStatus: sim100.engineStatus,
        bindingConstraints: sim100.bindingConstraints,
        prePostRatios: sim100.prePostRatios.slice(0, 4),
      },
      amount250: {
        requestFingerprint: sim250.requestFingerprint,
        outcome: sim250.outcome,
        engineStatus: sim250.engineStatus,
        fingerprintsDiffer: sim100.requestFingerprint !== sim250.requestFingerprint,
      },
      staleRejected: {
        stale: stale.stale,
        staleReason: stale.staleReason,
        outcomeKind: stale.outcome.kind,
      },
    },
    freshnessProof: {
      amountChangeChangesFingerprint:
        fingerprintSimulationRequest({
          stateFingerprint: state.stateFingerprint,
          kind: "SECURED_DEBT",
          amountMillions: 100,
          secured: true,
          evaluationDate: "2026-08-01",
        }) !==
        fingerprintSimulationRequest({
          stateFingerprint: state.stateFingerprint,
          kind: "SECURED_DEBT",
          amountMillions: 250,
          secured: true,
          evaluationDate: "2026-08-01",
        }),
    },
    costUsd: 0,
  };

  const outDir = path.join("docs", "product", "unified-customer");
  mkdirSync(outDir, { recursive: true });
  const outJson = path.join(outDir, "demo-report.json");
  writeFileSync(outJson, JSON.stringify(report, null, 2));

  const md = [
    "# Unified customer product — demo report",
    "",
    `- Company: \`${companyId}\``,
    `- Generated: ${report.generatedAt}`,
    `- Shared state fingerprint: \`${state.stateFingerprint}\``,
    `- Authority: ${state.authority.capacityAuthority}`,
    `- Cost: $0 (no paid provider calls)`,
    "",
    "## Engine integration",
    "",
    `- Position fingerprint match: ${report.engineIntegration.positionUsesSameFingerprint}`,
    `- Ask handoff href: \`${ask.simulateHref}\``,
    `- Amount 100→250 fingerprint change: ${report.simulate.amount250.fingerprintsDiffer}`,
    `- Stale state rejected: ${stale.stale} (${stale.staleReason ?? "—"})`,
    "",
    "## Outcomes",
    "",
    `- Position: **${position.outcome.kind}** — ${position.outcome.rationale}`,
    `- Simulate $100M: **${sim100.outcome.kind}** — ${sim100.outcome.rationale}`,
    `- Simulate $250M: **${sim250.outcome.kind}** — ${sim250.outcome.rationale}`,
    "",
    "## Provenance sample",
    "",
    ...(sim100.bindingConstraints.length
      ? sim100.bindingConstraints.map(
          (c) => `- ${c.documentName} §${c.sectionRef}${c.basketName ? ` (${c.basketName})` : ""}`,
        )
      : ["- (no binding provision on this run)"]),
    "",
  ].join("\n");
  writeFileSync(path.join(outDir, "demo-report.md"), md);

  console.log(JSON.stringify({ ok: true, outJson, outcome100: sim100.outcome.kind, stale: stale.stale }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
