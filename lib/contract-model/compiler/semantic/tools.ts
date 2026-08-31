/**
 * Phase 3B - controlled, bounded, source-backed evidence tools (task §6/§7).
 * Every tool here is a thin, read-only wrapper over a REAL, already-built
 * Phase 2 API (structural-index.ts, amendment/operative-state.ts,
 * package-graph/types.ts, context-retrieval's own CovenantContextBundle) -
 * none invents a new retrieval mechanism. No tool ever exposes raw DB/query
 * access (task §6's own explicit prohibition): every tool's surface is a
 * narrow, named function over an already-computed, in-memory structure.
 *
 * Cross-instrument isolation (task §61) is enforced HERE, not left to the
 * model's good behavior: any tool that accepts a documentId only serves
 * documents belonging to the SAME instrument as the compilation input
 * (via getInstrumentDocuments()'s own real package-graph grouping,
 * falling back to "this document only" when no package graph exists) -
 * a request naming a foreign document is refused with an honest reason,
 * never silently served.
 */
import type { NodeSupersessionIndex, NodeSupersessionStatus, OperativeProvisionView, OperativeStateStatus } from "../amendment/types";
import type { StructuralNode } from "../types";
import { buildNodeSupersessionIndex, getNodeSupersessionStatus, isConfirmedCurrentOperativeEvidence, normalizeDefinedTermRef, resolveOperativeDefinitionEvidence } from "../amendment/operative-state";
import type { ContextItem } from "../context-retrieval/types";
import type { SemanticToolAccess, ToolBudget, ToolCallLogEntry } from "./types";

export interface ToolExecutionOutcome {
  ok: boolean;
  /** JSON-serializable payload handed back to the model as the tool_result content. */
  result: unknown;
  charsReturned: number;
  outputSummary: string;
  /**
   * Phase 3F.1.6-terminal Part A (OPEN-2 / BLOCKER-5 / BLOCKER-6) - set true
   * ONLY when this call's own returned evidence could not be confirmed as
   * current operative truth (a real, on-file amendment conflict/partial/
   * ambiguous-target state, or a base-document occurrence independently
   * known-superseded) - never set for a refusal (there is no evidence to
   * mistrust) and never set for a tool whose evidence WAS confirmed
   * current. Copied verbatim onto this call's ToolCallLogEntry by
   * ToolRunner.run below; a semantic compiler/verifier that produced
   * candidate IR from a call carrying this flag must never let that alone
   * justify a VERIFIED/current-truth downstream determination - see
   * semantic/compile.ts's own failureReasons wiring and
   * semantic-verification/verify.ts's own determineStatus for where this is
   * enforced.
   */
  evidenceUnresolved?: boolean;
}

/**
 * Phase 3F.1.6.R BLOCKER-5 fix - a MANDATORY, statically-enforced (TypeScript
 * will not compile a ToolDefinition object literal missing this field)
 * self-classification for every LLM-facing evidence tool, so a future new
 * tool can never silently reintroduce SUPER-5's bypass (a tool that reads
 * `access.structuralIndex` directly and never consults operative state, nor
 * discloses that it is deliberately historical). Exactly one of:
 *   - CURRENT_OPERATIVE_EVIDENCE: this tool's own returned text is resolved
 *     against `access.operativeState` (directly, or via the shared
 *     `resolveNodeWithSupersessionAwareness`/`getNodeSupersessionStatus`
 *     helpers below) before being served as fact.
 *   - HISTORICAL_EVIDENCE_WITH_STATUS: this tool is INTENTIONALLY a raw/
 *     historical-text tool (its whole purpose is the literal as-drafted or
 *     pre-amendment text of one specific occurrence) - its own description
 *     and every returned payload explicitly label the content as such
 *     (e.g. a `supersededBy`/`supersessionStatus` field), so it can never be
 *     reasonably mistaken for a claim of current operative status.
 *   - NOT_CONTRACT_TEXT_EVIDENCE: this tool never returns independently
 *     interpretable provision/economic TEXT at all - only topology
 *     (document lists), graph metadata (edges/dependency term NAMES), or an
 *     already-vetted echo of a context-bundle item Phase 2D already
 *     classified (and already disclosed, per SUPER-4) - so operative-state
 *     re-verification does not apply to it.
 * See tests/contract-model/semantic-tools-operative-state-discipline.test.ts
 * for the permanent enforcement test that iterates every registered tool
 * and rejects any missing/unrecognized value.
 */
export type ToolOperativeStateDiscipline = "CURRENT_OPERATIVE_EVIDENCE" | "HISTORICAL_EVIDENCE_WITH_STATUS" | "NOT_CONTRACT_TEXT_EVIDENCE";

export interface ToolDefinition {
  name: string;
  description: string;
  /** Anthropic Tool.input_schema-compatible JSON Schema (hand-written, deliberately simple - every tool takes at most a couple of string params, task §6's own "exact tool names are an engineering choice" gives latitude here, not a reason to over-engineer). */
  inputSchema: { type: "object"; properties: Record<string, { type: string; description?: string }>; required: string[] };
  execute: (input: Record<string, unknown>) => ToolExecutionOutcome;
  operativeStateDiscipline: ToolOperativeStateDiscipline;
}

const MAX_TEXT_RESULT_CHARS = 4000;

function truncate(text: string): { text: string; truncated: boolean } {
  if (text.length <= MAX_TEXT_RESULT_CHARS) return { text, truncated: false };
  return { text: text.slice(0, MAX_TEXT_RESULT_CHARS) + "\n... (truncated - request a narrower span if you need more)", truncated: true };
}

function refuse(reason: string): ToolExecutionOutcome {
  return { ok: false, result: { error: reason }, charsReturned: reason.length, outputSummary: `refused: ${reason}` };
}

function ok(result: unknown, text: string, summary: string): ToolExecutionOutcome {
  return { ok: true, result, charsReturned: text.length, outputSummary: summary };
}

/** The set of documentIds this compilation is allowed to touch - the compiler's own home document, plus every sibling document Phase 2C's package-graph groups into the SAME instrument. Falls back to "home document only" when no package graph exists (task §61's own conservative default - never widen scope in the absence of evidence). */
function allowedDocumentIds(access: SemanticToolAccess, homeDocumentId: string): Set<string> {
  const instrument = access.packageGraph?.instruments.find((i) => i.documentIds.includes(homeDocumentId));
  return new Set(instrument ? instrument.documentIds : [homeDocumentId]);
}

/**
 * Phase 3F.1.5.R (sub-task 1, P0-2 family) - `getDefinitionFullText`'s own
 * `documentId` fallback used to be a documentId-LESS call
 * (`getDefinitionFullText(term)`, searching the ENTIRE structural index -
 * every instrument, every company's documents this process has ever
 * indexed) whenever the home document had no match. That is the same
 * cross-document contamination class as P0-2 (docs/foundation-remediation/
 * 02-identity-isolation-remediation.json): a same-named term defined in a
 * wholly unrelated instrument could silently be served as this
 * compilation's own answer.
 *
 * The safe replacement mirrors operative-state.ts's own P0-2 fix (no
 * unscoped fallback) but is not IDENTICAL to it, because this file already
 * has its own real, narrower, and already-enforced scope concept for
 * exactly this purpose: `allowedDocs`, the SAME instrument's sibling
 * documents (see `allowedDocumentIds` above / this file's own header
 * comment on cross-instrument isolation, task §61). A sibling document of
 * the SAME instrument (e.g. the base credit agreement's own definitions,
 * consulted while compiling a covenant from an amendment to it) is a
 * legitimate, evidence-based, already-modeled place to look; a document
 * from a different instrument or company never is. So the fallback here is
 * an EXPLICIT loop over `allowedDocs` only - never the unscoped
 * documentId-less call the index itself still exposes for other, already-
 * single-document callers.
 */
function getScopedDefinitionFullText(index: SemanticToolAccess["structuralIndex"], term: string, homeDocumentId: string, allowedDocs: Set<string>): string | undefined {
  const home = index.getDefinitionFullText(term, homeDocumentId);
  if (home) return home;
  for (const docId of allowedDocs) {
    if (docId === homeDocumentId) continue;
    const text = index.getDefinitionFullText(term, docId);
    if (text) return text;
  }
  return undefined;
}

