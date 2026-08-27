/**
 * Phase 3B - real, paid regression run against FWRG (2021 credit agreement)
 * and LSB (2023 ABL credit agreement) - two KNOWN packages already used
 * for Phase 3A's own IR fixtures (never the reserved Phase 3F unseen
 * package). Run via: npx tsx --env-file=.env.local scripts/phase-3b-real-regression.ts
 *
 * Builds a REAL StructuralIndex from the real, verbatim article-6/
 * definitions-excerpt source text files already in this repo (Phase 2A's
 * own runStructureStage + structural-definitions/references detectors -
 * never a hand-rolled parser), a REAL CovenantContextBundle via Phase 2D's
 * own buildCovenantContextBundle for each selected provision, and then
 * calls the REAL compileCovenantToIR against the REAL Anthropic/Gateway
 * model (task's own authorization: FWRG + LSB, ~10 provisions, estimated
 * $2-10). DiscoveredCandidate identity is seeded directly from this
 * repository's own pre-existing, human-authored ground truth (never
 * re-running paid Phase 2B discovery - task §40's own cost discipline).
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { runStructureStage } from "../lib/contract-model/compiler/stage-structure";
import { detectStructuralDefinitions } from "../lib/contract-model/compiler/structural-definitions";
import { detectStructuralReferences } from "../lib/contract-model/compiler/structural-references";
import { buildStructuralIndex } from "../lib/contract-model/compiler/structural-index";
import { buildCovenantContextBundle } from "../lib/contract-model/compiler/context-retrieval/pipeline";
import type { DiscoveredCandidate, DiscoveryRole } from "../lib/contract-model/compiler/discovery/types";
import { compileCovenantToIR } from "../lib/contract-model/compiler/semantic/compile";
import { getSemanticCaller } from "../lib/contract-model/compiler/semantic/caller";
import { SEMANTIC_COMPILER_ALGORITHM_VERSION, SEMANTIC_COMPILER_PROMPT_VERSION, SEMANTIC_COMPILER_TOOL_POLICY_VERSION, type SemanticCompilerInput } from "../lib/contract-model/compiler/semantic/types";
import { gradeRule, gradeRules, summarizeGrading, type ExpectedRuleShape, type SemanticErrorFinding } from "../lib/contract-model/compiler/semantic/grading";
import { IR_SCHEMA_VERSION } from "../lib/contract-model/ir/types";
import type { StructuralNode } from "../lib/contract-model/compiler/types";
import type { CovenantFamily } from "@prisma/client";

export interface Case {
  pkg: "fwrg" | "lsb";
  id: string;
  documentId: string;
  kind: "section" | "definition";
  sectionRef?: string;
  termName?: string;
  family: CovenantFamily;
  role: DiscoveryRole;
  expected: ExpectedRuleShape[]; // one section may expect >1 rule (multi-basket)
}

/**
 * Phase 3B.1 (task §32-33) - exported so the zero-cost preserved-output
 * regrading script (scripts/phase-3b1-regrade-preserved.ts) can reuse this
 * EXACT SAME hand-authored ground truth rather than duplicating it - the
 * regrading step must compare against identical expectations, never a
 * forked/edited copy.
 */
