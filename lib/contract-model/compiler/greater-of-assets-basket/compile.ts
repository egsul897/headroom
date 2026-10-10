/**
 * Deterministic greater-of (fixed $ / % Total Assets) → existing IR via normalizeSubmission.
 * Shape: MAX(MONEY, MULTIPLY(PERCENT, METRIC_REFERENCE)) with optional IF gates.
 */
import { createHash } from "node:crypto";
import { normalizeSubmission } from "../semantic/normalize";
import { SubmitCompilationSchema, type SubmitCompilationInput, type WireExpression } from "../semantic/wire-schema";
import { SEMANTIC_COMPILER_ALGORITHM_VERSION } from "../semantic/types";
import { IR_SCHEMA_VERSION, type IRRule, type IRSharedCapacity } from "../../ir/types";
import type { CovenantContextBundle } from "../context-retrieval/types";
import { assembleStipulatedOperativeCompilerInput } from "../../covenant-map/candidate-input";
import {
  classifyGreaterOfAssetsBasket,
  detectMutualSharedCapacity,
  type GreaterOfAssetsClassification,
} from "./classify";

export const GREATER_OF_ASSETS_COMPILER_VERSION = "greater-of-assets-basket.v1";

function emptyContextBundle(): CovenantContextBundle {
  return {
    bundleId: "greater-of-assets-bundle",
    packageKey: "greater-of-assets",
    companyId: "unset",
    instrumentKey: "unset",
    originatingDocumentId: "unset",
    originatingDiscoveryId: "unset",
    originatingStructuralNodeKeys: [],
    originatingStructuralNodeIds: [],
    normalizedSourceRef: "",
    originatingFamilies: [],
    originatingSupersessionStatus: "UNKNOWN_SUPERSESSION_STATUS",
    originatingSupersessionReason: "greater-of assets basket compile does not assert supersession",
    items: [],
    edges: [],
    unresolvedDependencies: [],
    retrievalAlgorithmVersion: GREATER_OF_ASSETS_COMPILER_VERSION,
    semanticPromptVersion: null,
    providerIdentity: null,
    contentIdentity: "greater-of-assets-empty",
    sufficiencyState: "SUFFICIENT",
    stopReasons: [],
    performance: {
      itemsConsidered: 0,
      itemsRetained: 0,
      duplicatePathsDeduplicated: 0,
      maxDefinitionDepthReached: 0,
      maxCrossReferenceDepthReached: 0,
      crossReferenceTraversals: 0,
      crossDocumentLeads: 0,
      deterministicWallClockMs: 0,
      semanticWallClockMs: 0,
      semanticCalls: 0,
      inputTokens: 0,
      outputTokens: 0,
    },
  };
}

export interface GreaterOfCompileArgs {
  companyId: string;
  instrumentKey: string;
  sourceDocumentId: string;
  candidateRef: string;
  sourceSectionRef: string;
  operativeSourceText: string;
  covenantFamily?: string;
  action?: "INCUR_DEBT" | "CREATE_LIEN";
}

export type GreaterOfExecutableClass =
  | "VERIFIED_EXECUTABLE_CANDIDATE"
  | "PARTIAL"
  | "UNSUPPORTED"
  | "FAILED";

export interface GreaterOfCompileResult {
  classification: GreaterOfAssetsClassification;
  executableClass: GreaterOfExecutableClass;
  rule: IRRule | null;
  warnings: string[];
  compilerVersion: string;
  sourceContentVersion: string;
}

function gateExpr(inputName: string, citation: string, sourceExcerpt: string): WireExpression {
  return {
    kind: "TRANSACTION_INPUT_REFERENCE",
    inputName,
    valueType: "BOOLEAN",
    citation,
    excerpt: sourceExcerpt,
  };
}

