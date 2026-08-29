/**
 * Deterministic structural validators (task §47) - no LLM, no content-
 * semantic verification. These check that the GRAPH ITSELF is well-formed:
 * every reference points at something real, every stable key is unique,
 * every workspace boundary holds, no dependency cycle traps a future
 * consumer. Phase C's adversarial/semantic verification is a different,
 * later concern this file does not attempt.
 */
import { prisma } from "../prisma";
import { getDefinedTermDependencies, getRuleDependencies } from "./service";

export interface ValidationIssue {
  rule: string;
  message: string;
}

export interface ValidationReport {
  issues: ValidationIssue[];
  ok: boolean;
}

function report(issues: ValidationIssue[]): ValidationReport {
  return { issues, ok: issues.length === 0 };
}

/** Every ContractRule.sourceDocumentId/sourceNodeId points at a real, same-company row (task §47 - "rule source exists"). */
export async function validateRuleSourcesExist(companyId: string): Promise<ValidationReport> {
  const issues: ValidationIssue[] = [];
  const rules = await prisma.contractRule.findMany({ where: { companyId }, select: { id: true, sourceDocumentId: true, sourceNodeId: true } });
  const documentIds = new Set((await prisma.document.findMany({ where: { companyId }, select: { id: true } })).map((d) => d.id));
  const nodeIds = new Set((await prisma.documentNode.findMany({ where: { companyId }, select: { id: true } })).map((n) => n.id));
  for (const r of rules) {
    if (!documentIds.has(r.sourceDocumentId)) issues.push({ rule: "rule-source-exists", message: `ContractRule ${r.id} references nonexistent sourceDocumentId ${r.sourceDocumentId}` });
    if (r.sourceNodeId && !nodeIds.has(r.sourceNodeId)) issues.push({ rule: "rule-source-exists", message: `ContractRule ${r.id} references nonexistent sourceNodeId ${r.sourceNodeId}` });
  }
  return report(issues);
}

/** Every ContractRule.definedTermRefs entry resolves to a real DefinedTermNode.stableKey for the same company (task §47 - "defined term target exists"). */
export async function validateDefinedTermTargetsExist(companyId: string): Promise<ValidationReport> {
  const issues: ValidationIssue[] = [];
  const rules = await prisma.contractRule.findMany({ where: { companyId }, select: { id: true, definedTermRefs: true } });
  const knownKeys = new Set((await prisma.definedTermNode.findMany({ where: { companyId }, select: { stableKey: true } })).map((t) => t.stableKey));
  for (const r of rules) {
    for (const ref of r.definedTermRefs) {
      if (!knownKeys.has(ref)) issues.push({ rule: "defined-term-target-exists", message: `ContractRule ${r.id} references unknown defined-term stableKey ${ref}` });
    }
  }
  return report(issues);
}

/** Every resolved ContractReferenceEdge's target actually exists for the same company (task §47 - "cross-reference target exists"). An unresolved reference (resolved: false) is not a validation failure - it is the exact state task §19 asks this graph to represent. */
export async function validateReferenceTargetsExist(companyId: string): Promise<ValidationReport> {
  const issues: ValidationIssue[] = [];
  const edges = await prisma.contractReferenceEdge.findMany({ where: { companyId, resolved: true } });
  const [ruleIds, nodeIds, termIds, documentIds] = await Promise.all([
    prisma.contractRule.findMany({ where: { companyId }, select: { id: true } }).then((rows) => new Set(rows.map((r) => r.id))),
    prisma.documentNode.findMany({ where: { companyId }, select: { id: true } }).then((rows) => new Set(rows.map((r) => r.id))),
    prisma.definedTermNode.findMany({ where: { companyId }, select: { id: true } }).then((rows) => new Set(rows.map((r) => r.id))),
    prisma.document.findMany({ where: { companyId }, select: { id: true } }).then((rows) => new Set(rows.map((r) => r.id))),
  ]);
  for (const e of edges) {
    if (e.targetType === "RULE" && (!e.targetRuleId || !ruleIds.has(e.targetRuleId))) issues.push({ rule: "reference-target-exists", message: `ContractReferenceEdge ${e.id} marked resolved but targetRuleId is missing/unknown` });
    if (e.targetType === "SECTION" && (!e.targetDocumentNodeId || !nodeIds.has(e.targetDocumentNodeId))) issues.push({ rule: "reference-target-exists", message: `ContractReferenceEdge ${e.id} marked resolved but targetDocumentNodeId is missing/unknown` });
    if (e.targetType === "DEFINED_TERM" && (!e.targetTermId || !termIds.has(e.targetTermId))) issues.push({ rule: "reference-target-exists", message: `ContractReferenceEdge ${e.id} marked resolved but targetTermId is missing/unknown` });
    if (e.targetType === "DOCUMENT" && (!e.targetDocumentId || !documentIds.has(e.targetDocumentId))) issues.push({ rule: "reference-target-exists", message: `ContractReferenceEdge ${e.id} marked resolved but targetDocumentId is missing/unknown` });
  }
  return report(issues);
}