export const CASES: Case[] = [
  { pkg: "fwrg", id: "fwrg-6.01-g-i", documentId: "fwrg-article-6", kind: "section", sectionRef: "6.01(g)(i)", family: "INDEBTEDNESS", role: "PERMISSION", expected: [{ ref: "fwrg-6.01-g-i", sourceSectionRef: "6.01(g)(i)", expectedAction: "GUARANTEE_DEBT", expectedPosture: "PERMISSION", expectedFlatAmount: 2_500_000, expectedPercent: 0.05, expectedMetricNameContains: "EBITDA" }] },
  { pkg: "fwrg", id: "fwrg-6.04-a-x", documentId: "fwrg-article-6", kind: "section", sectionRef: "6.04(a)(x)", family: "RESTRICTED_PAYMENTS", role: "BASKET", expected: [{ ref: "fwrg-6.04-a-x", sourceSectionRef: "6.04(a)(x)", expectedAction: "PAY_DIVIDEND", expectedPosture: "PERMISSION", expectedFlatAmount: 21_000_000, expectedPercent: 0.35, expectedMetricNameContains: "EBITDA", expectedConditionTypes: ["NO_DEFAULT"] }] },
  { pkg: "fwrg", id: "fwrg-6.04-a-xi", documentId: "fwrg-article-6", kind: "section", sectionRef: "6.04(a)(xi)", family: "RESTRICTED_PAYMENTS", role: "RATIO_BASED_PERMISSION", expected: [{ ref: "fwrg-6.04-a-xi", sourceSectionRef: "6.04(a)(xi)", expectedAction: "PAY_DIVIDEND", expectedPosture: "PERMISSION", expectedUnlimitedCapacity: true, expectedRatio: 3.5 }] },
  { pkg: "fwrg", id: "fwrg-6.04-b", documentId: "fwrg-article-6", kind: "section", sectionRef: "6.04(b)(iv)", family: "RESTRICTED_PAYMENTS", role: "BASKET", expected: [{ ref: "fwrg-6.04-b", sourceSectionRef: "6.04(b)(iv)", expectedAction: "PAY_JUNIOR_DEBT", expectedPosture: "PERMISSION", expectedFlatAmount: 21_000_000, expectedPercent: 0.35, expectedMetricNameContains: "EBITDA", expectedConditionTypes: ["NO_DEFAULT"] }] },
  { pkg: "fwrg", id: "fwrg-6.10-a", documentId: "fwrg-article-6", kind: "section", sectionRef: "6.10(a)", family: "FINANCIAL_COVENANTS", role: "FINANCIAL_TEST", expected: [{ ref: "fwrg-6.10-a", sourceSectionRef: "6.10(a)", expectedPosture: "OBLIGATION", expectedAction: "SATISFY_RATIO", expectedUnlimitedCapacity: true, expectedRatio: 5.0 }] },
  { pkg: "fwrg", id: "fwrg-6.10-b", documentId: "fwrg-article-6", kind: "section", sectionRef: "6.10(b)", family: "FINANCIAL_COVENANTS", role: "FINANCIAL_TEST", expected: [{ ref: "fwrg-6.10-b", sourceSectionRef: "6.10(b)", expectedPosture: "OBLIGATION", expectedAction: "SATISFY_RATIO", expectedUnlimitedCapacity: true, expectedRatio: 1.25 }] },
  { pkg: "fwrg", id: "fwrg-def-available-amount", documentId: "fwrg-definitions", kind: "definition", termName: "Available Amount", family: "DEFINITIONS_CALCULATION_RULES", role: "DEFINITIONAL_DEPENDENCY_CANDIDATE", expected: [{ ref: "fwrg-def-available-amount", sourceSectionRef: "Article 1", expectedRatio: 4.5 }] },
  { pkg: "lsb", id: "lsb-6.01-general-ratio-gated", documentId: "lsb-article-6", kind: "section", sectionRef: "6.01", family: "INDEBTEDNESS", role: "RATIO_BASED_PERMISSION", expected: [{ ref: "lsb-6.01-general-ratio-gated", sourceSectionRef: "6.01", expectedAction: "INCUR_DEBT", expectedPosture: "PERMISSION", expectedUnlimitedCapacity: true, expectedRatio: 2.0 }] },
  { pkg: "lsb", id: "lsb-6.01-i-flat-or-pct-assets", documentId: "lsb-article-6", kind: "section", sectionRef: "6.01(i)", family: "INDEBTEDNESS", role: "BASKET", expected: [{ ref: "lsb-6.01-i-flat-or-pct-assets", sourceSectionRef: "6.01(i)", expectedAction: "INCUR_DEBT", expectedPosture: "PERMISSION", expectedFlatAmount: 70_000_000, expectedPercent: 0.055, expectedMetricNameContains: "Asset" }] },
  { pkg: "lsb", id: "lsb-6.11-restricted-payments", documentId: "lsb-article-6", kind: "section", sectionRef: "6.11", family: "RESTRICTED_PAYMENTS", role: "GENERAL_PROHIBITION", expected: [{ ref: "lsb-6.11-restricted-payments", sourceSectionRef: "6.11", expectedFlatAmount: 500_000 }] },
  {
    pkg: "lsb",
    id: "lsb-6.13-investments",
    documentId: "lsb-article-6",
    kind: "section",
    sectionRef: "6.13",
    family: "INVESTMENTS",
    role: "BASKET",
    expected: [
      { ref: "lsb-6.13-investments-jv", sourceSectionRef: "6.13", expectedFlatAmount: 35_000_000 },
      { ref: "lsb-6.13-investments-general", sourceSectionRef: "6.13", expectedFlatAmount: 5_000_000 },
    ],
  },
  { pkg: "lsb", id: "lsb-def-abl-notes-priority-collateral", documentId: "lsb-definitions", kind: "definition", termName: "ABL Priority Collateral", family: "COLLATERAL_SECURITY", role: "OTHER_RELEVANT_RULE", expected: [{ ref: "lsb-def-abl-notes-priority-collateral", sourceSectionRef: "Article 1", expectedGenuinelyUnsupported: true }] },
];

