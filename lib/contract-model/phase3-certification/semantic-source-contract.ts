/**
 * SEMANTIC SOURCE CONTRACT VERSION (sscv1) - the invalidation identity a certified unit carries.
 *
 * The operative identity (scv1, covenant-map/source-content-version.ts) binds the exact operative text, its anchor
 * and applied amendment effects. It does NOT bind the context the compiler relied on: a basket of "5% of Consolidated
 * EBITDA" compiles against the EBITDA definition retrieved into the context bundle, and a change to that definition
 * must invalidate the artifact even though the covenant's own text is byte-identical. The contract version binds:
 *
 *   - the operative source version (scv1)
 *   - the RELIED-UPON context bundle items: definition excerpts for every defined term the compiled units reference
 *     (transitively through the compiled definitions' own dependencies), the candidate's governing scope items,
 *     lineage leads, and any section the units explicitly cite - each as (document, ref, excerpt hash, evidence state)
 *   - the compiler's authenticated retrieval records (what the model actually fetched)
 *   - operative lineage, applied amendment effects and supersession state
 *   - the as-of date
 *
 * and NEVER model output, verification results, cost or wall-clock time.
 *
 * Attribution modes. RELIED_UPON: every referenced term / cited section could be attributed to a bundle item, a
 * compiled definition or a retrieval record, so only those items enter the hash (an unrelated definition changing
 * leaves the version stable). BROAD_BUNDLE: some reliance could not be attributed, so the whole bundle's content
 * identity enters the hash - conservative: any bundle change invalidates. NO_BUNDLE: no context was available; the
 * contract is WEAK and the candidate cannot be certified. The trade-off is explicit in `attributionMode`.
 *
 * Ordering: the contract is computed from the compile INPUT and the compiled units' references, before verification,
 * and stamped on every unit before the pre-verification snapshot. The verifier's own evidence set is bound separately
 * by the verification artifact (evidenceSetHash), not here.
 */
import type { CovenantContextBundle, ContextItem } from "../compiler/context-retrieval/types";
import type { ToolCallLogEntry } from "../compiler/semantic/types";
import type { IRDefinition, IRRule, IRSharedCapacity, OperativeLineageRef } from "../ir/types";
import { normalizeDefinedTermRef } from "../compiler/amendment/chain";
import { collectDefinedTermReferences } from "../covenant-map/assemble";
import { canonicalJson, sha256Hex } from "../covenant-map/source-content-version";
import type { IdentityStrength } from "../covenant-map/types";

export const SEMANTIC_SOURCE_CONTRACT_PREFIX = "sscv1";
export type ContextAttributionMode = "RELIED_UPON" | "BROAD_BUNDLE" | "NO_BUNDLE";

/** Bundle item types that govern the reading of the operative text regardless of explicit citation. */
const ALWAYS_RELIED_UPON: ReadonlySet<string> = new Set(["OPERATIVE_SOURCE", "PARENT_SCOPE", "AMENDMENT_LEAD", "SUPPLEMENT_LEAD", "ENTITY_SCOPE"]);
const DEFINITION_ITEM_TYPES: ReadonlySet<string> = new Set(["DEFINITION", "DEFINITION_DEPENDENCY"]);

export interface SemanticSourceContractInput {
  operativeSourceVersion: string;
  operativeIdentityStrength: IdentityStrength;
  candidateSectionRef: string;
  bundle: CovenantContextBundle | null;
  units: { rules: readonly IRRule[]; definitions: readonly IRDefinition[]; sharedCapacities: readonly IRSharedCapacity[] };
  toolCallLog: readonly ToolCallLogEntry[];
  operativeLineage: OperativeLineageRef | null;
  appliedEffectIds: readonly string[];
  asOfDate: string | null;
}