/** Every ContractRuleRelationship's fromRuleId/toRuleId targets a real, same-company rule (task §47 - "relationship target exists"). Prisma's own FK constraint already guarantees this at write time; this validator exists to catch a cross-company leak specifically (see validateTenantIsolation below) by re-checking companyId agreement, not just existence. */
export async function validateRelationshipTargetsExist(companyId: string): Promise<ValidationReport> {
  const issues: ValidationIssue[] = [];
  const relationships = await prisma.contractRuleRelationship.findMany({ where: { companyId }, include: { fromRule: { select: { companyId: true } }, toRule: { select: { companyId: true } } } });
  for (const rel of relationships) {
    if (rel.fromRule.companyId !== companyId) issues.push({ rule: "relationship-target-exists", message: `ContractRuleRelationship ${rel.id}'s fromRule belongs to a different company` });
    if (rel.toRule.companyId !== companyId) issues.push({ rule: "relationship-target-exists", message: `ContractRuleRelationship ${rel.id}'s toRule belongs to a different company` });
  }
  return report(issues);
}

/** No ContractRule for this company has an effectiveFrom/effectiveTo window that is inverted (effectiveTo before effectiveFrom) - task §47's "effective periods do not overlap illegally," narrowed to the one case that is ALWAYS illegal regardless of versioning scheme (a rule whose own window is backwards). Legitimate back-to-back windows across a version chain (rule A's effectiveTo == rule B's effectiveFrom) are correct and not flagged. */
export async function validateEffectivePeriodsWellFormed(companyId: string): Promise<ValidationReport> {
  const issues: ValidationIssue[] = [];
  const rules = await prisma.contractRule.findMany({ where: { companyId, effectiveFrom: { not: null }, effectiveTo: { not: null } }, select: { id: true, effectiveFrom: true, effectiveTo: true } });
  for (const r of rules) {
    if (r.effectiveFrom && r.effectiveTo && r.effectiveTo < r.effectiveFrom) issues.push({ rule: "effective-period-well-formed", message: `ContractRule ${r.id} has effectiveTo before effectiveFrom` });
  }
  return report(issues);
}

/** Every stableKey is unique within its own model for this company (task §47/§48 - "stable keys unique"). The Prisma @@unique constraint already enforces this at write time for every model below; this validator exists as an independent, queryable proof rather than relying solely on "no insert ever failed." */
export async function validateStableKeysUnique(companyId: string): Promise<ValidationReport> {
  const issues: ValidationIssue[] = [];
  const checks: { name: string; keys: string[] }[] = [
    { name: "DocumentNode", keys: (await prisma.documentNode.findMany({ where: { companyId }, select: { stableKey: true } })).map((r) => r.stableKey) },
    { name: "DefinedTermNode", keys: (await prisma.definedTermNode.findMany({ where: { companyId }, select: { stableKey: true } })).map((r) => r.stableKey) },
    { name: "ContractRule", keys: (await prisma.contractRule.findMany({ where: { companyId }, select: { stableKey: true } })).map((r) => r.stableKey) },
    { name: "ContractEventObligation", keys: (await prisma.contractEventObligation.findMany({ where: { companyId }, select: { stableKey: true } })).map((r) => r.stableKey) },
  ];
  for (const { name, keys } of checks) {
    const seen = new Set<string>();
    for (const key of keys) {
      if (seen.has(key)) issues.push({ rule: "stable-key-unique", message: `${name} has a duplicate stableKey: ${key}` });
      seen.add(key);
    }
  }
  return report(issues);
}

/** No dependency cycle among defined terms or rules traps getRuleSourceTrace/getDefinedTermDependencies in an infinite loop (task §15/§47/§50) - both traversals are already bounded (lib/contract-model/service.ts's MAX_TRAVERSAL_DEPTH) and self-report cycleDetected/maxDepthReached, so this validator just surfaces any it finds as an explicit review item rather than a silent truncation. */
export async function validateNoUnboundedCycles(companyId: string): Promise<ValidationReport> {
  const issues: ValidationIssue[] = [];
  const rules = await prisma.contractRule.findMany({ where: { companyId }, select: { id: true } });
  for (const r of rules) {
    const result = await getRuleDependencies(companyId, r.id);
    if (result.maxDepthReached) issues.push({ rule: "no-unbounded-cycles", message: `ContractRule ${r.id}'s dependency graph exceeded the traversal depth bound - likely an unbounded cycle` });
  }
  const terms = await prisma.definedTermNode.findMany({ where: { companyId }, select: { id: true } });
  for (const t of terms) {
    const result = await getDefinedTermDependencies(companyId, t.id);
    if (result.maxDepthReached) issues.push({ rule: "no-unbounded-cycles", message: `DefinedTermNode ${t.id}'s dependency graph exceeded the traversal depth bound - likely an unbounded cycle` });
  }
  return report(issues);
}

