/**
 * Knife River §7.01 credential / readiness PROBE (not a live interpretation harness).
 *
 * This script:
 *   - Asserts structural presence of base doc-a §7.01
 *   - Asserts provisional amendments are NOT consolidated into operative authority
 *   - Reports whether certified live interpretation could be attempted
 *
 * It does NOT implement the authorized live certified interpretation path.
 * Even with credentials present, it refuses with LIVE_PATH_NOT_IMPLEMENTED
 * rather than inventing IR or initiating paid calls.
 *
 * No paid inference is authorized by running this script.
 *
 *   npx tsx scripts/agent6/attempt-knife-river-701-verified-rule.ts
 *   npx tsx scripts/agent6/attempt-knife-river-701-verified-rule.ts --live
 *     → still refuses until LIVE_PATH_IMPLEMENTED is wired and budget/config gates pass
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { runStructureStage } from "../../lib/contract-model/compiler/stage-structure";
import { detectStructuralDefinitions } from "../../lib/contract-model/compiler/structural-definitions";
import { detectStructuralReferences } from "../../lib/contract-model/compiler/structural-references";
import { buildStructuralIndex } from "../../lib/contract-model/compiler/structural-index";
import { buildPackageGraph } from "../../lib/contract-model/compiler/package-graph/pipeline";
import {
  discoveryAssociatedDocumentIds,
  isLegallyConfirmedAmendmentChain,
  mayConsolidateOperativeAgreement,
} from "../../lib/contract-model/compiler/package-graph/instrument-grouping";
import { runPassADeterministicSignals } from "../../lib/contract-model/compiler/discovery/pass-a-signals";
import { assessPassAEligibility } from "../../lib/contract-model/compiler/discovery/eligibility";
import { getStageCaller } from "../../lib/contract-model/compiler/llm-caller";

const ROOT = "tests/fixtures/authentic-packages/knife-river-2023-2026";
const OUT = "docs/agent-6-authentic-company-e2e/14-knife-river-701-verified-rule-attempt";
const SECTION = "7.01";
const LIVE = process.argv.includes("--live");

/**
 * Truthful implementation gate. The certified live path
 * (createCertifiedCallers → compileCandidateToVerifiedIR → certify) is NOT
 * wired in this probe. Do not flip to true without an independently reviewed
 * implementation and budget controls.
 */
const LIVE_PATH_IMPLEMENTED = false;

function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

function parseBudgetCeilingUsd(): { ok: boolean; value: number | null; raw: string | undefined } {
  const raw = process.env.KNIFE_RIVER_701_BUDGET_CEILING_USD;
  if (raw === undefined || raw.trim() === "") return { ok: false, value: null, raw };
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) return { ok: false, value: null, raw };
  return { ok: true, value, raw };
}