/**
 * Phase 3B.1 (task §32-33) - extracted so the minimal real revalidation
 * rerun script (scripts/phase-3b1-real-revalidation-rerun.ts) can build the
 * EXACT SAME real StructuralIndex/context bundles for its narrow 3-case
 * subset, rather than duplicating this document-loading/parsing logic.
 */
export function loadFwrgLsbStructuralIndex() {
  const fwrgArticle6 = readFileSync("tests/fixtures/unseen-packages/fwrg-2021-credit-agreement/article-6-negative-covenants.txt", "utf-8");
  const fwrgDefs = readFileSync("tests/fixtures/unseen-packages/fwrg-2021-credit-agreement/definitions-excerpt.txt", "utf-8");
  const lsbArticle6 = readFileSync("tests/fixtures/unseen-packages/lsb-2023-abl-credit-agreement/article-6-negative-covenants.txt", "utf-8");
  const lsbDefs = readFileSync("tests/fixtures/unseen-packages/lsb-2023-abl-credit-agreement/definitions-excerpt.txt", "utf-8");

  const documents = [
    { documentId: "fwrg-article-6", label: "FWRG Article 6", text: fwrgArticle6 },
    { documentId: "fwrg-definitions", label: "FWRG Definitions", text: fwrgDefs },
    { documentId: "lsb-article-6", label: "LSB Article 6", text: lsbArticle6 },
    { documentId: "lsb-definitions", label: "LSB Definitions", text: lsbDefs },
  ];

  const structureResult = runStructureStage(documents);
  const allNodes = structureResult.output;

  const nodesByDocument = new Map<string, { text: string; nodes: StructuralNode[] }>();
  const allDefinitions = [];
  const allReferences = [];
  for (const doc of documents) {
    const nodes = allNodes.filter((n) => n.documentId === doc.documentId);
    nodesByDocument.set(doc.documentId, { text: doc.text, nodes });
    allDefinitions.push(...detectStructuralDefinitions(doc.documentId, doc.text, nodes));
    allReferences.push(...detectStructuralReferences(doc.documentId, doc.text, nodes));
  }
  const index = buildStructuralIndex(nodesByDocument, allDefinitions, allReferences);

  const exactTermsByDocument = new Map<string, Map<string, string>>();
  for (const def of allDefinitions) {
    if (!exactTermsByDocument.has(def.documentId)) exactTermsByDocument.set(def.documentId, new Map());
    exactTermsByDocument.get(def.documentId)!.set(def.normalizedTerm, def.exactTerm);
  }

  return { index, exactTermsByDocument };
}

/**
 * Phase 3B.1 (task §32-33) - extracted so the minimal revalidation rerun
 * script can build a real SemanticCompilerInput for ONE case at a time,
 * identical to what the full 12-case run builds, without duplicating the
 * candidate/context-bundle construction logic.
 */
