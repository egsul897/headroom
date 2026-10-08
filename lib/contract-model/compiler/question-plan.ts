/**
 * Dry-run plan for one compliance question.
 *
 * Entry provisions are operative sections whose text states the asked
 * family with a normative verb, plus any section the question names.
 * The existing compilation-scope closure then follows resolved section
 * and clause references. A discovery label for the same family that the
 * closure does not reach is disclosed and is not compiled. A contents
 * listing is refused. Unexamined operative sections keep the plan at
 * REVIEW_REQUIRED.
 *
 * This does not compile, call a model, permit capacity, or certify.
 * A dollar figure in the question is a parameter, not a computed capacity.
 * Unknown capacity is not unlimited. An unpriceable model is not replaced.
 */
import { maxCostOfRequestUsd } from "../analyzer/pricing";
import { compareCompilationScopes, type KnownDefinition, type ScopeReference } from "./compilation-scope";
import { dependencyUncertainty, type EvidenceReuseContract } from "./evidence-engine/identity";
import { ContentAddressedEvidenceStore } from "./evidence-engine/store";

export type QuestionFamily =
  | "INDEBTEDNESS"
  | "LIENS"
  | "RESTRICTED_PAYMENTS"
  | "INVESTMENTS"
  | "FINANCIAL_COVENANTS"
  | "ASSET_SALES"
  | "DISPOSITIONS"
  | "FUNDAMENTAL_CHANGES"
  | "GUARANTEES";

/** Normative drafting, not a definition sentence that only mentions the family word. */
const NORMATIVE = /\b(?:shall|must|may|will)\b/i;

const FAMILY_CUES: { family: QuestionFamily; cue: RegExp }[] = [
  { family: "INDEBTEDNESS", cue: /\b(?:incur(?:red|ring|s)?|borrow(?:ing|ed|s)?|indebtedness|debts?)\b/i },
  { family: "LIENS", cue: /\b(?:secured|security interest|lien|pledge|mortgage|collateral)\b/i },
  { family: "RESTRICTED_PAYMENTS", cue: /\b(?:dividend|restricted payment|distribution)\b/i },
  { family: "INVESTMENTS", cue: /\b(?:investment|acquire|acquisition)\b/i },
  { family: "FINANCIAL_COVENANTS", cue: /\b(?:leverage|coverage ratio|financial covenant)\b/i },
  { family: "ASSET_SALES", cue: /\b(?:asset sale)\b/i },
  { family: "DISPOSITIONS", cue: /\b(?:disposition|dispose)\b/i },
  { family: "FUNDAMENTAL_CHANGES", cue: /\b(?:merger|consolidation)\b/i },
  { family: "GUARANTEES", cue: /\b(?:guarantee|guaranty)\b/i },
];

export interface QuestionProvision {
  id: string;
  sectionRef: string;
  documentId: string;
  text: string;
  sourceSha256: string;
  structuralKind: "OPERATIVE_OCCURRENCE" | "CONTENTS_LISTING" | "NO_OPERATIVE_EVIDENCE";
  /** Families already assigned by discovery. Empty when discovery has not run. */
  families: readonly string[];
  operativeVersionId: string;
  dependencyHashes?: Readonly<Record<string, string>>;
}

export interface QuestionPlanRequest {
  question: string;
  provisions: readonly QuestionProvision[];
  references: readonly ScopeReference[];
  definitions: readonly KnownDefinition[];
  requiredTerms?: readonly string[];
  store?: ContentAddressedEvidenceStore;
  /** Worst-case tokens for one compilation. Absent means the cost is not estimated. */
  reservation?: { modelId: string; maxInputTokens: number; maxOutputTokens: number };
  promptVersion?: string;
  schemaVersion?: string;
  compilerVersion?: string;
}

export interface PlannedUnit {
  id: string;
  sectionRef: string;
  documentId: string;
  sourceSha256: string;
  operativeVersionId: string;
  action: "REUSE" | "DISPATCH" | "REFUSED_UNPRICEABLE" | "REFUSED_UNCERTAIN";
  reason: "FAMILY_MATCH" | "REFERENCE_CLOSURE";
}