export interface ReliedUponContextItem { itemId: string; type: string; documentId: string; normalizedRef: string; excerptSha256: string; evidenceStatus: string | null }
export interface ReliedUponRetrieval { requestKind: string; requestKey: string; documentId: string; sourceNodeId: string | null; contentHash: string; textOrigin: string }

export interface SemanticSourceContract {
  version: string;
  strength: IdentityStrength;
  attributionMode: ContextAttributionMode;
  reliedUpon: {
    definedTerms: string[];
    sectionRefs: string[];
    contextItems: ReliedUponContextItem[];
    retrievals: ReliedUponRetrieval[];
    unattributedTerms: string[];
    unattributedSectionRefs: string[];
  };
  components: {
    operativeSourceVersion: string;
    contextDependencyHash: string;
    retrievalHash: string;
    lineageHash: string;
    asOfDate: string | null;
    /** Present only in BROAD_BUNDLE mode. */
    bundleContentIdentity: string | null;
  };
}

export const normalizeSectionRef = (ref: string): string => ref.replace(/^\s*(section|sec\.?|§)\s*/i, "").replace(/\s+/g, "").trim().toLowerCase();

/**
 * Section citations the units make OUTSIDE their own text. A DEFINED_TERM_REFERENCE node's citation is the term's
 * location (bound through the term's bundle item), and a definition unit's citations are the definition's own
 * location (bound through its term) - neither is an independent section reliance, so both are skipped.
 */
function collectCitations(root: unknown): string[] {
  const out = new Set<string>();
  const walk = (v: unknown): void => {
    if (!v || typeof v !== "object") return;
    if (Array.isArray(v)) { v.forEach(walk); return; }
    if ((v as { kind?: unknown }).kind === "DEFINED_TERM_REFERENCE") return;
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
      if ((k === "citation" || k === "sourceCitation" || k === "sourceSectionRef") && typeof x === "string" && x.trim()) out.add(x.trim());
      else if (x && typeof x === "object") walk(x);
    }
  };
  walk(root);
  return [...out];
}

/** Every defined term the compiled units reference or define, normalized. */
export function referencedDefinedTerms(units: SemanticSourceContractInput["units"]): string[] {
  const out = new Set<string>();
  for (const r of units.rules) for (const t of collectDefinedTermReferences({ capacityExpression: r.capacityExpression, conditions: r.conditions, exceptions: r.exceptions, transactionScope: r.transactionScope })) out.add(normalizeDefinedTermRef(t.termName));
  for (const d of units.definitions) {
    out.add(normalizeDefinedTermRef(d.termName));
    for (const t of d.dependsOnTerms) out.add(normalizeDefinedTermRef(t));
    for (const t of collectDefinedTermReferences(d.calculationExpression)) out.add(normalizeDefinedTermRef(t.termName));
  }
  for (const c of units.sharedCapacities) for (const t of collectDefinedTermReferences(c.capExpression)) out.add(normalizeDefinedTermRef(t.termName));
  return [...out].sort();
}