export function buildCompilerInputForCase(c: Case, index: ReturnType<typeof buildStructuralIndex>, exactTermsByDocument: Map<string, Map<string, string>>): SemanticCompilerInput | null {
  const companyId = `${c.pkg}-real-regression`;
  const instrumentKey = `${c.pkg}-instrument`;

  let structuralNodeKeys: string[] = [];
  let operativeSourceText: string;
  if (c.kind === "section") {
    const node = index.getNodeByRef(c.documentId, c.sectionRef!);
    if (!node) {
      console.error(`SKIP ${c.id}: section ref "${c.sectionRef}" not found in ${c.documentId}`);
      return null;
    }
    structuralNodeKeys = [node.nodeKey];
    operativeSourceText = index.getNodeText(node.nodeKey, "DESCENDANTS");
  } else {
    let fullText = index.getDefinitionFullText(c.termName!, c.documentId);
    // FWRG's definitions-excerpt.txt lost its opening curly-quote character during curation
    // (every definition reads "Term &#148; means..." with no leading quote mark at all), so
    // structural-definitions.ts's own quote-bounded pattern - correctly - does not match it.
    // Real-regression-script-only fallback (never a change to the production detector): find
    // the term by name directly and bound it to the next "<Term> &#148; means" occurrence.
    if (!fullText) {
      const raw = index.getDocumentText(c.documentId) ?? "";
      const start = raw.indexOf(c.termName!);
      if (start >= 0) {
        const nextDefMatch = /[A-Z][a-zA-Z ]+ &#14[78]; means/g;
        nextDefMatch.lastIndex = start + c.termName!.length;
        const next = nextDefMatch.exec(raw);
        fullText = raw.slice(start, next ? next.index : raw.length);
      }
    }
    if (!fullText) {
      console.error(`SKIP ${c.id}: definition "${c.termName}" not found in ${c.documentId}`);
      return null;
    }
    operativeSourceText = fullText;
  }

  const candidate: DiscoveredCandidate = {
    discoveryId: c.id,
    documentId: c.documentId,
    structuralNodeKeys,
    normalizedSourceRef: c.sectionRef ?? c.termName ?? c.id,
    families: [c.family],
    role: c.role,
    roleRaw: c.role,
    roleNormalizationStatus: "VALID_CANONICAL",
    familiesRaw: [c.family],
    familiesNormalizationStatus: "VALID_CANONICAL",
    description: `real-regression seed for ${c.id}`,
    multipleRulesLikely: c.expected.length > 1,
    definedTermDependencyLikely: false,
    discoveryMethods: ["DETERMINISTIC_SIGNAL"],
    evidenceSignals: [],
    reviewStatus: "AUTO_ACCEPTED",
    confidence: 1,
    sourceCitation: `§${c.sectionRef ?? c.termName}`,
    discoveryRunVersion: "phase-3b-real-regression-seed.v1",
  };

  const contextBundle = buildCovenantContextBundle({ candidate, packageKey: `${c.pkg}-pkg`, companyId, instrumentKey, budget: undefined }, { index, packageGraph: null, exactTermsByDocument });

  return {
    companyId,
    instrumentKey,
    sourceDocumentId: c.documentId,
    candidateRef: c.id,
    sourceSectionRef: c.sectionRef ?? null,
    operativeSourceText,
    contextBundle,
    operativeLineage: null,
    toolAccess: { structuralIndex: index, operativeState: null, packageGraph: null, amendmentEffects: null, contextBundle },
    irSchemaVersion: IR_SCHEMA_VERSION,
    compilerAlgorithmVersion: SEMANTIC_COMPILER_ALGORITHM_VERSION,
    compilerPromptVersion: SEMANTIC_COMPILER_PROMPT_VERSION,
    toolPolicyVersion: SEMANTIC_COMPILER_TOOL_POLICY_VERSION,
  };
}