function main() {
  mkdirSync(OUT, { recursive: true });
  const manifest = JSON.parse(readFileSync(join(ROOT, "package-manifest.json"), "utf8")) as {
    documents: Array<{ documentId: string; file: string; label: string }>;
  };
  const docs = manifest.documents.map((d) => ({
    documentId: d.documentId,
    label: d.label,
    file: d.file,
    text: readFileSync(join(ROOT, "extracted-text", d.file), "utf8"),
  }));
  const base = docs.find((d) => d.documentId === "doc-a")!;
  const baseSha = sha256(base.text);

  const graph = buildPackageGraph("kr-701-pilot", "knife-river-2023-2026", docs.map((d) => ({
    documentId: d.documentId,
    label: d.label,
    text: d.text,
  })));
  const facility = graph.instruments.find((i) => i.baseDocumentId === "doc-a");
  const authority = {
    associationKind: facility?.associationKind ?? null,
    reviewStatus: facility?.reviewStatus ?? null,
    confirmedDocumentIds: facility?.documentIds ?? [],
    provisionalDocumentIds: facility?.provisionalDocumentIds ?? [],
    discoveryAssociatedDocumentIds: facility ? discoveryAssociatedDocumentIds(facility) : [],
    legallyConfirmedAmendmentChain: facility ? isLegallyConfirmedAmendmentChain(facility) : false,
    mayConsolidateOperativeAgreement: facility ? mayConsolidateOperativeAgreement(facility) : false,
    operativeAuthorityScope: "BASE_AGREEMENT_DOC_A_ONLY",
    note: "First/Second Amendments remain provisional discovery associations — not consolidated operative text and not canonical Document.instrumentId members.",
  };

  const structureDocs = [{ documentId: base.documentId, label: base.label, text: base.text }];
  const nodes = runStructureStage(structureDocs).output;
  const defs = detectStructuralDefinitions(base.documentId, base.text, nodes);
  const refs = detectStructuralReferences(base.documentId, base.text, nodes);
  const index = buildStructuralIndex(new Map([[base.documentId, { text: base.text, nodes }]]), defs, refs);
  const sectionNode = nodes.find((n) => n.nodeType === "SECTION" && n.sectionRef === SECTION);
  const passA = runPassADeterministicSignals(base.documentId, index);
  const passA701 = passA.filter((c) => c.sectionRef === SECTION || c.sectionRef?.startsWith(`${SECTION}.`));
  const eligibility = passA701.slice(0, 5).map(assessPassAEligibility);

  const excerptStart = sectionNode?.charStart ?? base.text.search(/Section[\u00a0\s]+7\.01/);
  const excerpt =
    excerptStart >= 0
      ? base.text.slice(excerptStart, excerptStart + 400).replace(/\s+/g, " ").trim()
      : null;

  const caller = getStageCaller();
  const structuralOk = !!sectionNode;
  const authorityOk =
    authority.mayConsolidateOperativeAgreement === false &&
    authority.legallyConfirmedAmendmentChain === false &&
    (facility?.documentIds.length === 1 && facility.documentIds[0] === "doc-a");

  const budget = parseBudgetCeilingUsd();
  const certifiedModelIdsPresent =
    !!process.env.KNIFE_RIVER_701_CERTIFIED_COMPILE_MODEL &&
    !!process.env.KNIFE_RIVER_701_CERTIFIED_INVENTORY_MODEL &&
    !!process.env.KNIFE_RIVER_701_CERTIFIED_VERIFY_MODEL;
  const hasGateway = !!process.env.AI_GATEWAY_API_KEY;
  const hasAnthropic = !!process.env.ANTHROPIC_API_KEY;
  const credentialPresent = hasGateway || hasAnthropic;
  const spendAuthorized = process.env.KNIFE_RIVER_701_INFERENCE_AUTHORIZED === "1";
  const offlineReplay = existsSync("tests/fixtures/phase-3-live-replay/knife-river-7.01");

  // Gate order: implementation → budget/config → only then credentials/spend.
  // Do not solicit credentials while the live path is unimplemented.
  const missingInputs: string[] = [];
  if (!structuralOk) missingInputs.push("STRUCTURAL_SECTION_7_01_ON_BASE");
  if (!LIVE_PATH_IMPLEMENTED) {
    missingInputs.push("IMPLEMENT_CERTIFIED_LIVE_PATH_createCertifiedCallers_compileCandidateToVerifiedIR");
  }
  if (LIVE_PATH_IMPLEMENTED && !budget.ok) {
    missingInputs.push("KNIFE_RIVER_701_BUDGET_CEILING_USD_POSITIVE");
  }
  if (LIVE_PATH_IMPLEMENTED && !certifiedModelIdsPresent) {
    missingInputs.push("KNIFE_RIVER_701_CERTIFIED_*_MODEL_IDS");
  }
  if (LIVE_PATH_IMPLEMENTED && budget.ok && certifiedModelIdsPresent && !credentialPresent) {
    missingInputs.push("AI_GATEWAY_API_KEY_OR_ANTHROPIC_API_KEY");
  }
  if (LIVE_PATH_IMPLEMENTED && budget.ok && certifiedModelIdsPresent && credentialPresent && !spendAuthorized) {
    missingInputs.push("KNIFE_RIVER_701_INFERENCE_AUTHORIZED=1");
  }
  if (!offlineReplay) {
    missingInputs.push("APPROVED_OFFLINE_REPLAY_CORPUS_FOR_KR_701");
  }

  const implementationReady = LIVE_PATH_IMPLEMENTED && budget.ok && certifiedModelIdsPresent;
  const canAttemptLive = LIVE && implementationReady && credentialPresent && spendAuthorized && structuralOk;

  let blockerClass: string;
  let blockerReason: string;
  if (!LIVE_PATH_IMPLEMENTED) {
    blockerClass = "LIVE_PATH_NOT_IMPLEMENTED";
    blockerReason =
      "This script is a credential/readiness probe only. The certified live interpretation path is not implemented; refusing rather than inventing IR or initiating paid calls. No credentials are requested until implementation and budget/config gates are independently verified.";
  } else if (!budget.ok) {
    blockerClass = "OPERATIONAL_BUDGET";
    blockerReason = "Live path exists but KNIFE_RIVER_701_BUDGET_CEILING_USD is missing or not a positive finite number. Paid inference must not start without a budget ceiling.";
  } else if (!certifiedModelIdsPresent) {
    blockerClass = "OPERATIONAL_CERTIFIED_CONFIG";
    blockerReason = "Live path exists but certified model ids are not configured. Uncertified model configurations must not initiate paid inference.";
  } else if (!structuralOk) {
    blockerClass = "STRUCTURAL";
    blockerReason = "Base doc-a §7.01 structural section node missing.";
  } else if (!LIVE) {
    blockerClass = "OPERATIONAL_LIVE_FLAG";
    blockerReason = "Implementation/budget/config gates cleared, but --live was not passed. Refuse automatic spend.";
  } else if (!credentialPresent) {
    blockerClass = "OPERATIONAL_CREDENTIAL";
    blockerReason = "No AI_GATEWAY_API_KEY or ANTHROPIC_API_KEY after implementation and budget gates cleared.";
  } else if (!spendAuthorized) {
    blockerClass = "OPERATIONAL_AUTHORIZATION";
    blockerReason = "Credentials present but KNIFE_RIVER_701_INFERENCE_AUTHORIZED≠1.";
  } else {
    blockerClass = "OPERATIONAL";
    blockerReason = "Prerequisite missing.";
  }

  const report = {
    schema: "agent6-knife-river-701-verified-rule-attempt.v1",
    role: "CREDENTIAL_READINESS_PROBE",
    livePathImplemented: LIVE_PATH_IMPLEMENTED,
    generatedAt: new Date().toISOString(),
    companyKey: "knife-river-2023-2026",
    target: {
      sectionRef: SECTION,
      family: "INDEBTEDNESS",
      operativeDocumentId: "doc-a",
      sourceFile: join(ROOT, "extracted-text", base.file),
      sourceSha256: baseSha,
      sourceExcerpt: excerpt,
      structuralNodeId: sectionNode?.nodeId ?? null,
      heading: sectionNode?.heading?.replace(/\s+/g, " ").trim() ?? null,
    },
    amendmentAuthority: authority,
    discovery: {
      passAHitsOnBase701: passA701.length,
      passAExecutableCount: eligibility.filter((e) => e.executable).length,
      agent1Eligibility: "SIGNAL_ONLY_NOT_EXECUTABLE",
      note: "Pass A identification is not legal interpretation and not a verified rule.",
    },
    gates: {
      structuralOk,
      livePathImplemented: LIVE_PATH_IMPLEMENTED,
      budgetCeilingUsd: budget.value,
      budgetOk: budget.ok,
      certifiedModelIdsPresent,
      credentialPresent,
      spendAuthorized,
      liveFlag: LIVE,
      offlineReplayAvailable: offlineReplay,
    },
    interpretation: {
      attempted: false,
      mode: "NOT_ATTEMPTED",
      fabricated: false,
      result: null as null | string,
      note: canAttemptLive
        ? "All runtime gates cleared but LIVE_PATH_IMPLEMENTED=false prevents execution; this is not evidence that interpretation ran."
        : "Interpretation not attempted.",
    },
    verifiedRule: {
      count: 0,
      certificationStatus: null as null | string,
      packageHash: null as null | string,
    },
    evaluation: {
      evaluateVerifiedCapacityInvoked: false,
      outcome: null as null | string,
      note: "A verified rule is not automatically numerical capacity. Remaining capacity withheld without utilization.",
    },
    blocker: {
      class: blockerClass,
      reason: blockerReason,
      missingInputs,
      exactProductionPathWhenImplementedAndAuthorized: [
        "createCertifiedCallers + certifiedConfig + HardDispatchBudget",
        "buildCandidateCompilerInput(doc-a §7.01)",
        "compileCandidateToVerifiedIR",
        "verifyCompiledCandidate → buildVerifiedUnitPackage → certifyCandidate",
        "evaluateVerifiedCapacity under REQUIRE only if CERTIFIED (gross may still be unavailable without financials)",
      ],
      offlineReplayAvailable: offlineReplay,
    },
    callerSynthetic: caller.isSynthetic,
    costUsd: 0,
    missionOutcome: "JUSTIFIED_REFUSAL",
    successCriterion: `JUSTIFIED_REFUSAL (${blockerClass}): verifiedRule.count=0; interpretation not fabricated; paid calls not initiated.`,
  };

  writeFileSync(join(OUT, "01-attempt-report.json"), JSON.stringify(report, null, 2) + "\n");
  writeFileSync(
    join(OUT, "00-authority-scope.json"),
    JSON.stringify(
      {
        amendmentsExcludedFromConsolidation: ["doc-b", "doc-c"],
        ...authority,
        sourceSha256: baseSha,
      },
      null,
      2,
    ) + "\n",
  );

  console.log(JSON.stringify({
    written: join(OUT, "01-attempt-report.json"),
    role: "CREDENTIAL_READINESS_PROBE",
    livePathImplemented: LIVE_PATH_IMPLEMENTED,
    structuralOk,
    authorityOk,
    passAHitsOnBase701: passA701.length,
    verifiedRuleCount: 0,
    interpretationAttempted: false,
    blockerClass,
    missingInputs,
    costUsd: 0,
    missionOutcome: "JUSTIFIED_REFUSAL",
  }, null, 2));

  process.exit(2);
}

main();