function dollarExcerptFromSource(text: string, amount: number): string {
  const compact = text.replace(/\s+/g, " ");
  const hit = compact.match(new RegExp(`\\$\\s?${amount.toLocaleString("en-US").replace(/,/g, ",?")}`));
  if (hit) return hit[0];
  // Fallback: first dollar token matching the numeric amount.
  const re = /\$\s?([\d,]+(?:\.\d+)?)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(compact)) !== null) {
    if (Number(m[1]!.replace(/,/g, "")) === amount) return m[0];
  }
  return `$${amount}`;
}

function greaterOfCapacity(
  classification: GreaterOfAssetsClassification,
  citation: string,
  operativeSourceText: string,
): WireExpression | null {
  if (
    classification.fixedAmountUsd == null ||
    classification.percentFraction == null ||
    !classification.metricName ||
    !classification.metricExcerpt
  ) {
    return null;
  }
  const money: WireExpression = {
    kind: "MONEY",
    amount: classification.fixedAmountUsd,
    currency: "USD",
    citation,
    excerpt: dollarExcerptFromSource(operativeSourceText, classification.fixedAmountUsd),
  };
  // Use the primary "shall not exceed the greater of …" window excerpts so repeated
  // acknowledgment language later in the clause does not create AMBIGUOUS_EXACT_SPAN.
  const primaryWindow =
    operativeSourceText.replace(/\s+/g, " ").match(
      /shall\s+not\s+exceed\s+the\s+greater\s+of[\s\S]{0,280}?\$\s?[\d,]+/i,
    )?.[0] ?? operativeSourceText;
  const percentExcerpt =
    primaryWindow.match(
      /greater\s+of\s*\([A-Za-z0-9]+\)\s+(?:ten|five|fifteen|twenty|\d+(?:\.\d+)?)\s*percent\s*\(\d+(?:\.\d+)?%\)/i,
    )?.[0]?.replace(/^greater\s+of\s*\([A-Za-z0-9]+\)\s+/i, "") ??
    primaryWindow.match(/(?:ten|five|fifteen|twenty|\d+(?:\.\d+)?)\s*percent\s*\(\d+(?:\.\d+)?%\)/i)?.[0] ??
    classification.percentRaw;
  const metricExcerptInWindow =
    primaryWindow.match(
      /Total\s+Consolidated\s+Assets\s+of\s+the\s+Company\s+and\s+its\s+Restricted\s+Subsidiaries\s+as\s+of\s+the\s+last\s+day|Consolidated\s+Total\s+Assets|Total\s+Assets/,
    )?.[0] ?? classification.metricName;
  const greaterOfExcerpt =
    primaryWindow.match(/shall\s+not\s+exceed\s+the\s+greater\s+of/i)?.[0] ?? "shall not exceed the greater of";
  const multiplyExcerpt =
    primaryWindow.match(
      /(?:ten|five|fifteen|twenty|\d+(?:\.\d+)?)\s*percent\s*\(\d+(?:\.\d+)?%\)\s+of\s+the\s+Total\s+Consolidated\s+Assets\s+of\s+the\s+Company\s+and\s+its\s+Restricted\s+Subsidiaries\s+as\s+of\s+the\s+last\s+day/i,
    )?.[0] ?? classification.metricExcerpt;
  const percent: WireExpression = {
    kind: "PERCENT",
    value: classification.percentFraction,
    citation,
    excerpt: percentExcerpt,
  };
  const metric: WireExpression = {
    kind: "METRIC_REFERENCE",
    metricName: classification.metricName,
    valueType: "MONEY",
    citation,
    excerpt: metricExcerptInWindow,
  };
  const multiplied: WireExpression = {
    kind: "MULTIPLY",
    operands: [percent, metric],
    citation,
    excerpt: multiplyExcerpt,
  };
  let expr: WireExpression = {
    kind: "MAX",
    operands: [money, multiplied],
    citation,
    excerpt: greaterOfExcerpt,
  };
  for (const residual of [...classification.residuals].reverse()) {
    expr = {
      kind: "IF",
      condition: gateExpr(residual.gateInputName, citation, residual.excerpt),
      then: expr,
      else: { kind: "MONEY", amount: 0, currency: "USD", citation, excerpt: null },
      citation,
      excerpt: residual.excerpt,
    };
  }
  return expr;
}

