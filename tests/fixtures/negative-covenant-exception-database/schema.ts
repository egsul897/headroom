/**
 * Offline schema for the Negative Covenant Exception Database.
 *
 * RESEARCH ONLY. Never import this module from lib/contract-model/**,
 * app/**, or runtime capacity paths.
 */

export const COVENANT_FAMILIES = [
  "DEBT_INCURRENCE",
  "LIENS",
  "RESTRICTED_PAYMENTS",
  "INVESTMENTS",
  "ASSET_SALES",
  "AFFILIATE_TRANSACTIONS",
  "FUNDAMENTAL_CHANGES",
  "JUNIOR_DEBT_PREPAYMENTS",
  "SUBSIDIARY_RESTRICTIONS",
] as const;

export type CovenantFamily = (typeof COVENANT_FAMILIES)[number];

export const CONDITION_LOCATIONS = [
  "IN_EXCEPTION_CLAUSE",
  "PARENT_CHAPEAU",
  "ARTICLE_LEVEL",
  "SECTION_WIDE_PROVISO",
  "HANGING_TRAILING_PROVISO",
  "CROSS_REFERENCED_SECTION",
  "DEFINED_TERM",
  "AMENDMENT",
] as const;

export type ConditionLocation = (typeof CONDITION_LOCATIONS)[number];

export const REMOTE_CONDITION_LOCATIONS: readonly ConditionLocation[] = [
  "PARENT_CHAPEAU",
  "ARTICLE_LEVEL",
  "SECTION_WIDE_PROVISO",
  "HANGING_TRAILING_PROVISO",
  "CROSS_REFERENCED_SECTION",
  "DEFINED_TERM",
  "AMENDMENT",
];

export type CapacityShape =
  | "NONE_QUALITATIVE"
  | "FIXED_MONEY"
  | "GREATER_OF_MONEY_OR_PCT"
  | "RATIO_GATED_UNLIMITED"
  | "BUILDER_SHARED"
  | "UNLIMITED_GATED"
  | "SCHEDULE_REFERENCED";

export type VerificationStatus =
  | "SOURCE_VERIFIED"
  | "SOURCE_VERIFIED_PARTIAL_CONTEXT"
  | "SYNTHETIC_ADVERSARIAL"
  | "UNVERIFIED";

export interface ConditionRecord {
  conditionId: string;
  text: string;
  location: ConditionLocation;
  locationRef: string;
  computableHint: string;
}

export interface ExceptionRecord {
  exceptionId: string;
  sourcePackage: string;
  sourcePath: string;
  sourceSha256?: string;
  covenantFamily: CovenantFamily;
  parentProhibition: { sectionRef: string; text: string };
  exceptionSectionRef: string;
  exactExceptionText: string;
  structuralHierarchy: string[];
  definedTerms: string[];
  conditions: ConditionRecord[];
  amountsAndRatios: Array<{ kind: string; value: string; measurementBasis?: string }>;
  entityScope: { includes: string[]; excludes: string[]; notes?: string };
  sharedCapacityInteractions: Array<{
    kind: string;
    description: string;
    relatedRefs: string[];
  }>;
  amendments: Array<{ documentRef: string; effect: string; status: string }>;
  provisos: Array<{ text: string; attachment: string; scopeNote: string }>;
  crossReferences: Array<{ targetRef: string; role: string }>;
  remoteConstraintFlags: Array<{ kind: string; description: string }>;
  seeminglyPermissiveButConstrained: boolean;
  /** Mission invariant: always false. */
  unconditionalCapacity: false;
  capacityShape: CapacityShape;
  verificationStatus: VerificationStatus;
  notes: string;
}

export interface ExceptionCatalog {
  datasetId: string;
  title: string;
  status: string;
  nonGoals: string[];
  priorityFamilies: CovenantFamily[];
  sourceManifest: Record<string, { path: string; sha256: string }>;
  counts: {
    exceptions: number;
    byFamily: Record<string, number>;
    bySource: Record<string, number>;
    withRemoteConditions: number;
    hangingOrSectionWideProvisos: number;
    seeminglyPermissiveButConstrained: number;
  };
  indexes: {
    byFamily: Record<string, string[]>;
    bySource: Record<string, string[]>;
    remoteConditionExceptionIds: string[];
    hangingOrSectionWideProvisoIds: string[];
    seeminglyPermissiveButConstrainedIds: string[];
  };
  exceptions: ExceptionRecord[];
}

export interface AdversarialCase {
  caseId: string;
  title: string;
  failureMode: string;
  syntheticDrafting: string;
  naiveMisread: string;
  correctRead: string;
  requiredFields: string[];
  expectedSearchTags: string[];
}

export interface AdversarialSuite {
  datasetId: string;
  status: string;
  principle: string;
  cases: AdversarialCase[];
}

export interface SearchQuery {
  text?: string;
  covenantFamily?: CovenantFamily | CovenantFamily[];
  sourcePackage?: string | string[];
  hasRemoteConditions?: boolean;
  hangingProviso?: boolean;
  sharedCapacity?: boolean;
  seeminglyPermissiveButConstrained?: boolean;
  capacityShape?: CapacityShape | CapacityShape[];
  verificationStatus?: VerificationStatus | VerificationStatus[];
  remoteFlagKind?: string | string[];
  definedTerm?: string;
  sectionRef?: string;
}

function asArray<T>(v: T | T[] | undefined): T[] {
  if (v === undefined) return [];
  return Array.isArray(v) ? v : [v];
}