export interface QuestionCompilationPlan {
  families: QuestionFamily[];
  questionParameter: string | null;
  capacityComputed: false;
  unknownIsUnlimited: false;
  permitsCapacity: false;
  advancesCertification: false;
  measuredProviderCalls: 0;
  status: "DRY_RUN" | "REVIEW_REQUIRED" | "BLOCKED";
  statusReasons: string[];
  planned: PlannedUnit[];
  reused: number;
  simulatedDispatches: number;
  refusedSources: { id: string; sectionRef: string; structuralKind: QuestionProvision["structuralKind"] }[];
  notExaminedSectionRefs: string[];
  sameActionNotReached: string[];
  unresolvedReferences: number;
  missingDefinitions: string[];
  estimatedWorstCaseUsd: number | null;
  pricingStatus: "PRICED" | "UNKNOWN_MODEL" | "ESTIMATE_INPUTS_MISSING" | "NO_DISPATCH";
  measuredBillingUsd: null;
  localElapsedMs: number;
}

export function familiesForQuestion(question: string): QuestionFamily[] {
  return FAMILY_CUES.filter((rule) => rule.cue.test(question)).map((rule) => rule.family);
}

export function planQuestionCompilation(request: QuestionPlanRequest): QuestionCompilationPlan {
  const started = performance.now();
  const families = familiesForQuestion(request.question);
  const parameter = request.question.match(/\$\s?[\d,]+(?:\.\d+)?(?:\s*million|\s*billion)?/i)?.[0] ?? null;
  const namedSections = namedSectionRefs(request.question);
  const store = request.store ?? new ContentAddressedEvidenceStore();
  const operative = request.provisions.filter((provision) => provision.structuralKind === "OPERATIVE_OCCURRENCE");
  const refusedSources = request.provisions
    .filter((provision) => provision.structuralKind !== "OPERATIVE_OCCURRENCE" && mentionsFamily(provision, families))
    .map((provision) => ({ id: provision.id, sectionRef: provision.sectionRef, structuralKind: provision.structuralKind }));
  const seeds = operative.filter((provision) => lexicalEntry(provision, families) || namedSections.has(provision.sectionRef));
  const seedRefs = [...new Set(seeds.map((provision) => provision.sectionRef))];
  const scope = compareCompilationScopes({
    units: operative.map((provision) => ({ id: provision.id, sectionRef: provision.sectionRef, text: provision.text })),
    seedSectionRefs: seedRefs,
    references: request.references,
    definitions: request.definitions,
    requiredTerms: request.requiredTerms,
  });
  const compiled = new Set(scope.approachC.compiledUnitIds);
  const planned: PlannedUnit[] = [];
  let pricingStatus: QuestionCompilationPlan["pricingStatus"] = "NO_DISPATCH";
  let perCall: number | null = null;
  if (request.reservation) {
    perCall = maxCostOfRequestUsd(request.reservation, request.reservation.modelId);
    pricingStatus = perCall === null ? "UNKNOWN_MODEL" : "PRICED";
  }
  for (const provision of operative) {
    if (!compiled.has(provision.id)) continue;
    const contract = contractFor(provision, request);
    const read = store.read(contract);
    const reusable = read.status === "HIT";
    const uncertain = !reusable && dependencyUncertainty(contract).length > 0;
    const unpriceable = !reusable && !uncertain && pricingStatus === "UNKNOWN_MODEL";
    planned.push({
      id: provision.id,
      sectionRef: provision.sectionRef,
      documentId: provision.documentId,
      sourceSha256: provision.sourceSha256,
      operativeVersionId: provision.operativeVersionId,
      action: reusable ? "REUSE" : uncertain ? "REFUSED_UNCERTAIN" : unpriceable ? "REFUSED_UNPRICEABLE" : "DISPATCH",
      reason: seedRefs.includes(provision.sectionRef) ? "FAMILY_MATCH" : "REFERENCE_CLOSURE",
    });
  }
  const notExaminedSectionRefs = operative.filter((provision) => !compiled.has(provision.id)).map((provision) => provision.sectionRef);
  const sameActionNotReached = operative
    .filter((provision) => !compiled.has(provision.id) && discoveryMatch(provision, families))
    .map((provision) => provision.sectionRef);
  const ambiguousSectionRefs = ambiguousOperativeRefs(operative);
  const reasons: string[] = [];
  let status: QuestionCompilationPlan["status"] = "DRY_RUN";
  if (families.length === 0) {
    status = "BLOCKED";
    reasons.push("NO_FAMILY_MAPPING");
  } else if (seedRefs.length === 0) {
    status = "BLOCKED";
    reasons.push("NO_OPERATIVE_SEED");
  }
  if (scope.approachC.unresolvedEdges.length > 0) reasons.push("UNRESOLVED_REFERENCE");
  if (scope.approachC.missingDefinitions.length > 0) reasons.push("MISSING_DEFINITION");
  if (sameActionNotReached.length > 0) reasons.push("SAME_ACTION_OUTSIDE_CLOSURE");
  if (notExaminedSectionRefs.length > 0) reasons.push("NOT_EXAMINED_REMAINS");
  if (ambiguousSectionRefs.length > 0) reasons.push("AMBIGUOUS_SECTION_IDENTITY");
  if (planned.some((unit) => unit.operativeVersionId === "UNKNOWN" || unit.operativeVersionId === "")) reasons.push("UNKNOWN_OPERATIVE_VERSION");
  if (planned.some((unit) => unit.action === "REFUSED_UNCERTAIN")) reasons.push("UNCERTAIN_REUSE_CONTRACT");
  if (planned.some((unit) => unit.action === "REFUSED_UNPRICEABLE")) reasons.push("UNPRICEABLE_MODEL");
  if (status !== "BLOCKED" && reasons.length > 0) status = "REVIEW_REQUIRED";
  const simulatedDispatches = planned.filter((unit) => unit.action === "DISPATCH").length;
  const estimatedWorstCaseUsd = perCall === null || simulatedDispatches === 0 ? null : Number((perCall * simulatedDispatches).toFixed(10));
  if (!request.reservation && simulatedDispatches > 0) pricingStatus = "ESTIMATE_INPUTS_MISSING";
  if (planned.length > 0 && planned.every((unit) => unit.action === "REUSE")) pricingStatus = "NO_DISPATCH";
  return {
    families,
    questionParameter: parameter,
    capacityComputed: false,
    unknownIsUnlimited: false,
    permitsCapacity: false,
    advancesCertification: false,
    measuredProviderCalls: 0,
    status,
    statusReasons: reasons,
    planned,
    reused: planned.filter((unit) => unit.action === "REUSE").length,
    simulatedDispatches,
    refusedSources,
    notExaminedSectionRefs,
    sameActionNotReached,
    unresolvedReferences: scope.approachC.unresolvedEdges.length,
    missingDefinitions: scope.approachC.missingDefinitions,
    estimatedWorstCaseUsd,
    pricingStatus,
    measuredBillingUsd: null,
    localElapsedMs: performance.now() - started,
  };
}