function inferAction(text: string, explicit?: GreaterOfCompileArgs["action"]): "INCUR_DEBT" | "CREATE_LIEN" {
  if (explicit) return explicit;
  if (/\bLiens?\b/i.test(text) && !/\b(?:Debt|Indebtedness)\b/i.test(text)) return "CREATE_LIEN";
  return "INCUR_DEBT";
}

function inferFamily(text: string, explicit?: string): string {
  if (explicit) return explicit;
  if (/\bLiens?\b/i.test(text) && !/\b(?:Debt|Indebtedness)\b/i.test(text)) return "LIENS";
  return "INDEBTEDNESS";
}

function assembleInput(args: {
  companyId: string;
  instrumentKey: string;
  sourceDocumentId: string;
  candidateRef: string;
  sourceSectionRef: string;
  operativeSourceText: string;
}) {
  const bundle = emptyContextBundle();
  bundle.companyId = args.companyId;
  bundle.instrumentKey = args.instrumentKey;
  bundle.originatingDocumentId = args.sourceDocumentId;
  bundle.originatingDiscoveryId = args.candidateRef;
  bundle.normalizedSourceRef = args.sourceSectionRef;
  return assembleStipulatedOperativeCompilerInput({
    companyId: args.companyId,
    instrumentKey: args.instrumentKey,
    sourceDocumentId: args.sourceDocumentId,
    candidateRef: args.candidateRef,
    sourceSectionRef: args.sourceSectionRef,
    operativeSourceText: args.operativeSourceText,
    contextBundle: bundle,
    compilerAlgorithmVersion: `${SEMANTIC_COMPILER_ALGORITHM_VERSION}+${GREATER_OF_ASSETS_COMPILER_VERSION}`,
  });
}

function wireRule(args: {
  localRef: string;
  sourceSectionRef: string;
  operativeSourceText: string;
  classification: GreaterOfAssetsClassification;
  capacityExpression: WireExpression;
  family: string;
  action: "INCUR_DEBT" | "CREATE_LIEN";
}) {
  const citation = `§${args.sourceSectionRef}`;
  return {
    localRef: args.localRef,
    sourceSectionRef: args.sourceSectionRef,
    covenantFamily: args.family,
    ruleType: "QUANTITATIVE_PERMISSION" as const,
    posture: "PERMISSION" as const,
    action: args.action,
    entityScope: [] as string[],
    entityScopeExcluded: [] as string[],
    capacityExpression: args.capacityExpression,
    conditions: args.classification.residuals.map((r) => ({
      conditionType:
        r.kind === "CROSS_SECTION_LINK" || r.kind === "OBJECT_RESTRICTION" ? ("ENTITY_TYPE" as const) : ("UNSUPPORTED" as const),
      expression: gateExpr(r.gateInputName, citation, r.excerpt),
      referencesDefinitionId: null,
      description: `${r.kind}: ${r.excerpt}`,
      citation,
      excerpt: r.excerpt,
    })),
    exceptions: [] as [],
    dependsOn: [] as [],
    sufficiency: "COMPLETE" as const,
    sufficiencyReasons: [
      "deterministic_greater_of_fixed_or_pct_total_assets",
      ...(args.classification.residuals.length
        ? ["qualitative_residuals_encoded_as_transaction_input_gates"]
        : ["no_residual_gates"]),
    ],
    citation,
    excerpt: args.operativeSourceText.slice(0, 400),
  };
}