function summarizeItem(item: ContextItem): unknown {
  return { itemId: item.itemId, type: item.type, documentId: item.documentId, sourceCitation: item.sourceCitation, excerptText: item.excerptText, reason: item.reason };
}

/**
 * Phase 3F.1.6.RX Workstream B (BLOCKER-5 real-behavior remediation).
 *
 * ROOT CAUSE (independent runtime trace): getContextBundleComponent and
 * getSharedCapContext were classified NOT_CONTRACT_TEXT_EVIDENCE on the
 * stated rationale that they "echo an already-vetted CovenantContextBundle
 * item." Reading context-retrieval/pipeline.ts end to end (zero references
 * to operativeState/supersession anywhere in that module, confirmed by
 * direct grep) shows this is false: Phase 2D's own retrieval
 * (retrieveOperativeSource/retrieveParentScope/retrieveChildRules/
 * retrieveSiblingContext, structural-context.ts) reads every item's own
 * excerptText via raw `StructuralIndex.getNodeText`, with NO operative-
 * state or supersession check of any kind - "already-vetted" was never
 * actually true for the per-item text these two tools hand back, only for
 * the item's own relevance/provenance metadata (why it was retrieved),
 * which is a different question. Both tools DO return independently-
 * interpretable provision/economic excerptText - exactly what
 * ToolOperativeStateDiscipline exists to police - so NOT_CONTRACT_TEXT_
 * EVIDENCE was the wrong classification.
 *
 * Fix mirrors getSourceSpan's own established pattern (disclosure, not
 * substitution - a context-bundle echo must return exactly what the
 * bundle actually holds, never a different, silently-substituted text):
 * every returned item now carries a real per-item supersessionStatus/
 * supersessionReason, computed via the SAME supersessionIndex
 * buildToolSet already builds once per compilation attempt - no new
 * import, no second computation. An item with no structuralNodeId (a
 * DEFINITION/DEFINITION_DEPENDENCY item, which is anchored by defined-term
 * name rather than a StructuralNode) resolves UNKNOWN_SUPERSESSION_STATUS
 * via getNodeSupersessionStatus's own fail-closed "no nodeId supplied"
 * branch - never guessed as CURRENT_OPERATIVE.
 */
function summarizeItemWithSupersession(supersessionIndex: NodeSupersessionIndex, item: ContextItem): unknown {
  const result = getNodeSupersessionStatus(supersessionIndex, item.documentId, item.structuralNodeId);
  return { ...(summarizeItem(item) as Record<string, unknown>), supersessionStatus: result.status, supersessionReason: result.reason };
}

/**
 * Phase 3F.1.6-terminal Part A (OPEN-2 / BLOCKER-5 / BLOCKER-6) root-cause
 * fix: the DEFINITION-side comparison here used to collapse only
 * leading/trailing whitespace (`ref.trim().toLowerCase()`), unlike its
 * SECTION-side sibling on the line below (full `.replace(/\s+/g, "")` on
 * both sides) and unlike `normalizeDefinedTermRef` - the exact function
 * already used to STORE `p.definedTermRef` in the first place
 * (chain.ts's provisionKeyFor). A queried term with irregular INTERNAL
 * whitespace (a doubled space, a tab, a line-wrap remnant - all realistic
 * artifacts of an LLM echoing a term name read from real, often
 * OCR'd/line-wrapped contract text) silently missed a real, on-file
 * OperativeProvisionView here, independent of getDefinition's own now-fixed
 * use of `getOperativeDefinition` (which already normalized correctly) -
 * this helper is also called directly by getRelatedAmendments/
 * getPriorVersion/resolveNodeWithSupersessionAwareness/getOperativeProvision
 * with a caller-supplied `ref` that can be a defined-term name, so fixing it
 * here closes the same gap for every one of those callers, not merely the
 * one reproduction.
 */
function findProvisionView(operativeState: OperativeProvisionView[] | undefined, ref: string): OperativeProvisionView | undefined {
  const normalizedSection = ref.replace(/\s+/g, "");
  const normalizedTerm = normalizeDefinedTermRef(ref);
  // Both sides normalized at the comparison site (never trusting
  // definedTermRef was already stored in exactly normalizeDefinedTermRef's
  // own shape) - production's buildProvisionView always does store it
  // pre-normalized, but several already-established test fixtures across
  // this codebase hand-build an OperativeProvisionView with the term's
  // original casing, exactly like the SECTION-side comparison here already
  // treats stored sectionRef defensively rather than assuming a shape.
  return operativeState?.find((p) => (p.sectionRef ?? "").replace(/\s+/g, "") === normalizedSection || normalizeDefinedTermRef(p.definedTermRef ?? "") === normalizedTerm);
}

/**
 * HEADROOM OPEN-2 TERMINAL (Part A) - CONFIRMED ROOT CAUSE FIX.
 *
 * CONFIRMED DEFECT (independently reproduced pre-fix in
 * tests/certification/open-2-recert-independent-fresh.test.ts's own section
 * 4, and see docs/open2-terminal-trust-correction/01-root-cause-code-audit.json
 * for the full trace): the OLD implementation gated its ENTIRE trust
 * determination on whether `view.currentText` happened to be non-null. When
 * a real, on-file `OperativeProvisionView` existed for this section but its
 * own aggregate `view.status` was CONFLICTED/PARTIAL/REVIEW_REQUIRED (all of
 * which `buildProvisionView` correctly nulls `currentText` for - a producer
 * behavior that is correct and untouched here), the OLD code discarded
 * `view.status` entirely and fell through to a raw per-PHYSICAL-NODE
 * `getNodeSupersessionStatus` check. That check answers a genuinely
 * different question (has anything ever applied OVER this exact physical
 * occurrence) and reports CURRENT_OPERATIVE for a section whose competing
 * amendments are real but simply have not applied yet as of the query date
 * (appliedChain.length === 0, so buildProvisionView's own
 * supersededSourceNodeIds - the only thing the node-level index can key off
 * - was never populated for it). A signed-but-not-yet-effective conflicting
 * amendment therefore reached this tool's own physical-node fallback with
 * ZERO record of the conflict at all.
 *
 * CORE INVARIANT (enforced below): TEXT SELECTION and TRUST SELECTION are
 * separate questions. `currentText` presence may determine WHICH TEXT is
 * served; it must never determine WHETHER that text is trustworthy.
 * Whenever a real matching `OperativeProvisionView` exists, its own
 * `view.status` participates in the trust determination UNCONDITIONALLY -
 * never silently discarded merely because `currentText` is null.
 *
 * TRUST RULE (text-source-dependent - see ResolvedNodeEvidence's own header
 * comment for the full per-textSource reasoning table, and
 * docs/open2-terminal-trust-correction/03-null-currenttext-semantics.json for
 * the exhaustive null-currentText cause-by-cause writeup):
 *   - AMENDED_CURRENT_TEXT (view.currentText is non-null - by
 *     buildProvisionView's own invariant this only ever happens when
 *     view.status === OPERATIVE_STATE_RESOLVED): evidenceCurrent = true,
 *     unconditionally. The base node's own nodeSupersessionStatus being
 *     KNOWN_SUPERSEDED here is EXPECTED and IRRELEVANT - the amended text
 *     superseding the base node is exactly the point of an amendment; it
 *     must never be AND-ed against the trust verdict for the replacement
 *     text itself.
 *   - a real view exists but currentText is null (CONFLICTED / PARTIAL /
 *     REVIEW_REQUIRED / a validly-resolved clean deletion): evidenceCurrent
 *     = false, full stop - gated on view.status alone, regardless of what
 *     getNodeSupersessionStatus reports for the underlying physical node
 *     (this is the exact line the fix lives on: the physical node's own
 *     history is a different, narrower question than the provision's real
 *     aggregate operative state, and must never substitute for it once a
 *     real view exists). A clean deletion (status RESOLVED, currentText
 *     null by buildProvisionView's own DELETE_OPERATIONS branch) is
 *     distinguished from a genuine unresolved conflict via textSource
 *     (HISTORICAL_BASE_TEXT vs BASE_DOCUMENT_TEXT) so a caller can label the
 *     served base text as historical rather than merely "unresolved" - but
 *     BOTH are evidenceCurrent: false; only serving old base text as though
 *     it were still-governing would be the actual harm.
 *   - no matching view exists at all (this section has no recorded
 *     amendment activity whatsoever - the pure node-supersession case
 *     `getNodeSupersessionStatus`/`NodeSupersessionIndex` exist for):
 *     evidenceCurrent = (nodeSupersessionStatus === "CURRENT_OPERATIVE").
 *     Unchanged from before this fix - this is the ONE case where the
 *     physical-node-history question genuinely IS the whole answer, because
 *     there is no provision-level view to ask instead.
 */