function cueFor(family: QuestionFamily): RegExp | undefined {
  return FAMILY_CUES.find((item) => item.family === family)?.cue;
}

function mentionsFamily(provision: QuestionProvision, families: readonly QuestionFamily[]): boolean {
  if (discoveryMatch(provision, families)) return true;
  return families.some((family) => cueFor(family)?.test(provision.text) ?? false);
}

/** A family word plus a normative verb. A definitions sentence that only says "means" is not an entry. */
function lexicalEntry(provision: QuestionProvision, families: readonly QuestionFamily[]): boolean {
  if (!NORMATIVE.test(provision.text)) return false;
  return families.some((family) => cueFor(family)?.test(provision.text) ?? false);
}

function discoveryMatch(provision: QuestionProvision, families: readonly QuestionFamily[]): boolean {
  return provision.families.some((family) => families.includes(family as QuestionFamily));
}

function namedSectionRefs(question: string): Set<string> {
  const refs = new Set<string>();
  const named = /\b(?:sections?|§)\s+(\d+(?:\.\d+)?(?:\([a-z0-9]+\))*)/gi;
  for (const match of question.matchAll(named)) {
    const ref = match[1];
    if (ref) refs.add(ref);
  }
  return refs;
}

function ambiguousOperativeRefs(operative: readonly QuestionProvision[]): string[] {
  const idsByRef = new Map<string, string[]>();
  for (const provision of operative) {
    const ids = idsByRef.get(provision.sectionRef) ?? [];
    ids.push(provision.id);
    idsByRef.set(provision.sectionRef, ids);
  }
  return [...idsByRef.entries()].filter(([, ids]) => ids.length > 1).map(([ref]) => ref);
}

function contractFor(provision: QuestionProvision, request: QuestionPlanRequest): EvidenceReuseContract {
  return {
    sourceContentSha256: provision.sourceSha256,
    documentId: provision.documentId,
    operativeVersionId: provision.operativeVersionId,
    dependencyHashes: provision.dependencyHashes ?? {},
    promptVersion: request.promptVersion ?? "unspecified",
    schemaVersion: request.schemaVersion ?? "unspecified",
    modelId: request.reservation?.modelId ?? "unspecified",
    inferenceConfigHash: "dry-run",
    stage: "semantic-compile",
    compilerVersion: request.compilerVersion ?? "unspecified",
    artifactKind: "SEMANTIC_IR",
  };
}