export function compileGreaterOfAssetsBasket(args: GreaterOfCompileArgs): GreaterOfCompileResult {
  const classification = classifyGreaterOfAssetsBasket(args.operativeSourceText);
  const sourceContentVersion = createHash("sha256")
    .update(`${GREATER_OF_ASSETS_COMPILER_VERSION}|${args.operativeSourceText}`)
    .digest("hex")
    .slice(0, 32);
  const warnings: string[] = [...classification.reasons];

  if (
    classification.class === "NOT_GREATER_OF_ASSETS" ||
    classification.fixedAmountUsd == null ||
    classification.percentFraction == null
  ) {
    return {
      classification,
      executableClass: "UNSUPPORTED",
      rule: null,
      warnings,
      compilerVersion: GREATER_OF_ASSETS_COMPILER_VERSION,
      sourceContentVersion,
    };
  }

  const citation = `§${args.sourceSectionRef}`;
  const capacityExpression = greaterOfCapacity(classification, citation, args.operativeSourceText);
  if (!capacityExpression) {
    return {
      classification,
      executableClass: "FAILED",
      rule: null,
      warnings: [...warnings, "capacity_expression_build_failed"],
      compilerVersion: GREATER_OF_ASSETS_COMPILER_VERSION,
      sourceContentVersion,
    };
  }

  const wire: SubmitCompilationInput = SubmitCompilationSchema.parse({
    rules: [
      wireRule({
        localRef: "greater-of-1",
        sourceSectionRef: args.sourceSectionRef,
        operativeSourceText: args.operativeSourceText,
        classification,
        capacityExpression,
        family: inferFamily(args.operativeSourceText, args.covenantFamily),
        action: inferAction(args.operativeSourceText, args.action),
      }),
    ],
    definitions: [],
    sharedCapacities: [],
    irExtensionCandidates: [],
    overallNotes: [`${GREATER_OF_ASSETS_COMPILER_VERSION}`],
  });

  const input = assembleInput(args);
  const normalized = normalizeSubmission(wire, input);
  const rule = normalized.rules[0] ?? null;
  if (!rule) {
    return {
      classification,
      executableClass: "FAILED",
      rule: null,
      warnings: [
        ...warnings,
        "normalize_produced_no_rule",
        ...normalized.warnings.map((w) => (typeof w === "string" ? w : JSON.stringify(w))),
      ],
      compilerVersion: GREATER_OF_ASSETS_COMPILER_VERSION,
      sourceContentVersion,
    };
  }

  rule.compilerVersion = `${SEMANTIC_COMPILER_ALGORITHM_VERSION}+${GREATER_OF_ASSETS_COMPILER_VERSION}`;
  rule.sourceContentVersion = sourceContentVersion;
  if (!rule.irSchemaVersion) rule.irSchemaVersion = IR_SCHEMA_VERSION;

  if (!rule.capacityExpression) {
    return {
      classification,
      executableClass: "PARTIAL",
      rule,
      warnings: [...warnings, `sufficiency=${rule.sufficiency}`],
      compilerVersion: GREATER_OF_ASSETS_COMPILER_VERSION,
      sourceContentVersion,
    };
  }

  const candidateOk = rule.sufficiency === "COMPLETE" || rule.sufficiency === "PARTIAL";
  return {
    classification,
    executableClass: candidateOk ? "VERIFIED_EXECUTABLE_CANDIDATE" : "PARTIAL",
    rule,
    warnings: [
      ...warnings,
      ...normalized.warnings.map((w) => (typeof w === "string" ? w : JSON.stringify(w))),
      `sufficiency=${rule.sufficiency}`,
    ],
    compilerVersion: GREATER_OF_ASSETS_COMPILER_VERSION,
    sourceContentVersion,
  };
}

export interface GreaterOfSharedPairResult {
  shared: boolean;
  evidence: string[];
  ruleA: GreaterOfCompileResult;
  ruleB: GreaterOfCompileResult;
  sharedCapacity: IRSharedCapacity | null;
  warnings: string[];
}

/**
 * Compile two mutually cross-referenced greater-of baskets as one submission with a
 * canonical shared-capacity pool (no second allocator).
 */