export interface ResolvedNodeEvidence {
  text: string;
  textSource: "AMENDED_CURRENT_TEXT" | "BASE_DOCUMENT_TEXT" | "HISTORICAL_BASE_TEXT";
  /** null iff no matching OperativeProvisionView exists for this section at all - the pure node-supersession case. */
  provisionOperativeStatus: OperativeStateStatus | null;
  /** The underlying physical node's own supersession verdict - always computed and always disclosed for provenance, but (per the trust rule above) NEVER the trust gate on its own once a real view exists. */
  nodeSupersessionStatus: NodeSupersessionStatus;
  /** The ONE boolean a caller may gate `evidenceUnresolved` on. */
  evidenceCurrent: boolean;
  /** Always populated when evidenceCurrent is false - explains why, mirroring every other disclosure-quality reason string in this codebase (targetResolutionReason, NodeSupersessionResult.reason). Empty when evidenceCurrent is true. */
  unresolvedReasons: string[];
}

function resolveNodeWithSupersessionAwareness(access: SemanticToolAccess, supersessionIndex: NodeSupersessionIndex, node: StructuralNode): ResolvedNodeEvidence {
  const view = findProvisionView(access.operativeState?.provisions, node.sectionRef);
  const nodeSupersession = getNodeSupersessionStatus(supersessionIndex, node.documentId, node.nodeId);

  if (view) {
    if (view.currentText !== null && view.currentText !== undefined) {
      // A real, resolved amended replacement. Per buildProvisionView's own
      // invariant this only happens when view.status is RESOLVED - the base
      // node's own (very likely KNOWN_SUPERSEDED, which is expected and
      // correct) supersession record is irrelevant to trusting THIS text.
      return { text: view.currentText, textSource: "AMENDED_CURRENT_TEXT", provisionOperativeStatus: view.status, nodeSupersessionStatus: nodeSupersession.status, evidenceCurrent: true, unresolvedReasons: [] };
    }
    // currentText is null. THE FIX: view.status gates this unconditionally -
    // never the physical node's own (possibly-stale-for-this-purpose)
    // nodeSupersessionStatus. Distinguish a validly-resolved clean deletion
    // (status RESOLVED despite null currentText - see buildProvisionView's
    // own DELETE_OPERATIONS branch and lastAppliedWasCleanDeletion) from a
    // genuine unresolved conflict/partial/review-required state, per the
    // null-currentText reasoning table (docs/open2-terminal-trust-
    // correction/03-null-currenttext-semantics.json) - but BOTH are
    // evidenceCurrent: false.
    const raw = access.structuralIndex.getNodeText(node.nodeId, "OWN");
    const isCleanDeletion = view.status === "OPERATIVE_STATE_RESOLVED";
    const unresolvedReasons = isCleanDeletion
      ? [`This provision was validly deleted by a resolved amendment as of the analysis date - the base document's original text is shown here for historical reference only and must never be treated as current operative text, even though the provision's own aggregate operative state is itself resolved.`]
      : [
          `This section's own real amendment history is not confidently resolved (operative status ${view.status}) - the base document's text shown here must not be treated as confirmed-current, regardless of this physical node's own supersession record (${nodeSupersession.status}).`,
          ...view.unresolvedIssues,
        ];
    return { text: raw, textSource: isCleanDeletion ? "HISTORICAL_BASE_TEXT" : "BASE_DOCUMENT_TEXT", provisionOperativeStatus: view.status, nodeSupersessionStatus: nodeSupersession.status, evidenceCurrent: false, unresolvedReasons };
  }

  // No matching OperativeProvisionView exists for this section at all - the
  // pure node-supersession case getNodeSupersessionStatus/NodeSupersessionIndex
  // exist for. This branch is unchanged by this fix.
  const raw = access.structuralIndex.getNodeText(node.nodeId, "OWN");
  const evidenceCurrent = nodeSupersession.status === "CURRENT_OPERATIVE";
  return { text: raw, textSource: "BASE_DOCUMENT_TEXT", provisionOperativeStatus: null, nodeSupersessionStatus: nodeSupersession.status, evidenceCurrent, unresolvedReasons: evidenceCurrent ? [] : [nodeSupersession.reason] };
}

/**
 * getChildren's OWN trust check - deliberately NOT a call to
 * resolveNodeWithSupersessionAwareness above (per this fix's own design
 * note: getChildren has "its own separate, structurally different
 * parentSupersession check"). resolveNodeWithSupersessionAwareness answers
 * "is the TEXT I'm about to serve for this section trustworthy," and for a
 * fully-resolved amended replacement legitimately ignores the base node's
 * own supersession record - the amendment superseding it IS the point.
 * getChildren answers a different question: "does THIS PHYSICAL node's own
 * child listing still accurately represent the section's CURRENT
 * substructure." Those two questions diverge in exactly one real case: a
 * section with a real, fully-resolved amended currentText (view.status ===
 * OPERATIVE_STATE_RESOLVED, view.currentText non-null) - the TEXT is
 * trustworthy, but the OLD physical node's own children are NOT reliable
 * evidence of the amended text's real substructure (an amendment
 * substituting an entire section's text is never assumed to preserve its
 * old lettered sub-clause layout) - by that point buildProvisionView's own
 * loop has already pushed the original node into supersededSourceNodeIds,
 * so nodeSupersessionStatus alone (KNOWN_SUPERSEDED) already correctly
 * disqualifies it, exactly like the pre-fix code already did for this one
 * case. So this check requires BOTH: nodeSupersessionStatus ===
 * CURRENT_OPERATIVE (this physical node was never itself replaced) AND (no
 * matching view exists at all, OR the matching view's own status is
 * OPERATIVE_STATE_RESOLVED). The second conjunct is the actual OPEN-2
 * TERMINAL fix for this tool: a real, on-file but not-yet-applied
 * CONFLICTED/PARTIAL/REVIEW_REQUIRED view for this exact section must gate
 * this trust verdict too - never only "has something already physically
 * superseded this node," which (per the confirmed root cause) says nothing
 * about a conflict that has not applied yet.
 */
function resolveParentSubstructureEvidence(access: SemanticToolAccess, supersessionIndex: NodeSupersessionIndex, node: StructuralNode): { evidenceCurrent: boolean; nodeSupersessionStatus: NodeSupersessionStatus; reason: string } {
  const view = findProvisionView(access.operativeState?.provisions, node.sectionRef);
  const nodeSupersession = getNodeSupersessionStatus(supersessionIndex, node.documentId, node.nodeId);
  const viewBlocksTrust = view !== undefined && view.status !== "OPERATIVE_STATE_RESOLVED";
  const evidenceCurrent = nodeSupersession.status === "CURRENT_OPERATIVE" && !viewBlocksTrust;
  if (evidenceCurrent) {
    return { evidenceCurrent, nodeSupersessionStatus: nodeSupersession.status, reason: nodeSupersession.reason };
  }
  if (viewBlocksTrust) {
    return {
      evidenceCurrent,
      nodeSupersessionStatus: nodeSupersession.status,
      reason: `This section's own real amendment history is not confidently resolved (operative status ${view!.status}) - its child listing cannot be confirmed to reflect the section's current substructure, regardless of this physical node's own supersession record (${nodeSupersession.status}).`,
    };
  }
  return { evidenceCurrent, nodeSupersessionStatus: nodeSupersession.status, reason: nodeSupersession.reason };
}

/**
 * Maps a ResolvedNodeEvidence back to the pre-existing
 * `{supersessionStatus, supersessionReason}` wire shape every tool's JSON
 * payload already commits callers to (this file's own established
 * disclosure convention, unchanged by this fix) - display only, never the
 * trust gate itself (`resolved.evidenceCurrent` is). CURRENT_OPERATIVE iff
 * evidenceCurrent; otherwise KNOWN_SUPERSEDED when the underlying physical
 * node itself independently carries that record, else
 * UNKNOWN_SUPERSESSION_STATUS - never CURRENT_OPERATIVE merely because the
 * physical node's own history happens to look clean (the exact bug this fix
 * closes).
 */
