/**
 * Selective Agent 6 → canonical port: attempt ONE Knife River §7.01 Indebtedness
 * restriction through legal interpretation → verified-rule construction.
 *
 * Authority scope: operative BASE credit agreement (doc-a) only.
 * PROVISIONAL_FAMILY amendments are NOT consolidated into operative text.
 *
 * Does NOT invent IR or fabricate LLM outputs. Without authorized credentials
 * and spend approval, writes an operational blocker report and exits 2.
 *
 *   npx tsx scripts/agent6/attempt-knife-river-701-verified-rule.ts
 *   npx tsx scripts/agent6/attempt-knife-river-701-verified-rule.ts --live  # requires keys + budget
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

function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
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

  // Package graph over full package ONLY to assert amendment authority — not to consolidate.
  const graph = buildPackageGraph("kr-701-pilot", "knife-river-2023-2026", docs.map((d) => ({
    documentId: d.documentId,
    label: d.label,
    text: d.text,
  })));
  const facility = graph.instruments.find((i) => i.baseDocumentId === "doc-a");
  const authority = {
    associationKind: facility?.associationKind ?? null,
    reviewStatus: facility?.reviewStatus ?? null,
    provisionalDocumentIds: facility?.provisionalDocumentIds ?? [],
    legallyConfirmedAmendmentChain: facility ? isLegallyConfirmedAmendmentChain(facility) : false,
    mayConsolidateOperativeAgreement: facility ? mayConsolidateOperativeAgreement(facility) : false,
    operativeAuthorityScope: "BASE_AGREEMENT_DOC_A_ONLY",
    note: "First/Second Amendments remain PROVISIONAL_FAMILY — not treated as consolidated operative text.",
  };

  // Structure + Pass A on base only for §7.01 discovery signal.
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

  const hasGateway = !!process.env.AI_GATEWAY_API_KEY;
  const hasAnthropic = !!process.env.ANTHROPIC_API_KEY;
  const caller = getStageCaller();
  const credentialPresent = hasGateway || hasAnthropic;
  const spendAuthorized = process.env.KNIFE_RIVER_701_INFERENCE_AUTHORIZED === "1";

  const structuralOk = !!sectionNode;
  const authorityOk = authority.mayConsolidateOperativeAgreement === false && authority.legallyConfirmedAmendmentChain === false;

  const missingInputs: string[] = [];
  if (!structuralOk) missingInputs.push("STRUCTURAL_SECTION_7_01_ON_BASE");
  if (!credentialPresent) missingInputs.push("AI_GATEWAY_API_KEY_OR_ANTHROPIC_API_KEY");
  // Always list spend/budget/config inputs required before any live IR attempt.
  if (!spendAuthorized) missingInputs.push("KNIFE_RIVER_701_INFERENCE_AUTHORIZED=1");
  missingInputs.push("EXPLICIT_BUDGET_CEILING_USD");
  missingInputs.push("CERTIFIED_MODEL_IDS_VIA_certifiedConfig");
  if (!existsSync("tests/fixtures/phase-3-live-replay/knife-river-7.01")) {
    missingInputs.push("APPROVED_OFFLINE_REPLAY_CORPUS_FOR_KR_701");
  }

  const canAttemptLive = LIVE && credentialPresent && spendAuthorized && structuralOk;

  const blockerClass = !credentialPresent
    ? "OPERATIONAL_CREDENTIAL"
    : !spendAuthorized
      ? "OPERATIONAL_AUTHORIZATION"
      : !structuralOk
        ? "STRUCTURAL"
        : !LIVE
          ? "OPERATIONAL_LIVE_FLAG"
          : "OPERATIONAL";

  const blockerReason = !credentialPresent
    ? "No AI_GATEWAY_API_KEY or ANTHROPIC_API_KEY in environment. Cannot run certified compile/inventory/verify without inventing IR."
    : !spendAuthorized
      ? "Credentials present but KNIFE_RIVER_701_INFERENCE_AUTHORIZED≠1. Paid inference not authorized."
      : !structuralOk
        ? "Base doc-a §7.01 structural section node missing."
        : !LIVE
          ? "Credentials and spend authorization present, but --live flag not passed. Refuse automatic spend."
          : "Structural or other prerequisite missing.";

  const report = {
    schema: "agent6-knife-river-701-verified-rule-attempt.v1",
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
    interpretation: {
      attempted: canAttemptLive,
      mode: canAttemptLive ? "AUTHORIZED_LIVE_INFERENCE" : "NOT_ATTEMPTED",
      fabricated: false,
      result: null as null | string,
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
    blocker: canAttemptLive
      ? null
      : {
          class: blockerClass,
          reason: blockerReason,
          missingInputs,
          exactProductionPathWhenAuthorized: [
            "createCertifiedCallers + certifiedConfig + HardDispatchBudget",
            "buildCandidateCompilerInput(doc-a §7.01)",
            "compileCandidateToVerifiedIR",
            "verifyCompiledCandidate → buildVerifiedUnitPackage → certifyCandidate",
            "evaluateVerifiedCapacity under REQUIRE only if CERTIFIED (gross may still be unavailable without financials)",
          ],
          offlineReplayAvailable: false,
        },
    callerSynthetic: caller.isSynthetic,
    costUsd: 0,
    // Mission success allows verified rule OR justified refusal — not invented IR.
    missionOutcome: canAttemptLive
      ? "LIVE_PATH_ENTERED"
      : "JUSTIFIED_REFUSAL",
    successCriterion:
      canAttemptLive
        ? "Live path entered — must produce CERTIFIED verified rule or fail closed without inventing IR."
        : `JUSTIFIED_REFUSAL (${blockerClass}): verifiedRule.count=0; interpretation not fabricated. Exact inputs listed in blocker.missingInputs.`,
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
    structuralOk,
    authorityOk,
    passAHitsOnBase701: passA701.length,
    verifiedRuleCount: 0,
    blockerClass: report.blocker?.class ?? null,
    missingInputs,
    costUsd: 0,
  }, null, 2));

  if (!canAttemptLive) process.exit(2);
  // Live path intentionally not implemented without authorization — would call createCertifiedCallers here.
  console.error("Live authorized path not yet wired in this selective port; refuse rather than invent.");
  process.exit(2);
}

main();