export function compileGreaterOfSharedPair(args: {
  companyId: string;
  instrumentKey: string;
  sourceDocumentId: string;
  candidateRef: string;
  memberA: { sourceSectionRef: string; operativeSourceText: string; action?: "INCUR_DEBT" | "CREATE_LIEN"; covenantFamily?: string };
  memberB: { sourceSectionRef: string; operativeSourceText: string; action?: "INCUR_DEBT" | "CREATE_LIEN"; covenantFamily?: string };
}): GreaterOfSharedPairResult {
  const mutual = detectMutualSharedCapacity({
    textA: args.memberA.operativeSourceText,
    refA: args.memberA.sourceSectionRef,
    textB: args.memberB.operativeSourceText,
    refB: args.memberB.sourceSectionRef,
  });

  const classA = classifyGreaterOfAssetsBasket(args.memberA.operativeSourceText);
  const classB = classifyGreaterOfAssetsBasket(args.memberB.operativeSourceText);
  const soloA = compileGreaterOfAssetsBasket({
    companyId: args.companyId,
    instrumentKey: args.instrumentKey,
    sourceDocumentId: args.sourceDocumentId,
    candidateRef: `${args.candidateRef}:a`,
    sourceSectionRef: args.memberA.sourceSectionRef,
    operativeSourceText: args.memberA.operativeSourceText,
    action: args.memberA.action,
    covenantFamily: args.memberA.covenantFamily,
  });
  const soloB = compileGreaterOfAssetsBasket({
    companyId: args.companyId,
    instrumentKey: args.instrumentKey,
    sourceDocumentId: args.sourceDocumentId,
    candidateRef: `${args.candidateRef}:b`,
    sourceSectionRef: args.memberB.sourceSectionRef,
    operativeSourceText: args.memberB.operativeSourceText,
    action: args.memberB.action,
    covenantFamily: args.memberB.covenantFamily,
  });

  if (
    !mutual.shared ||
    soloA.executableClass === "UNSUPPORTED" ||
    soloB.executableClass === "UNSUPPORTED" ||
    !soloA.rule ||
    !soloB.rule ||
    classA.fixedAmountUsd == null ||
    classB.fixedAmountUsd == null ||
    classA.fixedAmountUsd !== classB.fixedAmountUsd ||
    classA.percentFraction !== classB.percentFraction ||
    classA.metricName !== classB.metricName
  ) {
    return {
      shared: false,
      evidence: mutual.evidence,
      ruleA: soloA,
      ruleB: soloB,
      sharedCapacity: null,
      warnings: mutual.shared
        ? ["mutual_combine_present_but_formula_limbs_do_not_match"]
        : ["no_mutual_without_duplication_cross_reference"],
    };
  }

  const capA = greaterOfCapacity(classA, `§${args.memberA.sourceSectionRef}`, args.memberA.operativeSourceText)!;
  const capB = greaterOfCapacity(classB, `§${args.memberB.sourceSectionRef}`, args.memberB.operativeSourceText)!;
  // Shared pool uses ungated MAX limbs only (gates remain on each member rule).
  const poolCap: WireExpression = {
    kind: "MAX",
    operands: [
      {
        kind: "MONEY",
        amount: classA.fixedAmountUsd,
        currency: "USD",
        citation: `§${args.memberA.sourceSectionRef}`,
        excerpt: dollarExcerptFromSource(args.memberA.operativeSourceText, classA.fixedAmountUsd),
      },
      {
        kind: "MULTIPLY",
        operands: [
          {
            kind: "PERCENT",
            value: classA.percentFraction!,
            citation: `§${args.memberA.sourceSectionRef}`,
            excerpt: classA.percentRaw,
          },
          {
            kind: "METRIC_REFERENCE",
            metricName: classA.metricName!,
            valueType: "MONEY",
            citation: `§${args.memberA.sourceSectionRef}`,
            excerpt: classA.metricName,
          },
        ],
        citation: `§${args.memberA.sourceSectionRef}`,
        excerpt: classA.metricExcerpt,
      },
    ],
    citation: `${args.memberA.sourceSectionRef}+${args.memberB.sourceSectionRef}`,
    excerpt: "when combined (without duplication)",
  };

  const wire: SubmitCompilationInput = SubmitCompilationSchema.parse({
    rules: [
      wireRule({
        localRef: "member-a",
        sourceSectionRef: args.memberA.sourceSectionRef,
        operativeSourceText: args.memberA.operativeSourceText,
        classification: classA,
        capacityExpression: capA,
        family: inferFamily(args.memberA.operativeSourceText, args.memberA.covenantFamily),
        action: inferAction(args.memberA.operativeSourceText, args.memberA.action),
      }),
      wireRule({
        localRef: "member-b",
        sourceSectionRef: args.memberB.sourceSectionRef,
        operativeSourceText: args.memberB.operativeSourceText,
        classification: classB,
        capacityExpression: capB,
        family: inferFamily(args.memberB.operativeSourceText, args.memberB.covenantFamily),
        action: inferAction(args.memberB.operativeSourceText, args.memberB.action),
      }),
    ],
    definitions: [],
    sharedCapacities: [
      {
        localRef: "shared-greater-of",
        description: "greater-of Total Assets basket shared without duplication",
        capExpression: poolCap,
        memberRefs: ["member-a", "member-b"],
        citation: `${args.memberA.sourceSectionRef}/${args.memberB.sourceSectionRef}`,
        excerpt: "when combined (without duplication)",
      },
    ],
    irExtensionCandidates: [],
    overallNotes: [`${GREATER_OF_ASSETS_COMPILER_VERSION}:shared-pair`],
  });

  const combinedText = `${args.memberA.operativeSourceText}\n${args.memberB.operativeSourceText}`;
  const input = assembleInput({
    companyId: args.companyId,
    instrumentKey: args.instrumentKey,
    sourceDocumentId: args.sourceDocumentId,
    candidateRef: args.candidateRef,
    sourceSectionRef: `${args.memberA.sourceSectionRef}+${args.memberB.sourceSectionRef}`,
    operativeSourceText: combinedText,
  });
  const normalized = normalizeSubmission(wire, input);
  const ruleA = normalized.rules.find((r) => r.sourceSectionRef === args.memberA.sourceSectionRef) ?? normalized.rules[0] ?? null;
  const ruleB = normalized.rules.find((r) => r.sourceSectionRef === args.memberB.sourceSectionRef) ?? normalized.rules[1] ?? null;
  const shared = normalized.sharedCapacities[0] ?? null;
  const scv = createHash("sha256")
    .update(`${GREATER_OF_ASSETS_COMPILER_VERSION}|pair|${combinedText}`)
    .digest("hex")
    .slice(0, 32);
  for (const r of [ruleA, ruleB]) {
    if (!r) continue;
    r.compilerVersion = `${SEMANTIC_COMPILER_ALGORITHM_VERSION}+${GREATER_OF_ASSETS_COMPILER_VERSION}`;
    r.sourceContentVersion = scv;
    if (!r.irSchemaVersion) r.irSchemaVersion = IR_SCHEMA_VERSION;
  }
  if (shared) {
    shared.irSchemaVersion = IR_SCHEMA_VERSION;
    shared.compilerVersion = `${SEMANTIC_COMPILER_ALGORITHM_VERSION}+${GREATER_OF_ASSETS_COMPILER_VERSION}`;
    shared.sourceContentVersion = scv;
  }

  return {
    shared: Boolean(shared && ruleA && ruleB),
    evidence: mutual.evidence,
    ruleA: {
      classification: classA,
      executableClass: ruleA?.capacityExpression ? "VERIFIED_EXECUTABLE_CANDIDATE" : "FAILED",
      rule: ruleA,
      warnings: [],
      compilerVersion: GREATER_OF_ASSETS_COMPILER_VERSION,
      sourceContentVersion: scv,
    },
    ruleB: {
      classification: classB,
      executableClass: ruleB?.capacityExpression ? "VERIFIED_EXECUTABLE_CANDIDATE" : "FAILED",
      rule: ruleB,
      warnings: [],
      compilerVersion: GREATER_OF_ASSETS_COMPILER_VERSION,
      sourceContentVersion: scv,
    },
    sharedCapacity: shared,
    warnings: normalized.warnings.map((w) => (typeof w === "string" ? w : JSON.stringify(w))),
  };
}