function legacySupersessionDisplay(resolved: ResolvedNodeEvidence): { supersessionStatus: NodeSupersessionStatus; supersessionReason: string } {
  if (resolved.evidenceCurrent) {
    return { supersessionStatus: "CURRENT_OPERATIVE", supersessionReason: resolved.provisionOperativeStatus ? `resolved against this section's own real amendment history (operative status ${resolved.provisionOperativeStatus})` : "No recorded amendment effect supersedes this physical occurrence as of the analysis date the supplied operative state was computed for." };
  }
  const supersessionStatus: NodeSupersessionStatus = resolved.nodeSupersessionStatus === "KNOWN_SUPERSEDED" ? "KNOWN_SUPERSEDED" : "UNKNOWN_SUPERSESSION_STATUS";
  return { supersessionStatus, supersessionReason: resolved.unresolvedReasons.join(" ") || "not confirmed as current operative evidence" };
}

/**
 * Builds the bounded tool set for ONE compilation attempt. `homeDocumentId`/
 * `homeInstrumentKey` scope every tool's cross-instrument check; `charsUsed`
 * is a mutable counter the caller (caller.ts) uses to enforce
 * ToolBudget.maxAdditionalSourceChars across the WHOLE attempt, not per-call.
 */
export function buildToolSet(access: SemanticToolAccess, homeDocumentId: string, charsUsedRef: { current: number }, budget: ToolBudget): ToolDefinition[] {
  const allowedDocs = allowedDocumentIds(access, homeDocumentId);
  const remainingBudget = () => budget.maxAdditionalSourceChars - charsUsedRef.current;
  // Phase 3F.1.6.R BLOCKER-5 fix - built once per compilation attempt
  // (never per tool call) from the SAME access.operativeState every
  // already-safe tool in this file reads; homeDocumentId is used as the
  // supersession index's own baseDocumentId (mirroring how every other
  // cross-instrument check in this file already treats homeDocumentId as
  // this attempt's own anchor). Empty operativeState correctly produces an
  // index that marks every node UNKNOWN_SUPERSESSION_STATUS (fail-closed
  // default), never CURRENT_OPERATIVE by omission.
  const supersessionIndex: NodeSupersessionIndex = buildNodeSupersessionIndex(access.operativeState ? [{ baseDocumentId: homeDocumentId, state: access.operativeState }] : []);

  const guardBudget = (): string | null => (remainingBudget() <= 0 ? `additional-source character budget (${budget.maxAdditionalSourceChars}) already exhausted for this compilation attempt - no further tool evidence can be returned` : null);

  return [
    {
      name: "getOperativeProvision",
      description: "Get the CURRENT operative text of a section (post-amendment where applicable) by its section reference (e.g. '6.10(a)'). Use this when you need a provision's real, up-to-date text that was not already included in your initial context. Check the returned `status` field before treating the text as confidently current: this tool never silently substitutes a confident answer for a section with a real, on-file amendment conflict/ambiguity.",
      inputSchema: { type: "object", properties: { sectionRef: { type: "string", description: "e.g. '6.10(a)'" } }, required: ["sectionRef"] },
      operativeStateDiscipline: "CURRENT_OPERATIVE_EVIDENCE",
      /**
       * HEADROOM OPEN-2 (universal evidence-trust invariant) root-cause fix.
       * CONFIRMED DEFECT: this execute() body used to return `view.status`
       * (and the raw base-document fallback's own hardcoded
       * "OPERATIVE_STATE_RESOLVED") in the response PAYLOAD only - never
       * translating it into `outcome.evidenceUnresolved`, unlike its own
       * sibling getDefinition below (`outcome.evidenceUnresolved =
       * !resolution.isCurrentTruth`). A genuinely OPERATIVE_STATE_CONFLICTED
       * section reached only via this tool's own call path (never in the
       * pre-loaded context bundle) could therefore reach a persisted
       * SemanticTruthRecord.trustStatus of VERIFIED, because "OPERATIVE_STATE_
       * CONFLICTED" is metadata inside the model-readable payload, not the
       * machine-readable flag compile.ts/verify.ts actually gate on - see
       * tests/certification/part-b-final-recert-fix2-independent.test.ts.
       *
       * FIX: both branches now derive `evidenceUnresolved` from the SAME
       * shared helper (`isConfirmedCurrentOperativeEvidence`,
       * amendment/operative-state.ts) getParentClause/getSiblingClauses/
       * getReferencedProvision/getRelatedAmendments below all now also use -
       * never a second, independent judgment call per tool.
       *
       * SECOND, INDEPENDENTLY-FOUND GAP (same audit): the raw base-document
       * fallback branch (no OperativeProvisionView for this section at all)
       * never consulted `supersessionIndex`, unlike getDefinition's own
       * equivalent fallback (resolveOperativeDefinitionEvidence's Branch 2)
       * and unlike this file's own resolveNodeWithSupersessionAwareness used
       * by every other section-reading tool - a section resolved via the raw
       * fallback whose physical occurrence is independently known-superseded
       * (e.g. its enclosing chapter was restated) was reported
       * "OPERATIVE_STATE_RESOLVED" with no supersession check at all. Fixed
       * by consulting supersessionIndex here too, mirroring getDefinition's
       * KNOWN_SUPERSEDED -> legacyStatus OPERATIVE_STATE_PARTIAL convention.
       */
      execute: (input) => {
        const budgetErr = guardBudget();
        if (budgetErr) return refuse(budgetErr);
        const sectionRef = String(input.sectionRef ?? "");
        const view = findProvisionView(access.operativeState?.provisions, sectionRef);
        if (view) {
          const { text, truncated } = truncate(view.currentText ?? "(no current text recorded)");
          charsUsedRef.current += text.length;
          const outcome = ok({ sectionRef, status: view.status, currentText: text, truncated, unresolvedIssues: view.unresolvedIssues }, text, `operative provision ${sectionRef} (status ${view.status})`);
          // Never fabricated for a refusal; set here, unconditionally,
          // whenever real evidence IS returned but the provision's own
          // aggregate status is not confidently current (see
          // ToolExecutionOutcome's own header comment above).
          outcome.evidenceUnresolved = !isConfirmedCurrentOperativeEvidence(view.status);
          return outcome;
        }
        // Phase 3F.1.2 (task §15, critical safety fix): a legal-reference
        // lookup can legitimately match more than one physical structural
        // occurrence (a cross-reference sentence, a table-of-contents
        // entry, duplicate/malformed section numbering). The pre-3F.1.2
        // getNodeByRef silently returned an arbitrary one with the SAME
        // full-confidence framing as a genuinely unique match - the model
        // had no way to know it might be reading the wrong physical text.
        // resolveUniqueNodeByRef makes that distinction explicit: only a
        // UNIQUE resolution is served as evidence; AMBIGUOUS is refused
        // with the honest reason and candidate count, never guessed.
        const resolution = access.structuralIndex.resolveUniqueNodeByRef(homeDocumentId, sectionRef);
        if (resolution.status === "NOT_FOUND") return refuse(`no section "${sectionRef}" found in this instrument's documents, and it has no recorded amendment history`);
        if (resolution.status === "AMBIGUOUS") return refuse(`section reference "${sectionRef}" matches ${resolution.candidates.length} distinct physical locations in this document (e.g. a cross-reference mention and the section's real header can share the same number) - cannot serve this as uniquely-resolved evidence; try getReferencedProvision with a fromNodeId for a context-scoped resolution, or narrow the reference`);
        const node = resolution.node;
        const { text, truncated } = truncate(access.structuralIndex.getNodeText(node.nodeId, "OWN"));
        charsUsedRef.current += text.length;
        const supersession = getNodeSupersessionStatus(supersessionIndex, node.documentId, node.nodeId);
        const status = supersession.status === "KNOWN_SUPERSEDED" ? "OPERATIVE_STATE_PARTIAL" : "OPERATIVE_STATE_RESOLVED";
        const unresolvedIssues = supersession.status === "KNOWN_SUPERSEDED" ? [supersession.reason] : [];
        const outcome = ok(
          { sectionRef, status, currentText: text, truncated, unresolvedIssues, supersessionStatus: supersession.status, supersessionReason: supersession.reason },
          text,
          `base-document provision ${sectionRef} (never individually amended, ${supersession.status})`
        );
        outcome.evidenceUnresolved = !isConfirmedCurrentOperativeEvidence(supersession.status);
        return outcome;
      },
    },
    {
      name: "getDefinition",
      description: "Get the full definition text of a defined term by exact name (e.g. 'Consolidated EBITDA'). Use this only when the term is material to the covenant you are compiling and its meaning was not already included in your initial context. Check the returned `status` field before treating the text as confidently current: this tool never silently substitutes a confident answer for a term with a real, on-file amendment ambiguity, and refuses outright when the base document itself has more than one colliding definition of the term.",
      inputSchema: { type: "object", properties: { term: { type: "string" } }, required: ["term"] },
      operativeStateDiscipline: "CURRENT_OPERATIVE_EVIDENCE",
      /**
       * Phase 3F.1.6.RX-FINAL Workstream B (FINDING-2/FINDING-3 fix, root
       * cause independently found by Part B recert doc 24's own task5/
       * task4.blocker6). ROOT CAUSE (fixed here): this execute() body used
       * to gate its ENTIRE amended-text branch on `operative?.currentText`
       * being truthy, so a real, on-file OperativeProvisionView for this
       * exact term whose `currentText` is honestly null (buildProvisionView
       * sets this whenever targetResolutionStatus !== "UNIQUE" - e.g. a
       * real AMBIGUOUS/PARTIAL DEFINITION amendment, operative-state.ts's
       * own rule) fell straight through to the RAW base-document text via
       * getScopedDefinitionFullText, labeled only `source: "base-document"`
       * - textually indistinguishable from a term that was NEVER amended
       * at all. Its own SECTION-kind sibling `getOperativeProvision` above
       * never had this gap: it discloses `view.status` unconditionally
       * whenever a view exists, in BOTH its "found" and "raw fallback"
       * branches.
       *
       * FIX: reuses that SAME discipline verbatim rather than inventing a
       * second, parallel mechanism - `operative.status` (and
       * `unresolvedIssues`) are now disclosed unconditionally whenever a
       * view exists, exactly mirroring getOperativeProvision's own "found"
       * branch; `currentText ?? "(no current text recorded)"` is the
       * IDENTICAL placeholder getOperativeProvision already uses for the
       * same null case (never invents a different one). This also closes
       * BLOCKER-6's own coupled bypass (24's own task4.blocker6_
       * ambiguousDefinitionAmendment finding): an ambiguous DEFINITION
       * amendment can no longer reach this tool's caller as though settled.
       *
       * SECOND, INDEPENDENTLY-FOUND GAP (same audit trace, "Multiple
       * candidate definition occurrences" per this phase's own required
       * invariant): the NO-recorded-amendment fallback below used to call
       * `getScopedDefinitionFullText`, which resolves via
       * `StructuralIndex.getDefinitionFullText`'s own `.find()` - silently
       * the FIRST match whenever a document genuinely has 2+ colliding
       * physical definitions of the same term (a real, never-amended
       * drafting collision - no amendment involved at all, so
       * `access.operativeState` has no view to consult). Fixed by routing
       * this fallback through `resolveUniqueDefinitionByRef`
       * (amendment/operative-state.ts) - the SAME primitive that module
       * already builds and relies on internally for exactly this
       * uniqueness question when resolving an amendment's own base
       * reference - mirroring getOperativeProvision's own
       * `resolveUniqueNodeByRef` call in ITS raw-fallback branch. An
       * AMBIGUOUS result is refused with an honest reason and candidate
       * count, never guessed.
       *
       * Phase 3F.1.6-terminal Part A (OPEN-2 recertification, docs/
       * phase-3f1-6-rx-final-terminal-closure/15-part-b-finding2-3-
       * recertification.json) - STILL_OPEN THIRD GAP found in the fix
       * above: the "operative view lookup" step used the SHARED
       * `findProvisionView` helper, whose DEFINITION-branch comparison only
       * collapsed leading/trailing whitespace (`ref.trim().toLowerCase()`),
       * unlike its own SECTION-side sibling on the same line and unlike
       * `normalizeDefinedTermRef` (the exact function already used to STORE
       * `definedTermRef` in the first place). A query term with irregular
       * INTERNAL whitespace (a doubled space, a tab, a line-wrap remnant)
       * silently missed a real, on-file view and fell through to the
       * base-document fallback, re-serving stale text as
       * OPERATIVE_STATE_RESOLVED for exactly the two operative-state
       * classes the fallback's own ambiguity check cannot independently
       * re-catch (CONFLICTED; PARTIAL via a governing effect with no
       * capturable text) - a verbatim recurrence of the defect this same
       * fix block was meant to close.
       *
       * FIXED HERE by routing both branches through the single canonical
       * `resolveOperativeDefinitionEvidence` (amendment/operative-state.ts)
       * instead of maintaining a second, parallel definition-access
       * discipline in this file: it looks up the operative view via
       * `getOperativeDefinition`, which ALREADY normalizes both sides with
       * `normalizeDefinedTermRef` (never findProvisionView's looser
       * comparison), and it independently checks the base-document
       * fallback's own resolved physical occurrence against this
       * compilation's real NodeSupersessionIndex (a definition can be
       * known-superseded - e.g. its enclosing section was independently
       * replaced - even when never individually targeted by a
       * DEFINITION-kind amendment effect; the pre-fix fallback never
       * checked this at all, unlike every SECTION-reading tool in this file
       * via resolveNodeWithSupersessionAwareness). `legacyStatus`
       * preserves the exact pre-existing OPERATIVE_STATE_RESOLVED/PARTIAL/
       * CONFLICTED/REVIEW_REQUIRED vocabulary this tool's own `status`
       * field already committed callers to; `evidenceStatus`/
       * `isCurrentTruth` are the new, richer disclosure this phase adds -
       * see resolveOperativeDefinitionEvidence's own header comment for the
       * full 6-value taxonomy.
       */
      execute: (input) => {
        const budgetErr = guardBudget();
        if (budgetErr) return refuse(budgetErr);
        const term = String(input.term ?? "");
        const searchDocumentIds = [homeDocumentId, ...Array.from(allowedDocs).filter((d) => d !== homeDocumentId)];
        const resolution = resolveOperativeDefinitionEvidence({ index: access.structuralIndex, operativeState: access.operativeState, term, searchDocumentIds, supersessionIndex });

        if (resolution.outcome === "AMBIGUOUS") {
          return refuse(`${resolution.reason} - cannot serve this as uniquely-resolved evidence; try getSourceSpan on a specific candidate node, or narrow which occurrence you mean`);
        }
        if (resolution.outcome === "NOT_FOUND") {
          return refuse(resolution.reason);
        }

        const { text, truncated } = truncate(resolution.text ?? "(no current text recorded)");
        charsUsedRef.current += text.length;
        const outcome = ok(
          { term, status: resolution.legacyStatus, evidenceStatus: resolution.status, source: resolution.source, isCurrentTruth: resolution.isCurrentTruth, text, truncated, unresolvedIssues: resolution.unresolvedIssues },
          text,
          `definition "${term}" (status ${resolution.legacyStatus}, evidence ${resolution.status})`
        );
        // Never fabricated for a refusal (there is no evidence returned
        // there to mistrust) - set here, unconditionally, whenever real
        // evidence IS returned but is not confidently current, so a
        // downstream compiler/verifier can never grant VERIFIED/current-
        // truth status off this call alone (see ToolExecutionOutcome's own
        // header comment).
        outcome.evidenceUnresolved = !resolution.isCurrentTruth;
        return outcome;
      },
    },
    {
      name: "getDefinitionDependencies",
      description: "Given a defined term, list OTHER defined terms whose exact names appear inside its own definition text (a bounded, real dependency signal - not a claim of full recursive resolution). Use this before requesting each dependency's own definition individually, to know which ones actually matter.",
      inputSchema: { type: "object", properties: { term: { type: "string" } }, required: ["term"] },
      // Never returns provision/economic TEXT - only a list of OTHER
      // defined-term NAMES that appear inside the queried term's own text.
      // Not "current contract truth" evidence in the sense this fix
      // targets; operative-state re-verification does not apply.
      operativeStateDiscipline: "NOT_CONTRACT_TEXT_EVIDENCE",
      execute: (input) => {
        const term = String(input.term ?? "");
        const fullText = getScopedDefinitionFullText(access.structuralIndex, term, homeDocumentId, allowedDocs);
        if (!fullText) return refuse(`no defined term matching "${term}" found - cannot inspect its dependencies`);
        const allTerms = access.structuralIndex.allDefinitions().map((d) => d.exactTerm);
        const dependencies = Array.from(new Set(allTerms.filter((t) => t !== term && fullText.includes(t))));
        const summary = `${dependencies.length} dependency term(s) found in "${term}"'s own text`;
        return ok({ term, dependencies }, summary, summary);
      },
    },
    {
      name: "getParentClause",
      description: "Get the parent structural clause of a given node (by its nodeId, obtained from a prior tool's response) - use when a sub-clause's meaning depends on the chapeau/lead-in language of the section or clause it sits inside. The returned text prefers the section's CURRENT amended text where a recorded amendment covers it; check the returned supersessionStatus before treating it as current otherwise.",
      inputSchema: { type: "object", properties: { nodeId: { type: "string" } }, required: ["nodeId"] },
      operativeStateDiscipline: "CURRENT_OPERATIVE_EVIDENCE",
      execute: (input) => {
        const budgetErr = guardBudget();
        if (budgetErr) return refuse(budgetErr);
        const nodeId = String(input.nodeId ?? "");
        const node = access.structuralIndex.getNode(nodeId);
        if (!node || !allowedDocs.has(node.documentId)) return refuse(`nodeId "${nodeId}" is not a valid node in this instrument's documents`);
        const parent = access.structuralIndex.getParent(nodeId);
        if (!parent) return refuse(`node "${nodeId}" has no parent clause (it is a top-level node)`);
        const resolved = resolveNodeWithSupersessionAwareness(access, supersessionIndex, parent);
        const display = legacySupersessionDisplay(resolved);
        const { text, truncated } = truncate(resolved.text);
        charsUsedRef.current += text.length;
        const outcome = ok(
          { nodeId: parent.nodeId, sectionRef: parent.sectionRef, heading: parent.heading, text, truncated, supersessionStatus: display.supersessionStatus, supersessionReason: display.supersessionReason },
          text,
          `parent clause ${parent.sectionRef} (${display.supersessionStatus})`
        );
        // HEADROOM OPEN-2 TERMINAL Part A: evidenceUnresolved is now derived
        // directly from resolved.evidenceCurrent, which (unlike the pre-fix
        // supersessionStatus) is gated on the parent's own real
        // OperativeProvisionView.status whenever one exists - never silently
        // discarded merely because currentText happened to be null.
        outcome.evidenceUnresolved = !resolved.evidenceCurrent;
        return outcome;
      },
    },
    {
      name: "getChildren",
      description: "Get the direct child clauses of a given structural node (by nodeId) - use to see every lettered/numbered sub-clause of a section you are compiling. This lists the PARENT node's own structural children as originally drafted - check the returned parentSupersessionStatus; if the parent section itself has been superseded/amended, this child listing may not reflect the section's current sub-structure.",
      inputSchema: { type: "object", properties: { nodeId: { type: "string" } }, required: ["nodeId"] },
      operativeStateDiscipline: "CURRENT_OPERATIVE_EVIDENCE",
      execute: (input) => {
        const nodeId = String(input.nodeId ?? "");
        const node = access.structuralIndex.getNode(nodeId);
        if (!node || !allowedDocs.has(node.documentId)) return refuse(`nodeId "${nodeId}" is not a valid node in this instrument's documents`);
        // HEADROOM OPEN-2 TERMINAL Part A: this used to be a bare
        // getNodeSupersessionStatus(node) call - a pure physical-node check
        // that never consulted the PARENT's own real
        // OperativeProvisionView.status at all, so a parent section with a
        // real, on-file but not-yet-applied conflict/partial/review-required
        // amendment was reported CURRENT_OPERATIVE by omission merely
        // because nothing had physically superseded its node yet. Fixed via
        // resolveParentSubstructureEvidence's own (deliberately NOT
        // resolveNodeWithSupersessionAwareness - see its header comment)
        // combined check.
        const parentResolved = resolveParentSubstructureEvidence(access, supersessionIndex, node);
        const parentSupersessionStatus: NodeSupersessionStatus = parentResolved.evidenceCurrent ? "CURRENT_OPERATIVE" : parentResolved.nodeSupersessionStatus === "KNOWN_SUPERSEDED" ? "KNOWN_SUPERSEDED" : "UNKNOWN_SUPERSESSION_STATUS";
        const children = access.structuralIndex.getChildren(nodeId).map((c) => ({ nodeId: c.nodeId, sectionRef: c.sectionRef, heading: c.heading }));
        const summary = `${children.length} child clause(s) of ${node.sectionRef} (parent ${parentSupersessionStatus})`;
        const outcome = ok({ children, parentSupersessionStatus, parentSupersessionReason: parentResolved.reason }, summary, summary);
        // children[].heading is short but independently-interpretable text (a
        // heading can itself carry the economics, e.g. "$50,000,000 General
        // Basket"), and this listing's own validity depends on the PARENT
        // not having been superseded/unresolved - evidenceUnresolved is
        // derived directly from the dedicated resolver's own trust verdict.
        outcome.evidenceUnresolved = !parentResolved.evidenceCurrent;
        return outcome;
      },
    },
    {
      name: "getSiblingClauses",
      description: "Get the sibling clauses of a given structural node (by nodeId) - use when a basket's economics depend on a shared proviso or trailing cap stated in a sibling clause of the SAME section (task §16's own multi-basket-per-section case). Each sibling's text prefers its own CURRENT amended text where a recorded amendment covers it; check each sibling's own supersessionStatus before treating its text as current otherwise.",
      inputSchema: { type: "object", properties: { nodeId: { type: "string" } }, required: ["nodeId"] },
      operativeStateDiscipline: "CURRENT_OPERATIVE_EVIDENCE",
      execute: (input) => {
        const budgetErr = guardBudget();
        if (budgetErr) return refuse(budgetErr);
        const nodeId = String(input.nodeId ?? "");
        const node = access.structuralIndex.getNode(nodeId);
        if (!node || !allowedDocs.has(node.documentId)) return refuse(`nodeId "${nodeId}" is not a valid node in this instrument's documents`);
        const siblings = access.structuralIndex.getSiblings(nodeId);
        const rendered = siblings.map((s) => {
          const resolved = resolveNodeWithSupersessionAwareness(access, supersessionIndex, s);
          const display = legacySupersessionDisplay(resolved);
          const { text } = truncate(resolved.text);
          return { nodeId: s.nodeId, sectionRef: s.sectionRef, heading: s.heading, text, supersessionStatus: display.supersessionStatus, supersessionReason: display.supersessionReason, evidenceCurrent: resolved.evidenceCurrent };
        });
        charsUsedRef.current += rendered.reduce((sum, r) => sum + r.text.length, 0);
        const summary = `${siblings.length} sibling clause(s) of ${node.sectionRef}`;
        const outcome = ok({ siblings: rendered.map(({ evidenceCurrent: _ec, ...rest }) => rest) }, summary, summary);
        // HEADROOM OPEN-2 TERMINAL Part A: fails closed for the WHOLE call
        // whenever ANY sibling's own evidence is not confirmed current -
        // now derived from resolved.evidenceCurrent per sibling (gated on
        // that sibling's own real OperativeProvisionView.status whenever one
        // exists), not the pre-fix physical-node-only supersessionStatus.
        outcome.evidenceUnresolved = rendered.some((r) => !r.evidenceCurrent);
        return outcome;
      },
    },
    {
      name: "getReferencedProvision",
      description: "Resolve an explicit cross-reference (e.g. 'Section 1.07', 'clause (b) of this Section') to its real target section and text. Use this when the operative text you are compiling expressly requires reading another section to know the covenant's actual economics. The returned text prefers the section's CURRENT amended text where a recorded amendment covers it; the response's supersessionStatus field is CURRENT_OPERATIVE only when that is confirmed - treat any other value as NOT confirmed-current before relying on it for economics.",
      inputSchema: { type: "object", properties: { ref: { type: "string" }, fromNodeId: { type: "string", description: "nodeId of the clause containing the reference, for relative references like 'clause (b) of this Section' - omit for an absolute reference like 'Section 1.07'" } }, required: ["ref"] },
      operativeStateDiscipline: "CURRENT_OPERATIVE_EVIDENCE",
      execute: (input) => {
        const budgetErr = guardBudget();
        if (budgetErr) return refuse(budgetErr);
        const ref = String(input.ref ?? "");
        const fromNodeId = input.fromNodeId ? String(input.fromNodeId) : null;
        if (fromNodeId) {
          const fromNode = access.structuralIndex.getNode(fromNodeId);
          if (fromNode && allowedDocs.has(fromNode.documentId)) {
            const found = access.structuralIndex.findReferencesFrom(fromNodeId).find((r) => r.referenceText === ref || r.normalizedTarget === ref.replace(/\s+/g, ""));
            if (found?.targetAmbiguous) {
              return refuse(`reference "${ref}" (from node "${fromNodeId}") matches more than one physical location in this document - ambiguous, not resolved. Try an absolute section reference or getSourceSpan on a candidate you can otherwise identify.`);
            }
            if (found?.resolved && found.targetNodeId) {
              const targetNode = access.structuralIndex.getNode(found.targetNodeId);
              if (targetNode) {
                // Phase 3F.1.6.R BLOCKER-5 fix (SUPER-5): previously read
                // raw structural text unconditionally, with no
                // operative-state check at all, despite this tool's own
                // description telling the model to trust it for "the
                // covenant's actual economics." Now routed through the
                // same supersession-aware access path getOperativeProvision
                // already uses.
                const resolved = resolveNodeWithSupersessionAwareness(access, supersessionIndex, targetNode);
                const display = legacySupersessionDisplay(resolved);
                const { text, truncated } = truncate(resolved.text);
                charsUsedRef.current += text.length;
                const outcome = ok(
                  { ref, resolvedSectionRef: targetNode.sectionRef, nodeId: targetNode.nodeId, text, truncated, supersessionStatus: display.supersessionStatus, supersessionReason: display.supersessionReason },
                  text,
                  `resolved reference "${ref}" -> ${targetNode.sectionRef} (${display.supersessionStatus})`
                );
                // HEADROOM OPEN-2 TERMINAL Part A: see getParentClause's own
                // comment above - identical gap, identical fix.
                outcome.evidenceUnresolved = !resolved.evidenceCurrent;
                return outcome;
              }
            }
          }
        }
        // Phase 3F.1.2 (task §15): resolve per-document with explicit
        // cardinality, never silently taking whichever document in
        // allowedDocs' iteration order happens to produce a hit first when
        // that hit is itself ambiguous within its own document.
        let anyAmbiguous = false;
        for (const documentId of allowedDocs) {
          const resolution = access.structuralIndex.resolveUniqueNodeByRef(documentId, ref);
          if (resolution.status === "AMBIGUOUS") {
            anyAmbiguous = true;
            continue;
          }
          if (resolution.status === "UNIQUE") {
            const node = resolution.node;
            const resolved = resolveNodeWithSupersessionAwareness(access, supersessionIndex, node);
            const display = legacySupersessionDisplay(resolved);
            const { text, truncated } = truncate(resolved.text);
            charsUsedRef.current += text.length;
            const outcome = ok(
              { ref, resolvedSectionRef: node.sectionRef, nodeId: node.nodeId, documentId, text, truncated, supersessionStatus: display.supersessionStatus, supersessionReason: display.supersessionReason },
              text,
              `resolved reference "${ref}" -> ${node.sectionRef} (${display.supersessionStatus})`
            );
            outcome.evidenceUnresolved = !resolved.evidenceCurrent;
            return outcome;
          }
        }
        if (anyAmbiguous) return refuse(`reference "${ref}" matches more than one physical location within this instrument's documents - ambiguous, not resolved. Provide a fromNodeId for context-scoped resolution, or narrow the reference.`);
        return refuse(`reference "${ref}" did not resolve to any section within this instrument's documents`);
      },
    },
    {
      name: "getRelatedAmendments",
      description: "Get the recorded amendment history (operations, effective dates, source citations) for a section or defined term, when it has any. Use this to understand whether the provision you are compiling has been modified since the base agreement.",
      inputSchema: { type: "object", properties: { ref: { type: "string" } }, required: ["ref"] },
      operativeStateDiscipline: "CURRENT_OPERATIVE_EVIDENCE",
      execute: (input) => {
        const ref = String(input.ref ?? "");
        const view = findProvisionView(access.operativeState?.provisions, ref);
        if (!view) return refuse(`no recorded amendment history for "${ref}" - it has not been amended (or is not a recognized section/definition in this instrument)`);
        const chain = view.fullChain.map((entry) => {
          const effect = access.amendmentEffects?.find((e) => e.effectId === entry.effectId);
          return { operation: entry.operation, effectiveDate: entry.effectiveDate, sourceCitation: entry.sourceCitation, appliedAsOfQuery: entry.appliedAsOfQuery, oldText: effect?.oldText ?? null, newText: effect?.newText ?? null };
        });
        const summary = `${chain.length} amendment effect(s) recorded for "${ref}" (status ${view.status})`;
        const outcome = ok({ ref, status: view.status, chain, unresolvedIssues: view.unresolvedIssues }, summary, summary);
        // HEADROOM OPEN-2 registry audit finding: discloses this provision's
        // own aggregate view.status (the SAME field getOperativeProvision's
        // now-fixed found-view branch gates on) - derived via the same
        // shared helper for consistency, even though this tool's own primary
        // content (the amendment chain's oldText/newText) is itself already
        // explicitly historical per entry.
        outcome.evidenceUnresolved = !isConfirmedCurrentOperativeEvidence(view.status);
        return outcome;
      },
    },
    {
      name: "getPriorVersion",
      description: "Get the text of a provision or definition BEFORE its most recent recorded amendment, when available. Use this only if the meaning of the CURRENT amendment itself depends on knowing what changed (e.g. an amendment that says 'increased from the prior $X to $Y').",
      inputSchema: { type: "object", properties: { ref: { type: "string" } }, required: ["ref"] },
      // Deliberately historical-by-design (its whole purpose is the PRIOR,
      // now-superseded text) and already labels itself as such via its own
      // description plus the returned `supersededBy` field.
      operativeStateDiscipline: "HISTORICAL_EVIDENCE_WITH_STATUS",
      execute: (input) => {
        const budgetErr = guardBudget();
        if (budgetErr) return refuse(budgetErr);
        const ref = String(input.ref ?? "");
        const view = findProvisionView(access.operativeState?.provisions, ref);
        if (!view || view.fullChain.length === 0) return refuse(`no recorded amendment history for "${ref}" - there is no prior version to retrieve`);
        const lastEntry = view.fullChain[view.fullChain.length - 1]!;
        const effect = access.amendmentEffects?.find((e) => e.effectId === lastEntry.effectId);
        if (!effect?.oldText) return refuse(`the amendment history for "${ref}" is recorded, but the prior version's full text was not captured by the amendment pipeline - do not guess what it said`);
        const { text, truncated } = truncate(effect.oldText);
        charsUsedRef.current += text.length;
        return ok({ ref, priorText: text, truncated, supersededBy: lastEntry.sourceCitation }, text, `prior version of "${ref}" (superseded by ${lastEntry.sourceCitation})`);
      },
    },
    {
      name: "getInstrumentDocuments",
      description: "List every document that is part of the SAME financing instrument as the provision you are compiling (e.g. a base credit agreement plus its amendments). Use this to understand what else exists before assuming a cross-reference is unresolvable.",
      inputSchema: { type: "object", properties: {}, required: [] },
      // Topology only (a list of documentIds) - never provision/economic text.
      operativeStateDiscipline: "NOT_CONTRACT_TEXT_EVIDENCE",
      execute: () => {
        const docs = Array.from(allowedDocs);
        const summary = `${docs.length} document(s) in this instrument`;
        return ok({ documentIds: docs }, summary, summary);
      },
    },
    {
      name: "getContextBundleComponent",
      description: "Look up one specific item from your own initial context bundle by its itemId (as given to you at the start) - use this to re-read a citation's full excerpt if you need to double check it rather than requesting new evidence. This is Phase 2D's own bounded retrieval, NOT independently re-verified against current amendment status here (see the response's supersessionStatus field) - prefer getOperativeProvision/getReferencedProvision for a section's confirmed-current economics.",
      inputSchema: { type: "object", properties: { itemId: { type: "string" } }, required: ["itemId"] },
      // Phase 3F.1.6.RX Workstream B fix (see summarizeItemWithSupersession's
      // own header): this DOES echo independently-interpretable provision/
      // economic excerptText, and context-retrieval/pipeline.ts (the module
      // that built it) has zero operative-state awareness of its own -
      // "already-vetted" was false. Correctly HISTORICAL_EVIDENCE_WITH_STATUS
      // now: never substitutes a different text (a bundle echo must return
      // exactly what the bundle holds), but every response honestly
      // discloses a real, independently-computed supersessionStatus.
      operativeStateDiscipline: "HISTORICAL_EVIDENCE_WITH_STATUS",
      execute: (input) => {
        const itemId = String(input.itemId ?? "");
        const item = access.contextBundle.items.find((i) => i.itemId === itemId);
        if (!item) return refuse(`itemId "${itemId}" is not in your context bundle`);
        const summary = `context item ${itemId} (${item.type})`;
        return ok(summarizeItemWithSupersession(supersessionIndex, item), item.excerptText, summary);
      },
    },
    {
      name: "getSharedCapContext",
      description: "Get every context-bundle item Phase 2D already flagged as a shared-capacity signal for this covenant (e.g. a trailing aggregate cap shared by multiple baskets in the same section). Use this before assuming a basket has its own independent, uncapped economics. This is Phase 2D's own bounded retrieval, NOT independently re-verified against current amendment status here (see each item's own supersessionStatus field).",
      inputSchema: { type: "object", properties: {}, required: [] },
      // Same reasoning and fix as getContextBundleComponent above.
      operativeStateDiscipline: "HISTORICAL_EVIDENCE_WITH_STATUS",
      execute: () => {
        const items = access.contextBundle.items.filter((i) => i.type === "SHARED_CAP").map((i) => summarizeItemWithSupersession(supersessionIndex, i));
        const summary = `${items.length} shared-cap context item(s)`;
        return ok({ items }, summary, summary);
      },
    },
    {
      name: "getSourceSpan",
      description: "Get this node's OWN raw drafted text exactly as it appears at this physical location in the source document, without interpretation and WITHOUT amendment substitution - use this to quote a specific clause's literal wording (including deliberately reading a historical/superseded occurrence, e.g. one named by getPriorVersion or getRelatedAmendments). This is historical/as-drafted evidence, not a claim about current operative status: this tool NEVER substitutes amended text. The response's supersessionStatus field tells you whether this exact physical text is independently known to still be current-operative (CURRENT_OPERATIVE), known superseded (KNOWN_SUPERSEDED), or not established either way (UNKNOWN_SUPERSESSION_STATUS) - for a section's CURRENT economics, use getOperativeProvision or getReferencedProvision instead.",
      inputSchema: { type: "object", properties: { nodeId: { type: "string" }, includeDescendants: { type: "boolean" } }, required: ["nodeId"] },
      // Deliberately historical/raw-by-design (see the description above)
      // and every response now explicitly discloses supersessionStatus.
      operativeStateDiscipline: "HISTORICAL_EVIDENCE_WITH_STATUS",
      execute: (input) => {
        const budgetErr = guardBudget();
        if (budgetErr) return refuse(budgetErr);
        const nodeId = String(input.nodeId ?? "");
        const node = access.structuralIndex.getNode(nodeId);
        if (!node || !allowedDocs.has(node.documentId)) return refuse(`nodeId "${nodeId}" is not a valid node in this instrument's documents`);
        const { text, truncated } = truncate(access.structuralIndex.getNodeText(nodeId, input.includeDescendants ? "DESCENDANTS" : "OWN"));
        charsUsedRef.current += text.length;
        // Phase 3F.1.6.R BLOCKER-5 fix (SUPER-5): this tool's own purpose
        // (the exact, literal, as-drafted text of one specific physical
        // occurrence) is legitimately historical/raw-by-design - unlike
        // getReferencedProvision/getParentClause/getSiblingClauses, it must
        // NEVER silently substitute a different (amended) text for the
        // exact node the model asked for. The fix here is disclosure, not
        // substitution: every response now carries a real
        // supersessionStatus/supersessionReason so the model can never
        // mistake "the raw text I asked for" for "confirmed current text."
        const supersession = getNodeSupersessionStatus(supersessionIndex, node.documentId, node.nodeId);
        return ok(
          { nodeId, sectionRef: node.sectionRef, text, truncated, supersessionStatus: supersession.status, supersessionReason: supersession.reason },
          text,
          `source span for ${node.sectionRef} (${supersession.status})`
        );
      },
    },
    {
      name: "getRuleDependency",
      description: "Get every dependency-graph edge (parent/child/definition/reference/amendment-lead) already recorded in your context bundle that touches a given itemId - use to see how one piece of evidence connects to another without re-deriving the graph yourself.",
      inputSchema: { type: "object", properties: { itemId: { type: "string" } }, required: ["itemId"] },
      // Returns only context-bundle graph edges (relationship metadata), never provision/economic text.
      operativeStateDiscipline: "NOT_CONTRACT_TEXT_EVIDENCE",
      execute: (input) => {
        const itemId = String(input.itemId ?? "");
        const edges = access.contextBundle.edges.filter((e) => e.fromItemId === itemId || e.toItemId === itemId);
        const summary = `${edges.length} edge(s) touching ${itemId}`;
        return ok({ edges }, summary, summary);
      },
    },
  ];
}

