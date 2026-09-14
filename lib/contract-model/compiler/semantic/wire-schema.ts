/**
 * Phase 3B - the tolerant external wire schema (task §9's own prescribed
 * pipeline: "semantic model output -> tolerant external parse if needed ->
 * deterministic normalization -> IR validator -> persisted proposal").
 *
 * This is deliberately NOT the Phase 3A IR type itself (task §9's own "do
 * not create a second semantic object model that duplicates the IR" is
 * honored differently here: this wire shape has no independent semantic
 * meaning of its own - it exists ONLY as a tolerant transport format the
 * model can reliably produce, immediately and fully normalized into real
 * IR by normalize.ts, never consulted again afterward). Every enum-shaped
 * field is a tolerant `string`, never a closed `z.enum()` - the exact,
 * explicitly-cited Phase 2F.2 lesson (see amendment/semantic-interpreter.ts's
 * own header) - so an out-of-vocabulary model response degrades to an
 * honest UNSUPPORTED/REVIEW_REQUIRED normalization outcome instead of a
 * client-side structured-output crash.
 *
 * One flat, recursive WireExpression node (optional fields populated only
 * for the kinds that use them) rather than 20+ separate discriminated
 * sub-schemas - deliberately simpler for the model to produce reliably via
 * tool-input JSON Schema, and for a human reviewer to read; normalize.ts
 * carries the burden of mapping this flat shape onto the real, precisely-
 * typed Phase 3A discriminated union.
 */
import { z } from "zod";

export interface WireExpression {
  kind: string;
  /** Source citation for exactly this node, when it differs from its parent's own citation - task §18/§19 (subexpression-level provenance). Null means "inherits the nearest ancestor's citation," never "no evidence." */
  citation?: string | null;
  excerpt?: string | null;

  // literals
  amount?: number;
  currency?: string;
  value?: number;
  isoDate?: string;
  boolValue?: boolean;

  // references
  metricName?: string;
  termName?: string;
  /** Explicit "MONEY"|"RATIO"|"NUMBER" hint for METRIC_REFERENCE (any IRValueType for DEFINED_TERM_REFERENCE/TRANSACTION_INPUT_REFERENCE) - REQUIRED whenever the referenced value is itself a ratio (e.g. "Leverage Ratio", "Fixed Charge Coverage Ratio") rather than a dollar figure, since normalize.ts cannot safely guess this from the name alone (mirrors IRMetricReference's own real field, which the IR itself declares explicitly, never infers). When omitted (F-6), normalize.ts types the reference from the ONE dimension its slot deterministically requires - BOOLEAN under NOT/AND/OR/IF-condition/gate/trigger, the typed sibling's dimension under COMPARE/ADD/MAX/... - and only then defaults to MONEY. An explicit value is never overridden. */
  valueType?: string;
  ruleRef?: string;
  sharedCapRef?: string;
  inputName?: string;
  entityScopeInclude?: string[];
  entityScopeExclude?: string[];

  // composition
  operands?: WireExpression[];
  left?: WireExpression;
  right?: WireExpression;
  operator?: string;
  operand?: WireExpression;
  condition?: WireExpression;
  then?: WireExpression;
  else?: WireExpression | null;
  numerator?: WireExpression;
  denominator?: WireExpression;

  // time / schedule
  asOfDate?: string;
  periodDescription?: string;
  cases?: { from: string | null; to: string | null; value: WireExpression; description: string }[];
  defaultValue?: WireExpression | null;
  eventDescription?: string;
  triggerCondition?: WireExpression | null;
  activeDuration?: string | null;

  // UNLIMITED_CAPACITY
  gatedBy?: WireExpression | null;

  // UNSUPPORTED
  semanticDescription?: string;
  reason?: string;
  sourceEvidence?: string;

  // SEMANTIC ACCOUNTABILITY lineage (additive): the frozen Pass A inventoryItemIds this node consumes.
  inventoryItemIds?: string[];
}

