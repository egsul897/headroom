/**
 * Deterministic fixed-dollar basket → existing IR via normalizeSubmission.
 *
 * This is NOT a parallel compiler: it builds a tolerant wire submission and
 * reuses normalizeSubmission / IR identity / capacity evaluation.
 *
 * Residual qualitative conditions become IF(TRANSACTION_INPUT) gates so a
 * missing predicate yields NEEDS_INPUT rather than a false affirmative.
 */
import { createHash } from "node:crypto";
import { normalizeSubmission } from "../semantic/normalize";
import { SubmitCompilationSchema, type SubmitCompilationInput, type WireExpression } from "../semantic/wire-schema";
import {
  SEMANTIC_COMPILER_ALGORITHM_VERSION,
  SEMANTIC_COMPILER_PROMPT_VERSION,
  SEMANTIC_COMPILER_TOOL_POLICY_VERSION,
  type SemanticCompilerInput,
} from "../semantic/types";
import { IR_SCHEMA_VERSION, type IRRule } from "../../ir/types";
import type { CovenantContextBundle } from "../context-retrieval/types";
import { classifyFixedDollarBasket, type FixedDollarClassification } from "./classify";

export const FIXED_DOLLAR_BASKET_COMPILER_VERSION = "fixed-dollar-basket.v1";