function haystack(r: ExceptionRecord): string {
  return [
    r.exceptionId,
    r.sourcePackage,
    r.covenantFamily,
    r.exceptionSectionRef,
    r.exactExceptionText,
    r.parentProhibition.text,
    r.parentProhibition.sectionRef,
    r.notes,
    r.capacityShape,
    ...r.structuralHierarchy,
    ...r.definedTerms,
    ...r.conditions.map((c) => `${c.text} ${c.location} ${c.locationRef}`),
    ...r.amountsAndRatios.map((a) => `${a.kind} ${a.value} ${a.measurementBasis ?? ""}`),
    ...r.entityScope.includes,
    ...r.entityScope.excludes,
    r.entityScope.notes ?? "",
    ...r.sharedCapacityInteractions.map((s) => `${s.kind} ${s.description} ${s.relatedRefs.join(" ")}`),
    ...r.provisos.map((p) => `${p.text} ${p.attachment} ${p.scopeNote}`),
    ...r.crossReferences.map((x) => `${x.targetRef} ${x.role}`),
    ...r.remoteConstraintFlags.map((f) => `${f.kind} ${f.description}`),
  ]
    .join("\n")
    .toLowerCase();
}

export function hasRemoteConditions(r: ExceptionRecord): boolean {
  if (r.remoteConstraintFlags.length > 0) return true;
  return r.conditions.some((c) => (REMOTE_CONDITION_LOCATIONS as readonly string[]).includes(c.location));
}

export function hasHangingOrSectionWideProviso(r: ExceptionRecord): boolean {
  if (r.provisos.some((p) => ["HANGING", "SECTION_WIDE", "TRAILING_LIST_WIDE"].includes(p.attachment))) {
    return true;
  }
  return r.remoteConstraintFlags.some((f) => f.kind === "HANGING_PROVISO" || f.kind === "SECTION_WIDE_LIMITATION");
}

export function hasSharedCapacity(r: ExceptionRecord): boolean {
  return r.sharedCapacityInteractions.length > 0;
}

/** Deterministic offline search over the exception catalog. */
export function searchExceptions(catalog: ExceptionCatalog, query: SearchQuery = {}): ExceptionRecord[] {
  const families = new Set(asArray(query.covenantFamily));
  const sources = new Set(asArray(query.sourcePackage));
  const shapes = new Set(asArray(query.capacityShape));
  const statuses = new Set(asArray(query.verificationStatus));
  const flagKinds = new Set(asArray(query.remoteFlagKind));
  const text = query.text?.trim().toLowerCase();

  return catalog.exceptions.filter((r) => {
    if (families.size && !families.has(r.covenantFamily)) return false;
    if (sources.size && !sources.has(r.sourcePackage)) return false;
    if (shapes.size && !shapes.has(r.capacityShape)) return false;
    if (statuses.size && !statuses.has(r.verificationStatus)) return false;
    if (query.hasRemoteConditions === true && !hasRemoteConditions(r)) return false;
    if (query.hasRemoteConditions === false && hasRemoteConditions(r)) return false;
    if (query.hangingProviso === true && !hasHangingOrSectionWideProviso(r)) return false;
    if (query.hangingProviso === false && hasHangingOrSectionWideProviso(r)) return false;
    if (query.sharedCapacity === true && !hasSharedCapacity(r)) return false;
    if (query.sharedCapacity === false && hasSharedCapacity(r)) return false;
    if (
      query.seeminglyPermissiveButConstrained !== undefined &&
      r.seeminglyPermissiveButConstrained !== query.seeminglyPermissiveButConstrained
    ) {
      return false;
    }
    if (flagKinds.size && !r.remoteConstraintFlags.some((f) => flagKinds.has(f.kind))) return false;
    if (query.definedTerm) {
      const needle = query.definedTerm.toLowerCase();
      if (!r.definedTerms.some((t) => t.toLowerCase().includes(needle))) return false;
    }
    if (query.sectionRef) {
      const needle = query.sectionRef.toLowerCase();
      const sectionHay = `${r.exceptionSectionRef} ${r.parentProhibition.sectionRef} ${r.structuralHierarchy.join(" ")}`.toLowerCase();
      if (!sectionHay.includes(needle)) return false;
    }
    if (text && !haystack(r).includes(text)) return false;
    return true;
  });
}

export function assertMissionInvariants(catalog: ExceptionCatalog): string[] {
  const errors: string[] = [];
  if (catalog.status !== "OFFLINE_RESEARCH_DATASET") {
    errors.push(`unexpected status ${catalog.status}`);
  }
  for (const family of COVENANT_FAMILIES) {
    if ((catalog.counts.byFamily[family] ?? 0) < 1) {
      errors.push(`missing coverage for ${family}`);
    }
  }
  for (const r of catalog.exceptions) {
    if (r.unconditionalCapacity !== false) {
      errors.push(`${r.exceptionId}: unconditionalCapacity must be false`);
    }
    for (const field of [
      "parentProhibition",
      "exactExceptionText",
      "structuralHierarchy",
      "definedTerms",
      "conditions",
      "amountsAndRatios",
      "entityScope",
      "sharedCapacityInteractions",
      "amendments",
      "provisos",
      "crossReferences",
      "verificationStatus",
    ] as const) {
      if (r[field] === undefined || r[field] === null) {
        errors.push(`${r.exceptionId}: missing ${field}`);
      }
    }
    if (!r.parentProhibition?.text || !r.parentProhibition?.sectionRef) {
      errors.push(`${r.exceptionId}: parentProhibition incomplete`);
    }
    if (!r.exactExceptionText.trim()) {
      errors.push(`${r.exceptionId}: empty exactExceptionText`);
    }
    if (!Array.isArray(r.structuralHierarchy) || r.structuralHierarchy.length < 2) {
      errors.push(`${r.exceptionId}: structuralHierarchy too shallow`);
    }
  }
  return errors;
}
