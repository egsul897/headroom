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
import type { OperativeProvisionView } from "../amendment/types";
import type { ContextItem } from "../context-retrieval/types";
import type { SemanticToolAccess, ToolBudget, ToolCallLogEntry } from "./types";

export interface ToolExecutionOutcome {
  ok: boolean;
  /** JSON-serializable payload handed back to the model as the tool_result content. */
  result: unknown;
  charsReturned: number;
  outputSummary: string;
}

export interface ToolDefinition {
  name: string;
  description: string;
  /** Anthropic Tool.input_schema-compatible JSON Schema (hand-written, deliberately simple - every tool takes at most a couple of string params, task §6's own "exact tool names are an engineering choice" gives latitude here, not a reason to over-engineer). */
  inputSchema: { type: "object"; properties: Record<string, { type: string; description?: string }>; required: string[] };
  execute: (input: Record<string, unknown>) => ToolExecutionOutcome;
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

function summarizeItem(item: ContextItem): unknown {
  return { itemId: item.itemId, type: item.type, documentId: item.documentId, sourceCitation: item.sourceCitation, excerptText: item.excerptText, reason: item.reason };
}

function findProvisionView(operativeState: OperativeProvisionView[] | undefined, ref: string): OperativeProvisionView | undefined {
  const normalized = ref.replace(/\s+/g, "");
  return operativeState?.find((p) => (p.sectionRef ?? "").replace(/\s+/g, "") === normalized || (p.definedTermRef ?? "").toLowerCase() === ref.trim().toLowerCase());
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

  const guardBudget = (): string | null => (remainingBudget() <= 0 ? `additional-source character budget (${budget.maxAdditionalSourceChars}) already exhausted for this compilation attempt - no further tool evidence can be returned` : null);

  return [
    {
      name: "getOperativeProvision",
      description: "Get the CURRENT operative text of a section (post-amendment where applicable) by its section reference (e.g. '6.10(a)'). Use this when you need a provision's real, up-to-date text that was not already included in your initial context.",
      inputSchema: { type: "object", properties: { sectionRef: { type: "string", description: "e.g. '6.10(a)'" } }, required: ["sectionRef"] },
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
        const node = access.structuralIndex.getNodeByRef(homeDocumentId, sectionRef);
        if (!node) return refuse(`no section "${sectionRef}" found in this instrument's documents, and it has no recorded amendment history`);
        const { text, truncated } = truncate(access.structuralIndex.getNodeText(node.nodeKey, "OWN"));
        charsUsedRef.current += text.length;
        return ok({ sectionRef, status: "OPERATIVE_STATE_RESOLVED", currentText: text, truncated, unresolvedIssues: [] }, text, `base-document provision ${sectionRef} (never amended)`);
      },
    },
    {
      name: "getDefinition",
      description: "Get the full definition text of a defined term by exact name (e.g. 'Consolidated EBITDA'). Use this only when the term is material to the covenant you are compiling and its meaning was not already included in your initial context.",
      inputSchema: { type: "object", properties: { term: { type: "string" } }, required: ["term"] },
      execute: (input) => {
        const budgetErr = guardBudget();
        if (budgetErr) return refuse(budgetErr);
        const term = String(input.term ?? "");
        const operative = access.operativeState ? findProvisionView(access.operativeState.provisions, term) : undefined;
        if (operative?.currentText) {
          const { text, truncated } = truncate(operative.currentText);
          charsUsedRef.current += text.length;
          return ok({ term, source: "amended", text, truncated }, text, `definition "${term}" (amended, status ${operative.status})`);
        }
        const fullText = access.structuralIndex.getDefinitionFullText(term, homeDocumentId) ?? access.structuralIndex.getDefinitionFullText(term);
        if (!fullText) return refuse(`no defined term matching "${term}" found in this instrument's documents`);
        const { text, truncated } = truncate(fullText);
        charsUsedRef.current += text.length;
        return ok({ term, source: "base-document", text, truncated }, text, `definition "${term}"`);
      },
    },
    {
      name: "getDefinitionDependencies",
      description: "Given a defined term, list OTHER defined terms whose exact names appear inside its own definition text (a bounded, real dependency signal - not a claim of full recursive resolution). Use this before requesting each dependency's own definition individually, to know which ones actually matter.",
      inputSchema: { type: "object", properties: { term: { type: "string" } }, required: ["term"] },
      execute: (input) => {
        const term = String(input.term ?? "");
        const fullText = access.structuralIndex.getDefinitionFullText(term, homeDocumentId) ?? access.structuralIndex.getDefinitionFullText(term);
        if (!fullText) return refuse(`no defined term matching "${term}" found - cannot inspect its dependencies`);
        const allTerms = access.structuralIndex.allDefinitions().map((d) => d.exactTerm);
        const dependencies = Array.from(new Set(allTerms.filter((t) => t !== term && fullText.includes(t))));
        const summary = `${dependencies.length} dependency term(s) found in "${term}"'s own text`;
        return ok({ term, dependencies }, summary, summary);
      },
    },
    {
      name: "getParentClause",
      description: "Get the parent structural clause of a given node (by its nodeKey, e.g. 'doc-1::6.01(a)') - use when a sub-clause's meaning depends on the chapeau/lead-in language of the section or clause it sits inside.",
      inputSchema: { type: "object", properties: { nodeId: { type: "string" } }, required: ["nodeId"] },
      execute: (input) => {
        const budgetErr = guardBudget();
        if (budgetErr) return refuse(budgetErr);
        const nodeId = String(input.nodeId ?? "");
        const node = access.structuralIndex.getNode(nodeId);
        if (!node || !allowedDocs.has(node.documentId)) return refuse(`nodeId "${nodeId}" is not a valid node in this instrument's documents`);
        const parent = access.structuralIndex.getParent(nodeId);
        if (!parent) return refuse(`node "${nodeId}" has no parent clause (it is a top-level node)`);
        const { text, truncated } = truncate(access.structuralIndex.getNodeText(parent.nodeKey, "OWN"));
        charsUsedRef.current += text.length;
        return ok({ nodeKey: parent.nodeKey, sectionRef: parent.sectionRef, heading: parent.heading, text, truncated }, text, `parent clause ${parent.sectionRef}`);
      },
    },
    {
      name: "getChildren",
      description: "Get the direct child clauses of a given structural node (by nodeKey) - use to see every lettered/numbered sub-clause of a section you are compiling.",
      inputSchema: { type: "object", properties: { nodeId: { type: "string" } }, required: ["nodeId"] },
      execute: (input) => {
        const nodeId = String(input.nodeId ?? "");
        const node = access.structuralIndex.getNode(nodeId);
        if (!node || !allowedDocs.has(node.documentId)) return refuse(`nodeId "${nodeId}" is not a valid node in this instrument's documents`);
        const children = access.structuralIndex.getChildren(nodeId).map((c) => ({ nodeKey: c.nodeKey, sectionRef: c.sectionRef, heading: c.heading }));
        const summary = `${children.length} child clause(s) of ${node.sectionRef}`;
        return ok({ children }, summary, summary);
      },
    },
    {
      name: "getSiblingClauses",
      description: "Get the sibling clauses of a given structural node (by nodeKey) - use when a basket's economics depend on a shared proviso or trailing cap stated in a sibling clause of the SAME section (task §16's own multi-basket-per-section case).",
      inputSchema: { type: "object", properties: { nodeId: { type: "string" } }, required: ["nodeId"] },
      execute: (input) => {
        const budgetErr = guardBudget();
        if (budgetErr) return refuse(budgetErr);
        const nodeId = String(input.nodeId ?? "");
        const node = access.structuralIndex.getNode(nodeId);
        if (!node || !allowedDocs.has(node.documentId)) return refuse(`nodeId "${nodeId}" is not a valid node in this instrument's documents`);
        const siblings = access.structuralIndex.getSiblings(nodeId);
        const rendered = siblings.map((s) => ({ nodeKey: s.nodeKey, sectionRef: s.sectionRef, heading: s.heading, text: truncate(access.structuralIndex.getNodeText(s.nodeKey, "OWN")).text }));
        charsUsedRef.current += rendered.reduce((sum, r) => sum + r.text.length, 0);
        const summary = `${siblings.length} sibling clause(s) of ${node.sectionRef}`;
        return ok({ siblings: rendered }, summary, summary);
      },
    },
    {
      name: "getReferencedProvision",
      description: "Resolve an explicit cross-reference (e.g. 'Section 1.07', 'clause (b) of this Section') to its real target section and text. Use this when the operative text you are compiling expressly requires reading another section to know the covenant's actual economics.",
      inputSchema: { type: "object", properties: { ref: { type: "string" }, fromNodeId: { type: "string", description: "nodeId of the clause containing the reference, for relative references like 'clause (b) of this Section' - omit for an absolute reference like 'Section 1.07'" } }, required: ["ref"] },
      execute: (input) => {
        const budgetErr = guardBudget();
        if (budgetErr) return refuse(budgetErr);
        const ref = String(input.ref ?? "");
        const fromNodeId = input.fromNodeId ? String(input.fromNodeId) : null;
        if (fromNodeId) {
          const fromNode = access.structuralIndex.getNode(fromNodeId);
          if (fromNode && allowedDocs.has(fromNode.documentId)) {
            const found = access.structuralIndex.findReferencesFrom(fromNodeId).find((r) => r.referenceText === ref || r.normalizedTarget === ref.replace(/\s+/g, ""));
            if (found?.resolved && found.targetNodeKey) {
              const targetNode = access.structuralIndex.getNode(found.targetNodeKey);
              if (targetNode) {
                const { text, truncated } = truncate(access.structuralIndex.getNodeText(targetNode.nodeKey, "OWN"));
                charsUsedRef.current += text.length;
                return ok({ ref, resolvedSectionRef: targetNode.sectionRef, text, truncated }, text, `resolved reference "${ref}" -> ${targetNode.sectionRef}`);
              }
            }
          }
        }
        for (const documentId of allowedDocs) {
          const node = access.structuralIndex.getNodeByRef(documentId, ref);
          if (node) {
            const { text, truncated } = truncate(access.structuralIndex.getNodeText(node.nodeKey, "OWN"));
            charsUsedRef.current += text.length;
            return ok({ ref, resolvedSectionRef: node.sectionRef, documentId, text, truncated }, text, `resolved reference "${ref}" -> ${node.sectionRef}`);
          }
        }
        return refuse(`reference "${ref}" did not resolve to any section within this instrument's documents`);
      },
    },
    {
      name: "getRelatedAmendments",
      description: "Get the recorded amendment history (operations, effective dates, source citations) for a section or defined term, when it has any. Use this to understand whether the provision you are compiling has been modified since the base agreement.",
      inputSchema: { type: "object", properties: { ref: { type: "string" } }, required: ["ref"] },
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
      execute: () => {
        const docs = Array.from(allowedDocs);
        const summary = `${docs.length} document(s) in this instrument`;
        return ok({ documentIds: docs }, summary, summary);
      },
    },
    {
      name: "getContextBundleComponent",
      description: "Look up one specific item from your own initial context bundle by its itemId (as given to you at the start) - use this to re-read a citation's full excerpt if you need to double check it rather than requesting new evidence.",
      inputSchema: { type: "object", properties: { itemId: { type: "string" } }, required: ["itemId"] },
      execute: (input) => {
        const itemId = String(input.itemId ?? "");
        const item = access.contextBundle.items.find((i) => i.itemId === itemId);
        if (!item) return refuse(`itemId "${itemId}" is not in your context bundle`);
        const summary = `context item ${itemId} (${item.type})`;
        return ok(summarizeItem(item), item.excerptText, summary);
      },
    },
    {
      name: "getSharedCapContext",
      description: "Get every context-bundle item Phase 2D already flagged as a shared-capacity signal for this covenant (e.g. a trailing aggregate cap shared by multiple baskets in the same section). Use this before assuming a basket has its own independent, uncapped economics.",
      inputSchema: { type: "object", properties: {}, required: [] },
      execute: () => {
        const items = access.contextBundle.items.filter((i) => i.type === "SHARED_CAP").map(summarizeItem);
        const summary = `${items.length} shared-cap context item(s)`;
        return ok({ items }, summary, summary);
      },
    },
    {
      name: "getSourceSpan",
      description: "Get the raw source text of a structural node by its nodeKey, without interpretation - use for the exact quoted text of a specific clause.",
      inputSchema: { type: "object", properties: { nodeId: { type: "string" }, includeDescendants: { type: "boolean" } }, required: ["nodeId"] },
      execute: (input) => {
        const budgetErr = guardBudget();
        if (budgetErr) return refuse(budgetErr);
        const nodeId = String(input.nodeId ?? "");
        const node = access.structuralIndex.getNode(nodeId);
        if (!node || !allowedDocs.has(node.documentId)) return refuse(`nodeId "${nodeId}" is not a valid node in this instrument's documents`);
        const { text, truncated } = truncate(access.structuralIndex.getNodeText(nodeId, input.includeDescendants ? "DESCENDANTS" : "OWN"));
        charsUsedRef.current += text.length;
        return ok({ nodeKey: nodeId, sectionRef: node.sectionRef, text, truncated }, text, `source span for ${node.sectionRef}`);
      },
    },
    {
      name: "getRuleDependency",
      description: "Get every dependency-graph edge (parent/child/definition/reference/amendment-lead) already recorded in your context bundle that touches a given itemId - use to see how one piece of evidence connects to another without re-deriving the graph yourself.",
      inputSchema: { type: "object", properties: { itemId: { type: "string" } }, required: ["itemId"] },
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