export const WireExpressionSchema: z.ZodType<WireExpression> = z.lazy(() =>
  z.object({
    kind: z.string(),
    citation: z.string().nullable().optional(),
    excerpt: z.string().nullable().optional(),
    amount: z.number().optional(),
    currency: z.string().optional(),
    value: z.number().optional(),
    isoDate: z.string().optional(),
    boolValue: z.boolean().optional(),
    metricName: z.string().optional(),
    termName: z.string().optional(),
    valueType: z.string().optional(),
    ruleRef: z.string().optional(),
    sharedCapRef: z.string().optional(),
    inputName: z.string().optional(),
    entityScopeInclude: z.array(z.string()).optional(),
    entityScopeExclude: z.array(z.string()).optional(),
    operands: z.array(WireExpressionSchema).optional(),
    left: WireExpressionSchema.optional(),
    right: WireExpressionSchema.optional(),
    operator: z.string().optional(),
    operand: WireExpressionSchema.optional(),
    condition: WireExpressionSchema.optional(),
    then: WireExpressionSchema.optional(),
    else: WireExpressionSchema.nullable().optional(),
    numerator: WireExpressionSchema.optional(),
    denominator: WireExpressionSchema.optional(),
    asOfDate: z.string().optional(),
    periodDescription: z.string().optional(),
    cases: z.array(z.object({ from: z.string().nullable(), to: z.string().nullable(), value: WireExpressionSchema, description: z.string() })).optional(),
    defaultValue: WireExpressionSchema.nullable().optional(),
    eventDescription: z.string().optional(),
    triggerCondition: WireExpressionSchema.nullable().optional(),
    activeDuration: z.string().nullable().optional(),
    gatedBy: WireExpressionSchema.nullable().optional(),
    semanticDescription: z.string().optional(),
    reason: z.string().optional(),
    sourceEvidence: z.string().optional(),
    inventoryItemIds: z.array(z.string()).optional(),
  })
);

export const WireConditionSchema = z.object({
  conditionType: z.string().default("OTHER_RULE_SATISFIED"),
  expression: WireExpressionSchema.nullable().default(null),
  referencesDefinitionId: z.string().nullable().default(null),
  description: z.string().default(""),
  citation: z.string().nullable().default(null),
  excerpt: z.string().nullable().default(null),
  inventoryItemIds: z.array(z.string()).optional(),
});
export type WireCondition = z.infer<typeof WireConditionSchema>;

export const WireExceptionSchema = z.object({
  description: z.string().default(""),
  /** A localRef (see WireRuleSchema) pointing at another rule emitted in the SAME compilation call, when the exception is itself a full permission worth modeling - normalize.ts resolves this against the batch's own localRef table (task §11). Left as a free string when the model has no matching local rule; normalize.ts then honestly leaves permissionRuleId null rather than guessing. */
  permissionRef: z.string().nullable().default(null),
  conditions: z.array(WireConditionSchema).default([]),
  citation: z.string().nullable().default(null),
  excerpt: z.string().nullable().default(null),
  inventoryItemIds: z.array(z.string()).optional(),
});
export type WireException = z.infer<typeof WireExceptionSchema>;

export const WireDependencySchema = z.object({
  relationshipType: z.string().default("REQUIRES"),
  /** A localRef within this same call, OR a real, already-existing IR ruleId string the model learned via a getRuleDependency/getSharedCapContext tool call - normalize.ts tries localRef resolution first, then accepts the string verbatim as an external ruleId. */
  targetRef: z.string(),
  description: z.string().default(""),
  inventoryItemIds: z.array(z.string()).optional(),
});
export type WireDependency = z.infer<typeof WireDependencySchema>;