async function main() {
  const { index, exactTermsByDocument } = loadFwrgLsbStructuralIndex();

  const dryRun = process.env.DRY_RUN === "1";
  const caller = getSemanticCaller();
  console.log(`Using provider=${caller.providerName} model=${caller.model} synthetic=${caller.isSynthetic} dryRun=${dryRun}`);
  if (caller.isSynthetic && !dryRun) {
    console.error("No real credential found (AI_GATEWAY_API_KEY/ANTHROPIC_API_KEY) - refusing to run the 'real regression' with a synthetic caller. Run via: npx tsx --env-file=.env.local scripts/phase-3b-real-regression.ts (or DRY_RUN=1 to only validate section/definition resolution at zero cost).");
    process.exit(1);
  }

  const allFindings: SemanticErrorFinding[] = [];
  const allResults = [];
  const expectationsMap = new Map<string, ExpectedRuleShape>();
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let totalLatencyMs = 0;
  let totalCostUsd = 0;
  let totalToolCalls = 0;

  for (const c of CASES) {
    const compilerInput = buildCompilerInputForCase(c, index, exactTermsByDocument);
    if (!compilerInput) continue;

    console.log(`\n--- compiling ${c.id} (${c.kind === "section" ? `§${c.sectionRef}` : c.termName}) ---`);
    if (dryRun) {
      console.log(`  [dry run] operativeSourceText (${compilerInput.operativeSourceText.length} chars): ${compilerInput.operativeSourceText.slice(0, 200)}...`);
      console.log(`  [dry run] contextBundle items: ${compilerInput.contextBundle.items.length}, unresolvedDependencies: ${compilerInput.contextBundle.unresolvedDependencies.length}`);
      continue;
    }
    let result;
    try {
      result = await compileCovenantToIR(compilerInput);
    } catch (err) {
      console.error(`ERROR compiling ${c.id}: ${err instanceof Error ? err.message : String(err)}`);
      continue;
    }
    console.log(`status=${result.status} rules=${result.rules.length} definitions=${result.definitions.length} failureReasons=${result.failureReasons.join(",") || "(none)"}`);
    for (const rule of result.rules) console.log(`  rule ${rule.ruleId.slice(0, 20)}... action=${rule.action} posture=${rule.posture} sufficiency=${rule.sufficiency}`);
    for (const def of result.definitions) console.log(`  definition ${def.termName} sufficiency=${def.sufficiency}`);
    if (result.telemetry) {
      totalInputTokens += result.telemetry.inputTokens ?? 0;
      totalOutputTokens += result.telemetry.outputTokens ?? 0;
      totalLatencyMs += result.telemetry.latencyMs;
      totalCostUsd += result.telemetry.calculatedCostUsd ?? 0;
    }
    totalToolCalls += result.toolCallLog.length;
    allResults.push({ id: c.id, result });

    // Grade: match each expectation to the best-fitting compiled rule/definition BY CONTENT
    // (task §17 - Phase 3B.1's IR-aware grader), never by array position. A single definition
    // case still only ever has one compiled candidate, so gradeRule alone is unambiguous there;
    // multi-rule section cases go through gradeRules's own content-based matching.
    if (c.kind === "definition") {
      const compiledAsRule = result.definitions[0]
        ? ({ action: null, posture: "N_A", capacityExpression: result.definitions[0].calculationExpression, sufficiency: result.definitions[0].sufficiency, conditions: [] } as never)
        : undefined;
      const findings = gradeRule(compiledAsRule, c.expected[0]!);
      allFindings.push(...findings);
      expectationsMap.set(c.expected[0]!.ref, c.expected[0]!);
    } else {
      for (const exp of c.expected) expectationsMap.set(exp.ref, exp);
      const findings = gradeRules(result.rules, c.expected);
      allFindings.push(...findings);
    }
  }

  const summary = summarizeGrading(
    allResults.map((r) => r.result),
    expectationsMap,
    allFindings
  );

  console.log("\n================ PHASE 3B REAL REGRESSION SUMMARY ================");
  console.log(`Provider: ${caller.providerName} / ${caller.model}`);
  console.log(`Cases attempted: ${CASES.length}, results collected: ${allResults.length}`);
  console.log(`Total input tokens: ${totalInputTokens}, output tokens: ${totalOutputTokens}`);
  console.log(`Total calculated cost (PROJECTED, real token counts x published rate card): $${totalCostUsd.toFixed(4)}`);
  console.log(`Total latency: ${totalLatencyMs}ms, total tool calls: ${totalToolCalls}`);
  console.log(`Sufficiency distribution:`, summary.sufficiencyDistribution);
  console.log(`Findings by category:`, summary.byCategory);
  console.log(`Dangerous unflagged findings: ${summary.dangerousCount} / ${summary.findings.length} total findings`);
  console.log(`COMPLETE precision: ${summary.completePrecision === null ? "n/a (no COMPLETE rules)" : (summary.completePrecision * 100).toFixed(1) + "%"}`);
  console.log("\nAll findings:");
  for (const f of summary.findings) console.log(`  [${f.dangerous ? "DANGEROUS" : "flagged"}] ${f.category} (${f.ref}): ${f.detail}`);

  const outDir = "tests/fixtures/unseen-packages/phase-3b-real-regression-run";
  mkdirSync(outDir, { recursive: true });
  const outFile = `${outDir}/run-${Date.now()}.json`;
  writeFileSync(
    outFile,
    JSON.stringify(
      {
        provider: caller.providerName,
        model: caller.model,
        totalInputTokens,
        totalOutputTokens,
        totalCostUsd,
        totalLatencyMs,
        totalToolCalls,
        summary,
        results: allResults,
      },
      null,
      2
    )
  );
  console.log(`\nFull results written to ${outFile}`);
}

// Phase 3B.1 (task §32-33): guarded so that scripts/phase-3b1-regrade-preserved.ts can safely
// `import { CASES } from "./phase-3b-real-regression"` to reuse the SAME ground truth without
// duplicating it, without also triggering this file's own real-model run (which reads fixture
// files and calls getSemanticCaller() - side effects an importer must never trigger merely by
// importing a shared constant).
const isDirectRun = typeof process.argv[1] === "string" && import.meta.url === `file://${process.argv[1]}`;
if (isDirectRun) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