function emptyContextBundle(): CovenantContextBundle {
  return {
    bundleId: "fixed-dollar-bundle",
    packageKey: "fixed-dollar",
    companyId: "unset",
    instrumentKey: "unset",
    originatingDocumentId: "unset",
    originatingDiscoveryId: "unset",
    originatingStructuralNodeKeys: [],
    originatingStructuralNodeIds: [],
    normalizedSourceRef: "",
    originatingFamilies: [],
    originatingSupersessionStatus: "UNKNOWN_SUPERSESSION_STATUS",
    originatingSupersessionReason: "fixed-dollar basket compile does not assert supersession",
    items: [],
    edges: [],
    unresolvedDependencies: [],
    retrievalAlgorithmVersion: FIXED_DOLLAR_BASKET_COMPILER_VERSION,
    semanticPromptVersion: null,
    providerIdentity: null,
    contentIdentity: "fixed-dollar-empty",
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

export interface FixedDollarCompileArgs {
  companyId: string;
  instrumentKey: string;
  sourceDocumentId: string;
  candidateRef: string;
  sourceSectionRef: string;
  operativeSourceText: string;
  covenantFamily?: string;
  action?: "INCUR_DEBT" | "CREATE_LIEN";
}

export type FixedDollarExecutableClass =
  | "VERIFIED_EXECUTABLE_CANDIDATE"
  | "PARTIAL"
  | "UNSUPPORTED"
  | "FAILED";

export interface FixedDollarCompileResult {
  classification: FixedDollarClassification;
  executableClass: FixedDollarExecutableClass;
  rule: IRRule | null;
  warnings: string[];
  compilerVersion: string;
  sourceContentVersion: string;
}

function moneyExpr(amount: number, citation: string, excerpt: string): WireExpression {
  return { kind: "MONEY", amount, currency: "USD", citation, excerpt };
}

function gateExpr(inputName: string, citation: string, sourceExcerpt: string): WireExpression {
  return {
    kind: "TRANSACTION_INPUT_REFERENCE",
    inputName,
    valueType: "BOOLEAN",
    citation,
    // Excerpt MUST appear in operative source so normalize provenance binds.
    excerpt: sourceExcerpt,
  };
}

function capacityFor(classification: FixedDollarClassification, citation: string, excerpt: string): WireExpression | null {
  if (classification.amountUsd == null) return null;
  const money = moneyExpr(classification.amountUsd, citation, excerpt);
  if (classification.class === "FIXED_DOLLAR_SOLE_CAP") return money;
  if (classification.class !== "FIXED_DOLLAR_WITH_QUALITATIVE_GATES") return null;
  // Nest IF gates so every residual must be stipulated true.
  let expr: WireExpression = money;
  for (const residual of [...classification.residuals].reverse()) {
    expr = {
      kind: "IF",
      condition: gateExpr(residual.gateInputName, citation, residual.excerpt),
      then: expr,
      // Fail-closed: $0 when gate fails. Excerpt omitted so normalize does not
      // require a literal "$0" in source; amount is the refuse-closed value.
      else: { kind: "MONEY", amount: 0, currency: "USD", citation, excerpt: null },
      citation,
      excerpt: residual.excerpt,
    };
  }
  return expr;
}

function inferAction(text: string, explicit?: FixedDollarCompileArgs["action"]): "INCUR_DEBT" | "CREATE_LIEN" {
  if (explicit) return explicit;
  if (/\bLiens?\b/i.test(text) && !/\b(?:Debt|Indebtedness)\b/i.test(text)) return "CREATE_LIEN";
  return "INCUR_DEBT";
}

function inferFamily(text: string, explicit?: string): string {
  if (explicit) return explicit;
  if (/\bLiens?\b/i.test(text) && !/\b(?:Debt|Indebtedness)\b/i.test(text)) return "LIENS";
  return "INDEBTEDNESS";
}

function buildCompilerInput(args: FixedDollarCompileArgs): SemanticCompilerInput {
  return {
    companyId: args.companyId,
    instrumentKey: args.instrumentKey,
    sourceDocumentId: args.sourceDocumentId,
    candidateRef: args.candidateRef,
    sourceSectionRef: args.sourceSectionRef,
    operativeSourceText: args.operativeSourceText,
    contextBundle: emptyContextBundle(),
    operativeLineage: null,
    toolAccess: {
      structuralIndex: {
        getNodeById: () => undefined,
        resolveUniqueNodeByRef: () => ({ status: "NOT_FOUND" as const }),
        findNodesByRef: () => [],
        getNode: () => undefined,
        getNodeByRef: () => undefined,
        getChildren: () => [],
        getParent: () => undefined,
        getAncestors: () => [],
        getSiblings: () => [],
        getDescendants: () => [],
        getNodeText: () => "",
        roots: () => [],
        orphans: () => [],
        healthDiagnostics: () => [],
        getDefinition: () => undefined,
        getDefinitionFullText: () => undefined,
        allDefinitions: () => [],
        findReferencesFrom: () => [],
        findReferencesTo: () => [],
        searchStructuralNodes: () => [],
        allNodes: () => [],
        getDocumentText: () => args.operativeSourceText,
      } as never,
      operativeState: null,
      packageGraph: null,
      amendmentEffects: null,
      contextBundle: emptyContextBundle(),
    },
    irSchemaVersion: IR_SCHEMA_VERSION,
    compilerAlgorithmVersion: `${SEMANTIC_COMPILER_ALGORITHM_VERSION}+${FIXED_DOLLAR_BASKET_COMPILER_VERSION}`,
    compilerPromptVersion: SEMANTIC_COMPILER_PROMPT_VERSION,
    toolPolicyVersion: SEMANTIC_COMPILER_TOOL_POLICY_VERSION,
  };
}

export function compileFixedDollarBasket(args: FixedDollarCompileArgs): FixedDollarCompileResult {
  const classification = classifyFixedDollarBasket(args.operativeSourceText);
  const sourceContentVersion = createHash("sha256")
    .update(`${FIXED_DOLLAR_BASKET_COMPILER_VERSION}|${args.operativeSourceText}`)
    .digest("hex")
    .slice(0, 32);
  const warnings: string[] = [...classification.reasons];

  if (classification.class === "NOT_FIXED_DOLLAR" || classification.amountUsd == null) {
    return {
      classification,
      executableClass: "UNSUPPORTED",
      rule: null,
      warnings,
      compilerVersion: FIXED_DOLLAR_BASKET_COMPILER_VERSION,
      sourceContentVersion,
    };
  }

  const citation = `§${args.sourceSectionRef}`;
  const capacityExpression = capacityFor(classification, citation, args.operativeSourceText.slice(0, 240));
  if (!capacityExpression) {
    return {
      classification,
      executableClass: "FAILED",
      rule: null,
      warnings: [...warnings, "capacity_expression_build_failed"],
      compilerVersion: FIXED_DOLLAR_BASKET_COMPILER_VERSION,
      sourceContentVersion,
    };
  }

  const family = inferFamily(args.operativeSourceText, args.covenantFamily);
  const action = inferAction(args.operativeSourceText, args.action);
  const wire: SubmitCompilationInput = SubmitCompilationSchema.parse({
    rules: [
      {
        localRef: "fixed-dollar-1",
        sourceSectionRef: args.sourceSectionRef,
        covenantFamily: family,
        ruleType: "QUANTITATIVE_PERMISSION",
        posture: "PERMISSION",
        action,
        entityScope: [],
        entityScopeExcluded: [],
        capacityExpression,
        conditions: classification.residuals.map((r) => ({
          conditionType: r.kind === "GEOGRAPHIC_SCOPE" || r.kind === "OBJECT_RESTRICTION" ? "ENTITY_TYPE" : "UNSUPPORTED",
          expression: gateExpr(r.gateInputName, citation, r.excerpt),
          referencesDefinitionId: null,
          description: `${r.kind}: ${r.excerpt}`,
          citation,
          excerpt: r.excerpt,
        })),
        exceptions: [],
        dependsOn: [],
        sufficiency: "COMPLETE",
        sufficiencyReasons: [
          "deterministic_fixed_dollar_basket",
          ...(classification.residuals.length
            ? ["qualitative_residuals_encoded_as_transaction_input_gates"]
            : ["sole_cap_no_residual_gates"]),
        ],
        citation,
        excerpt: args.operativeSourceText.slice(0, 400),
      },
    ],
    definitions: [],
    sharedCapacities: [],
    irExtensionCandidates: [],
    overallNotes: [`${FIXED_DOLLAR_BASKET_COMPILER_VERSION}`],
  });

  const input = buildCompilerInput(args);
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
      compilerVersion: FIXED_DOLLAR_BASKET_COMPILER_VERSION,
      sourceContentVersion,
    };
  }

  // Stamp versions for VEP identity binding.
  rule.compilerVersion = `${SEMANTIC_COMPILER_ALGORITHM_VERSION}+${FIXED_DOLLAR_BASKET_COMPILER_VERSION}`;
  rule.sourceContentVersion = sourceContentVersion;
  if (!rule.irSchemaVersion) rule.irSchemaVersion = IR_SCHEMA_VERSION;

  if (!rule.capacityExpression) {
    return {
      classification,
      executableClass: "PARTIAL",
      rule,
      warnings: [
        ...warnings,
        `sufficiency=${rule.sufficiency}`,
        ...normalized.warnings.map((w) => (typeof w === "string" ? w : JSON.stringify(w))),
      ],
      compilerVersion: FIXED_DOLLAR_BASKET_COMPILER_VERSION,
      sourceContentVersion,
    };
  }

  // Sole-cap requires COMPLETE. Gated baskets may be PARTIAL after normalize
  // honesty post-processing yet remain evaluable when fidelity confirms amount+gates.
  const candidateOk =
    classification.class === "FIXED_DOLLAR_SOLE_CAP"
      ? rule.sufficiency === "COMPLETE"
      : rule.sufficiency === "COMPLETE" || rule.sufficiency === "PARTIAL";

  return {
    classification,
    executableClass: candidateOk ? "VERIFIED_EXECUTABLE_CANDIDATE" : "PARTIAL",
    rule,
    warnings: [
      ...warnings,
      ...normalized.warnings.map((w) => (typeof w === "string" ? w : JSON.stringify(w))),
      `sufficiency=${rule.sufficiency}`,
    ],
    compilerVersion: FIXED_DOLLAR_BASKET_COMPILER_VERSION,
    sourceContentVersion,
  };
}