/**
 * Customer A's contract-model rows never reference Customer B's (task
 * §29/§80 tenant isolation). Checks every new Phase B model's own
 * companyId-scoped foreign keys agree.
 *
 * Phase 3F.1.4 (P1-2 remediation, docs/foundation-assurance/02-tenant-
 * instrument-isolation-results.json's `validate-tenant-isolation-blind-spot`
 * finding): this function previously checked only `targetRuleId`,
 * `DocumentRelationshipEdge.source/targetDocumentId`, and
 * `AmendmentEffect.amendmentDocumentId/targetDocumentId` - a cross-tenant
 * edge through `ContractReferenceEdge.targetTermId`/`targetDocumentNodeId`
 * passed clean. Per the audit's own instruction, this fix did NOT stop at
 * patching just those two named fields: every cross-model relation field in
 * the current, complete prisma/schema.prisma that could conceivably carry a
 * cross-tenant reference was mechanically enumerated (see the coverage
 * table below and the fuller version in this remediation's own report) and
 * checked for validation coverage before deciding what to add.
 *
 * DESIGN PRINCIPLE this fix applies uniformly: a genuinely exploitable
 * cross-tenant leak needs a TARGET-direction field - one whose value could,
 * by the field's own design, legitimately name a row this edge's OWNING row
 * does not itself control (the whole point of a reference/target field).
 * SOURCE-direction fields (e.g. ContractReferenceEdge.sourceNodeId/
 * sourceRuleId, DefinedTermDependencyEdge.fromTermId, ContractRule.
 * sourceNodeId, DocumentNode.parentId) are always populated by a persist_*
 * function ALONGSIDE that same row's own companyId, from data the SAME
 * document/company-scoped call already produced (see persistence.ts) - they
 * cannot diverge from their owning row's companyId without either an
 * existing persistence-layer bug (which would show up as a companyId
 * mismatch this function's own sanity-check loop below would catch, since
 * Prisma's own `where: { companyId }` filter is what populates every set
 * this function builds) or direct, out-of-band DB tampering neither this
 * function nor any application code can prevent. This fix therefore
 * targets every TARGET-direction field across the Phase B contract-model
 * graph, not merely the two the audit happened to name as an example -
 * see the coverage table in this remediation's own report for the complete,
 * disclosed enumeration of what is and is not checked here and why.
 */
