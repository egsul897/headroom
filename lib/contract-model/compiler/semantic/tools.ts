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
import type { NodeSupersessionIndex, NodeSupersessionStatus, OperativeProvisionView } from "../amendment/types";
import type { StructuralNode } from "../types";
import { buildNodeSupersessionIndex, getNodeSupersessionStatus, resolveUniqueDefinitionByRef } from "../amendment/operative-state";
import type { ContextItem } from "../context-retrieval/types";
import type { SemanticToolAccess, ToolBudget, ToolCallLogEntry } from "./types";

export interface ToolExecutionOutcome {
  ok: boolean;
  /** JSON-serializable payload handed back to the model as the tool_result content. */
  result: unknown;
  charsReturned: number;
  outputSummary: string;
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

function findProvisionView(operativeState: OperativeProvisionView[] | undefined, ref: string): OperativeProvisionView | undefined {
  const normalized = ref.replace(/\s+/g, "");
  return operativeState?.find((p) => (p.sectionRef ?? "").replace(/\s+/g, "") === normalized || (p.definedTermRef ?? "").toLowerCase() === ref.trim().toLowerCase());
}

/**
 * Phase 3F.1.6.R BLOCKER-5 fix. Certification finding SUPER-5: 5 of 14
 * tools (getReferencedProvision, getParentClause, getChildren,
 * getSiblingClauses, getSourceSpan) navigated `access.structuralIndex`
 * directly and never consulted `access.operativeState` at all - unlike
 * their 9 siblings (getOperativeProvision chief among them), which already
 * call `findProvisionView(access.operativeState?.provisions, ...)` first.
 * This helper generalizes that EXACT already-working pattern (never
 * duplicates a second, parallel implementation) for every tool that
 * resolves a node BY ITS OWN sectionRef: prefer the real, amendment-aware
 * `OperativeProvisionView.currentText` when one covers this section;
 * otherwise fall back to the raw structural text, but ALWAYS attach a real
 * `supersessionStatus`/`supersessionReason` (via the same
 * `getNodeSupersessionStatus` primitive `discovery/pass-a-signals.ts` and
 * `semantic-coverage/cross-reference-audit.ts` already rely on) so a
 * fallback raw read can never be silently mistaken for confirmed-current
 * text merely because no tracked amendment happened to target it by
 * section reference.
 */
function resolveNodeWithSupersessionAwareness(access: SemanticToolAccess, supersessionIndex: NodeSupersessionIndex, node: StructuralNode): { text: string; supersessionStatus: NodeSupersessionStatus; supersessionReason: string; source: "amended" | "base-document" } {
  const view = findProvisionView(access.operativeState?.provisions, node.sectionRef);
  if (view?.currentText !== null && view?.currentText !== undefined) {
    return {
      text: view.currentText,
      supersessionStatus: view.status === "OPERATIVE_STATE_RESOLVED" ? "CURRENT_OPERATIVE" : "UNKNOWN_SUPERSESSION_STATUS",
      supersessionReason: `resolved against this section's own real amendment history (operative status ${view.status})`,
      source: "amended",
    };
  }
  const raw = access.structuralIndex.getNodeText(node.nodeId, "OWN");
  const result = getNodeSupersessionStatus(supersessionIndex, node.documentId, node.nodeId);
  return { text: raw, supersessionStatus: result.status, supersessionReason: result.reason, source: "base-document" };
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
      description: "Get the CURRENT operative text of a section (post-amendment where applicable) by its section reference (e.g. '6.10(a)'). Use this when you need a provision's real, up-to-date text that was not already included in your initial context.",
      inputSchema: { type: "object", properties: { sectionRef: { type: "string", description: "e.g. '6.10(a)'" } }, required: ["sectionRef"] },
      operativeStateDiscipline: "CURRENT_OPERATIVE_EVIDENCE",
      execute: (input) => {
        const budgetErr = guardBudget();
        if (budgetErr) return refuse(budgetErr);
        const sectionRef = String(input.sectionRef ?? "");
        const view = findProvisionView(access.operativeState?.provisions, sectionRef);
        if (view) {
          const { text, truncated } = truncate(view.currentText ?? "(no current text recorded)");
          charsUsedRef.current += text.length;
          return ok({ sectionRef, status: view.status, currentText: text, truncated, unresolvedIssues: view.unresolvedIssues }, text, `operative provision ${sectionRef} (status ${view.status})`);
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
        return ok({ sectionRef, status: "OPERATIVE_STATE_RESOLVED", currentText: text, truncated, unresolvedIssues: [] }, text, `base-document provision ${sectionRef} (never amended)`);
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
       */
      execute: (input) => {
        const budgetErr = guardBudget();
        if (budgetErr) return refuse(budgetErr);
        const term = String(input.term ?? "");
        const operative = access.operativeState ? findProvisionView(access.operativeState.provisions, term) : undefined;
        if (operative) {
          const { text, truncated } = truncate(operative.currentText ?? "(no current text recorded)");
          charsUsedRef.current += text.length;
          return ok(
            { term, status: operative.status, source: operative.currentText ? "amended" : "unresolved", text, truncated, unresolvedIssues: operative.unresolvedIssues },
            text,
            `definition "${term}" (status ${operative.status})`
          );
        }
        // No recorded amendment activity at all for this term - resolve
        // directly against the base document(s), home document first then
        // real siblings (mirroring getScopedDefinitionFullText's own
        // ordering), but never guess among multiple colliding physical
        // definitions of the same term within one document.
        let ambiguity: { documentId: string; candidateCount: number } | null = null;
        for (const docId of [homeDocumentId, ...Array.from(allowedDocs).filter((d) => d !== homeDocumentId)]) {
          const resolution = resolveUniqueDefinitionByRef(access.structuralIndex, docId, term);
          if (resolution.status === "AMBIGUOUS") {
            ambiguity ??= { documentId: docId, candidateCount: resolution.candidates.length };
            continue;
          }
          if (resolution.status === "UNIQUE") {
            const fullText = access.structuralIndex.getDefinitionFullText(resolution.definition.exactTerm, docId);
            if (!fullText) continue;
            const { text, truncated } = truncate(fullText);
            charsUsedRef.current += text.length;
            return ok({ term, status: "OPERATIVE_STATE_RESOLVED", source: "base-document", text, truncated, unresolvedIssues: [] }, text, `definition "${term}" (never amended)`);
          }
        }
        if (ambiguity) {
          return refuse(
            `term "${term}" matches ${ambiguity.candidateCount} distinct physical definitions in document "${ambiguity.documentId}", and it has no recorded amendment history to disambiguate it - cannot serve this as uniquely-resolved evidence; try getSourceSpan on a specific candidate node, or narrow which occurrence you mean`
          );
        }
        return refuse(`no defined term matching "${term}" found in this instrument's documents`);
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
        const { text, truncated } = truncate(resolved.text);
        charsUsedRef.current += text.length;
        return ok(
          { nodeId: parent.nodeId, sectionRef: parent.sectionRef, heading: parent.heading, text, truncated, supersessionStatus: resolved.supersessionStatus, supersessionReason: resolved.supersessionReason },
          text,
          `parent clause ${parent.sectionRef} (${resolved.supersessionStatus})`
        );
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
        const parentSupersession = getNodeSupersessionStatus(supersessionIndex, node.documentId, node.nodeId);
        const children = access.structuralIndex.getChildren(nodeId).map((c) => ({ nodeId: c.nodeId, sectionRef: c.sectionRef, heading: c.heading }));
        const summary = `${children.length} child clause(s) of ${node.sectionRef} (parent ${parentSupersession.status})`;
        return ok({ children, parentSupersessionStatus: parentSupersession.status, parentSupersessionReason: parentSupersession.reason }, summary, summary);
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
          const { text } = truncate(resolved.text);
          return { nodeId: s.nodeId, sectionRef: s.sectionRef, heading: s.heading, text, supersessionStatus: resolved.supersessionStatus, supersessionReason: resolved.supersessionReason };
        });
        charsUsedRef.current += rendered.reduce((sum, r) => sum + r.text.length, 0);
        const summary = `${siblings.length} sibling clause(s) of ${node.sectionRef}`;
        return ok({ siblings: rendered }, summary, summary);
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
                const { text, truncated } = truncate(resolved.text);
                charsUsedRef.current += text.length;
                return ok(
                  { ref, resolvedSectionRef: targetNode.sectionRef, nodeId: targetNode.nodeId, text, truncated, supersessionStatus: resolved.supersessionStatus, supersessionReason: resolved.supersessionReason },
                  text,
                  `resolved reference "${ref}" -> ${targetNode.sectionRef} (${resolved.supersessionStatus})`
                );
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
            const { text, truncated } = truncate(resolved.text);
            charsUsedRef.current += text.length;
            return ok(
              { ref, resolvedSectionRef: node.sectionRef, nodeId: node.nodeId, documentId, text, truncated, supersessionStatus: resolved.supersessionStatus, supersessionReason: resolved.supersessionReason },
              text,
              `resolved reference "${ref}" -> ${node.sectionRef} (${resolved.supersessionStatus})`
            );
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
        return ok({ ref, status: view.status, chain, unresolvedIssues: view.unresolvedIssues }, summary, summary);
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
    this.log.push({ toolName, input: rawInput, outputSummary: outcome.outputSummary, charsReturned: outcome.charsReturned, timestamp });
    return outcome.result;
  }
}