/** Runs one tool call under budget/cycle/logging discipline shared by every tool invocation - the caller (caller.ts) never calls a tool's own `execute` directly. */
export class ToolRunner {
  private callCount = 0;
  private readonly seenRequests = new Set<string>();
  readonly log: ToolCallLogEntry[] = [];

  constructor(
    private readonly definitions: ToolDefinition[],
    private readonly budget: ToolBudget
  ) {}

  get remainingCalls(): number {
    return Math.max(0, this.budget.maxToolCalls - this.callCount);
  }

  /** Returns the JSON-serializable content to send back as the tool_result. Never throws - an unknown tool name or an exhausted budget both produce an honest refusal payload the model can read and adapt to. */
  run(toolName: string, rawInput: unknown): unknown {
    const timestamp = new Date().toISOString();
    const signature = `${toolName}:${JSON.stringify(rawInput)}`;

    if (this.callCount >= this.budget.maxToolCalls) {
      const reason = `tool-call budget exhausted (${this.budget.maxToolCalls} calls already used this attempt) - no further evidence requests will be served; compile with what you have or mark the affected component MISSING_CONTEXT`;
      this.log.push({ toolName, input: rawInput, outputSummary: `refused: ${reason}`, charsReturned: 0, timestamp });
      return { error: reason };
    }
    if (this.seenRequests.has(signature)) {
      const reason = `identical request already made this attempt (repeated-request suppression) - reuse the earlier result instead of asking again`;
      this.log.push({ toolName, input: rawInput, outputSummary: `refused: ${reason}`, charsReturned: 0, timestamp });
      return { error: reason };
    }
    const definition = this.definitions.find((d) => d.name === toolName);
    if (!definition) {
      const reason = `unknown tool "${toolName}" - only the tools you were given are available`;
      this.log.push({ toolName, input: rawInput, outputSummary: `refused: ${reason}`, charsReturned: 0, timestamp });
      return { error: reason };
    }

    this.callCount += 1;
    this.seenRequests.add(signature);
    const outcome = definition.execute((rawInput ?? {}) as Record<string, unknown>);
    // Phase 3F.1.6-terminal Part A (OPEN-2) - carried onto the logged entry
    // verbatim (never re-derived from outputSummary text) so a downstream
    // consumer of this attempt's toolCallLog (semantic/compile.ts's
    // failureReasons wiring, semantic-verification/verify.ts's
    // determineStatus) can deterministically detect "this attempt's own
    // evidence included an unresolved definition" without depending on the
    // model itself having faithfully self-reported it.
    this.log.push({ toolName, input: rawInput, outputSummary: outcome.outputSummary, charsReturned: outcome.charsReturned, timestamp, evidenceUnresolved: outcome.evidenceUnresolved });
    return outcome.result;
  }
}