export function computeSemanticSourceContract(input: SemanticSourceContractInput): SemanticSourceContract {
  const terms = referencedDefinedTerms(input.units);
  const ownRef = normalizeSectionRef(input.candidateSectionRef);
  const cited = new Set<string>();
  for (const c of collectCitations([input.units.rules, input.units.sharedCapacities])) {
    const n = normalizeSectionRef(c);
    // a citation of the candidate's own section (or a clause inside it) is the operative text itself, already bound by scv1
    if (!n || n === ownRef || n.startsWith(`${ownRef}(`) || n.startsWith(ownRef + ".")) continue;
    // a citation that is a defined term name (definition citations are written as the term) is covered by the term list
    if (terms.includes(normalizeDefinedTermRef(c))) continue;
    cited.add(n);
  }
  const sectionRefs = [...cited].sort();

  const items: ContextItem[] = input.bundle?.items ?? [];
  const relied = new Map<string, ContextItem>();
  const attributedTerms = new Set<string>();
  const attributedRefs = new Set<string>();
  for (const it of items) {
    if (DEFINITION_ITEM_TYPES.has(it.type)) {
      const t = normalizeDefinedTermRef(it.normalizedRef);
      if (terms.includes(t)) { relied.set(it.itemId, it); attributedTerms.add(t); }
      continue;
    }
    const refs = [normalizeSectionRef(it.normalizedRef), normalizeSectionRef(it.sourceCitation ?? "")].filter((x) => x && cited.has(x));
    if (ALWAYS_RELIED_UPON.has(it.type)) { relied.set(it.itemId, it); for (const x of refs) attributedRefs.add(x); continue; }
    if (refs.length > 0) { relied.set(it.itemId, it); for (const x of refs) attributedRefs.add(x); }
  }
  for (const d of input.units.definitions) attributedTerms.add(normalizeDefinedTermRef(d.termName));
  const retrievals: ReliedUponRetrieval[] = [];
  for (const e of input.toolCallLog) {
    const r = e.retrievedSource;
    if (!r) continue;
    retrievals.push({ requestKind: r.requestKind, requestKey: r.requestKey, documentId: r.documentId, sourceNodeId: r.sourceNodeId, contentHash: r.contentHash, textOrigin: r.textOrigin });
    if (r.requestKind === "DEFINITION") attributedTerms.add(normalizeDefinedTermRef(r.requestKey));
    else attributedRefs.add(normalizeSectionRef(r.requestKey));
  }
  retrievals.sort((a, b) => (canonicalJson(a) < canonicalJson(b) ? -1 : 1));
  const unattributedTerms = terms.filter((t) => !attributedTerms.has(t));
  const unattributedSectionRefs = sectionRefs.filter((r) => !attributedRefs.has(r));

  const attributionMode: ContextAttributionMode = !input.bundle ? "NO_BUNDLE" : unattributedTerms.length === 0 && unattributedSectionRefs.length === 0 ? "RELIED_UPON" : "BROAD_BUNDLE";
  const contextItems: ReliedUponContextItem[] = [...relied.values()]
    .map((it) => ({ itemId: it.itemId, type: it.type, documentId: it.documentId, normalizedRef: it.normalizedRef, excerptSha256: sha256Hex(it.excerptText), evidenceStatus: it.evidenceState?.status ?? null }))
    .sort((a, b) => (a.itemId < b.itemId ? -1 : a.itemId > b.itemId ? 1 : 0));
  const contextDependencyHash = sha256Hex(canonicalJson(contextItems));
  const retrievalHash = sha256Hex(canonicalJson(retrievals));
  const lineageHash = sha256Hex(canonicalJson({
    operativeLineage: input.operativeLineage ? { provisionKey: input.operativeLineage.provisionKey, operativeStatus: input.operativeLineage.operativeStatus, currentSourceDocumentId: input.operativeLineage.currentSourceDocumentId, asOfDate: input.operativeLineage.asOfDate } : null,
    appliedEffectIds: [...input.appliedEffectIds].sort(),
    supersessionStatus: input.bundle?.originatingSupersessionStatus ?? null,
  }));
  const bundleContentIdentity = attributionMode === "BROAD_BUNDLE" ? input.bundle!.contentIdentity : null;
  const components = { operativeSourceVersion: input.operativeSourceVersion, contextDependencyHash, retrievalHash, lineageHash, asOfDate: input.asOfDate, bundleContentIdentity };
  const version = `${SEMANTIC_SOURCE_CONTRACT_PREFIX}:${sha256Hex(canonicalJson({ ...components, attributionMode }))}`;
  const strength: IdentityStrength = input.operativeIdentityStrength === "STRONG" && attributionMode !== "NO_BUNDLE" ? "STRONG" : "WEAK";
  return { version, strength, attributionMode, reliedUpon: { definedTerms: terms, sectionRefs, contextItems, retrievals, unattributedTerms, unattributedSectionRefs }, components };
}