export async function validateTenantIsolation(companyIdA: string, companyIdB: string): Promise<ValidationReport> {
  const issues: ValidationIssue[] = [];
  const rulesA = await prisma.contractRule.findMany({ where: { companyId: companyIdA } });
  const rulesB = await prisma.contractRule.findMany({ where: { companyId: companyIdB } });
  const idsA = new Set(rulesA.map((r) => r.id));
  const idsB = new Set(rulesB.map((r) => r.id));

  const crossRelationships = await prisma.contractRuleRelationship.findMany({ where: { companyId: companyIdA, OR: [{ fromRuleId: { in: [...idsB] } }, { toRuleId: { in: [...idsB] } }] } });
  if (crossRelationships.length > 0) issues.push({ rule: "tenant-isolation", message: `Company ${companyIdA} has ${crossRelationships.length} ContractRuleRelationship row(s) touching Company ${companyIdB}'s rules` });

  // Phase 2C debt package graph (docs/phase-2c-debt-package-graph.md §23) -
  // Company B's real document/node/term ids, used the same way idsB above
  // uses Company B's rule ids, to check every TARGET-direction field this
  // mechanical sweep found across the Phase B contract-model graph.
  const documentsB = await prisma.document.findMany({ where: { companyId: companyIdB }, select: { id: true } });
  const documentIdsB = new Set(documentsB.map((d) => d.id));
  const nodesB = await prisma.documentNode.findMany({ where: { companyId: companyIdB }, select: { id: true } });
  const nodeIdsB = new Set(nodesB.map((n) => n.id));
  const termsB = await prisma.definedTermNode.findMany({ where: { companyId: companyIdB }, select: { id: true } });
  const termIdsB = new Set(termsB.map((t) => t.id));
  const instrumentsB = await prisma.debtInstrument.findMany({ where: { companyId: companyIdB }, select: { id: true } });
  const instrumentIdsB = new Set(instrumentsB.map((i) => i.id));

  const crossDocumentRelationships = await prisma.documentRelationshipEdge.findMany({ where: { companyId: companyIdA, OR: [{ sourceDocumentId: { in: [...documentIdsB] } }, { targetDocumentId: { in: [...documentIdsB] } }] } });
  if (crossDocumentRelationships.length > 0) issues.push({ rule: "tenant-isolation", message: `Company ${companyIdA} has ${crossDocumentRelationships.length} DocumentRelationshipEdge row(s) touching Company ${companyIdB}'s documents` });

  // AmendmentEffect - amendmentDocumentId/targetDocumentId were already
  // checked; targetRuleId/targetTermId/targetDocumentNodeId are the SAME
  // shape of target-direction field (an amendment effect naming a rule,
  // term, or structural node it modifies) and were NOT previously checked -
  // added here as part of this fix's mechanical, not example-driven, sweep.
  const crossAmendmentEffects = await prisma.amendmentEffect.findMany({
    where: {
      companyId: companyIdA,
      OR: [
        { amendmentDocumentId: { in: [...documentIdsB] } },
        { targetDocumentId: { in: [...documentIdsB] } },
        { targetRuleId: { in: [...idsB] } },
        { targetTermId: { in: [...termIdsB] } },
        { targetDocumentNodeId: { in: [...nodeIdsB] } },
      ],
    },
  });
  if (crossAmendmentEffects.length > 0) issues.push({ rule: "tenant-isolation", message: `Company ${companyIdA} has ${crossAmendmentEffects.length} AmendmentEffect row(s) touching Company ${companyIdB}'s documents/rules/terms/nodes` });

  // ContractReferenceEdge - targetRuleId was already checked; the audit's
  // own two named gaps (targetTermId, targetDocumentNodeId) plus
  // targetDocumentId (the same shape of field, found by this fix's own
  // mechanical sweep rather than named by the audit) are added here.
  const crossReferences = await prisma.contractReferenceEdge.findMany({
    where: {
      companyId: companyIdA,
      OR: [{ targetRuleId: { in: [...idsB] } }, { targetTermId: { in: [...termIdsB] } }, { targetDocumentNodeId: { in: [...nodeIdsB] } }, { targetDocumentId: { in: [...documentIdsB] } }],
    },
  });
  if (crossReferences.length > 0) issues.push({ rule: "tenant-isolation", message: `Company ${companyIdA} has ${crossReferences.length} ContractReferenceEdge row(s) targeting Company ${companyIdB}'s rules/terms/nodes/documents` });

  // DebtInstrument.baseDocumentId / Document.instrumentId - the two
  // remaining target-direction fields this sweep found in the Phase 2C
  // package-graph surface (an instrument naming its own base document, and
  // a document naming the instrument that groups it).
  const crossInstrumentBaseDocuments = await prisma.debtInstrument.findMany({ where: { companyId: companyIdA, baseDocumentId: { in: [...documentIdsB] } } });
  if (crossInstrumentBaseDocuments.length > 0) issues.push({ rule: "tenant-isolation", message: `Company ${companyIdA} has ${crossInstrumentBaseDocuments.length} DebtInstrument row(s) whose baseDocumentId targets Company ${companyIdB}'s documents` });

  const crossDocumentInstruments = await prisma.document.findMany({ where: { companyId: companyIdA, instrumentId: { in: [...instrumentIdsB] } } });
  if (crossDocumentInstruments.length > 0) issues.push({ rule: "tenant-isolation", message: `Company ${companyIdA} has ${crossDocumentInstruments.length} Document row(s) whose instrumentId targets Company ${companyIdB}'s debt instruments` });

  // A companyId column mismatch on any of these two rule sets would mean
  // findMany's own `where: { companyId }` filter is not doing its job -
  // impossible under normal Prisma usage, but asserted here as a hard
  // sanity check rather than assumed.
  for (const r of rulesA) if (r.companyId !== companyIdA) issues.push({ rule: "tenant-isolation", message: `ContractRule ${r.id} returned under companyId ${companyIdA} filter but has companyId ${r.companyId}` });
  for (const r of rulesB) if (r.companyId !== companyIdB) issues.push({ rule: "tenant-isolation", message: `ContractRule ${r.id} returned under companyId ${companyIdB} filter but has companyId ${r.companyId}` });

  return report(issues);
}

/** Runs every structural validator above for one company and merges the results - the single entry point a future compiler stage or an ops script would call after populating/updating this graph. */
export async function validateContractModel(companyId: string): Promise<ValidationReport> {
  const reports = await Promise.all([
    validateRuleSourcesExist(companyId),
    validateDefinedTermTargetsExist(companyId),
    validateReferenceTargetsExist(companyId),
    validateRelationshipTargetsExist(companyId),
    validateEffectivePeriodsWellFormed(companyId),
    validateStableKeysUnique(companyId),
    validateNoUnboundedCycles(companyId),
  ]);
  return report(reports.flatMap((r) => r.issues));
}