export const WireRuleSchema = z.object({
  /** Model-chosen short identifier unique within this ONE compilation call (e.g. "rule-1") - used ONLY to let exceptions/dependencies/shared-caps cross-reference each other within the same submission. Never used as the rule's real, final identity (normalize.ts computes that deterministically via lib/contract-model/ir/identity.ts, exactly like every other IR producer in this codebase). */
  localRef: z.string(),
  sourceSectionRef: z.string(),
  covenantFamily: z.string().default("OTHER"),
  ruleType: z.string().default("OTHER"),
  posture: z.string().default("N_A"),
  action: z.string().nullable().default(null),
  entityScope: z.array(z.string()).default([]),
  entityScopeExcluded: z.array(z.string()).default([]),
  capacityExpression: WireExpressionSchema.nullable().default(null),
  conditions: z.array(WireConditionSchema).default([]),
  exceptions: z.array(WireExceptionSchema).default([]),
  dependsOn: z.array(WireDependencySchema).default([]),
  sufficiency: z.string().default("AMBIGUOUS"),
  sufficiencyReasons: z.array(z.string()).default([]),
  citation: z.string().nullable().default(null),
  excerpt: z.string().nullable().default(null),
  inventoryItemIds: z.array(z.string()).optional(),
});
export type WireRule = z.infer<typeof WireRuleSchema>;

export const WireDefinitionSchema = z.object({
  localRef: z.string(),
  termName: z.string(),
  covenantFamily: z.string().default("DEFINITIONS_CALCULATION_RULES"),
  calculationExpression: WireExpressionSchema.nullable().default(null),
  dependsOnTerms: z.array(z.string()).default([]),
  sufficiency: z.string().default("AMBIGUOUS"),
  sufficiencyReasons: z.array(z.string()).default([]),
  citation: z.string().nullable().default(null),
  excerpt: z.string().nullable().default(null),
  inventoryItemIds: z.array(z.string()).optional(),
});
export type WireDefinition = z.infer<typeof WireDefinitionSchema>;

export const WireSharedCapacitySchema = z.object({
  localRef: z.string(),
  description: z.string().default(""),
  capExpression: WireExpressionSchema,
  /** localRefs of the WireRules that share this capacity - resolved against the same batch's localRef table. */
  memberRefs: z.array(z.string()).default([]),
  citation: z.string().nullable().default(null),
  excerpt: z.string().nullable().default(null),
  inventoryItemIds: z.array(z.string()).optional(),
});
export type WireSharedCapacity = z.infer<typeof WireSharedCapacitySchema>;

/**
 * SEMANTIC ACCOUNTABILITY (mission §8): the composition's explicit
 * disposition for a frozen inventory item it did NOT consume into any IR
 * node. Every MATERIAL/CRITICAL item must be either consumed (lineage) or
 * dispositioned here; anything else is MISSING_FROM_COMPOSITION in Pass C.
 * `disposition` is a tolerant string: INTENTIONALLY_NON_COMPUTATIONAL |
 * UNSUPPORTED | AMBIGUOUS (REPRESENTED is inferred from lineage, never
 * self-declared here).
 */
export const WireInventoryDispositionSchema = z.object({
  inventoryItemId: z.string(),
  disposition: z.string().default("AMBIGUOUS"),
  note: z.string().default(""),
});
export type WireInventoryDisposition = z.infer<typeof WireInventoryDispositionSchema>;

export const WireIRExtensionCandidateSchema = z.object({
  sourceEvidence: z.string().default(""),
  semanticRequirement: z.string().default(""),
  whyExistingPrimitivesFail: z.string().default(""),
  candidateGeneralizedPrimitive: z.string().default(""),
});

/** The `submit_compilation` tool's own input schema - the ONE terminal action of the tool-use loop (caller.ts). */
export const SubmitCompilationSchema = z.object({
  rules: z.array(WireRuleSchema).default([]),
  definitions: z.array(WireDefinitionSchema).default([]),
  sharedCapacities: z.array(WireSharedCapacitySchema).default([]),
  irExtensionCandidates: z.array(WireIRExtensionCandidateSchema).default([]),
  inventoryDispositions: z.array(WireInventoryDispositionSchema).optional(),
  overallNotes: z.array(z.string()).default([]),
});
export type SubmitCompilationInput = z.infer<typeof SubmitCompilationSchema>;
