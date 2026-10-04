/**
 * PHASE-2 OPERATIVE STATE FOR THE CERTIFIED LIVE RUNNER (semantic fidelity closure §32/§33/§51).
 *
 * The first certified live run of a candidate supplied `operativeState: null`, and Phase 3 correctly fail-closed with
 * OPERATIVE_STATE_UNRESOLVED. That behavior stays. What changes is the RUNNER: the real, preserved Phase-2 amendment
 * evidence for the instrument is loaded and adapted into the canonical `OperativeContractState` the package input takes.
 *
 * The preserved Phase-2G regression report records each operative provision as a summary view (provisionKey, kind,
 * sectionRef / definedTermRef, status, currentSourceDocumentId, chainLength, unresolvedIssues) and each amendment effect
 * in the older target schema. This adapter maps them to the current types WITHOUT inventing resolution: a provision the
 * report left REVIEW_REQUIRED stays REVIEW_REQUIRED, its currentText stays null (never "known"), its chain is reported as
 * length-only, and an effect without a stable id receives a deterministic content-derived id. Nothing here consults the
 * base agreement to guess what Phase 2 did not establish.
 */
import fs from "node:fs";
import crypto from "node:crypto";
import type { AmendmentEffectCandidate, OperativeContractState, OperativeProvisionView, OperativeStateStatus } from "../../lib/contract-model/compiler/amendment/types";

export const PRESERVED_CONMED_PHASE2_STATE_PATH = "tests/fixtures/unseen-packages/phase-2f-freeze/phase-2g/conmed-amendment-regression.json";
export const PHASE2_OPERATIVE_STATE_ADAPTER_VERSION = "phase2-operative-state-adapter.v1" as const;

interface Phase2ProvisionSummary { provisionKey: string; kind: "SECTION" | "DEFINITION"; sectionRef: string | null; definedTermRef: string | null; status: OperativeStateStatus; currentSourceDocumentId: string; chainLength: number; unresolvedIssues: string[] }
interface Phase2OperativeState { instrumentKey: string; status: OperativeStateStatus; summary: string; provisions: Phase2ProvisionSummary[] }
interface Phase2Effect { effectId?: string | null; operation: string; target: { kind: string; documentId: string | null; sectionRef: string | null; definedTermRef: string | null; hint: string | null }; effectiveDate: { date: string | null; status: string; evidence: string | null; reason: string }; resolutionMethod: string; status: string; unresolvedReason: string | null; hasCapturedText?: boolean; sourceCitation?: string; sourceExcerpt?: string; confidence?: number; newText?: string | null; oldText?: string | null }
interface Phase2Report { runId: string; generatedAt: string; asOfDate: string; operativeStates: Phase2OperativeState[]; perAmendmentDocument: { documentId: string; label: string; targetDocuments?: string[]; effects: Phase2Effect[] }[] }

export interface AdaptedOperativeState {
  adapterVersion: typeof PHASE2_OPERATIVE_STATE_ADAPTER_VERSION;
  source: { path: string; runId: string; generatedAt: string; asOfDate: string; sha256: string; instrumentKeyInReport: string };
  state: OperativeContractState;
  /** Every effect in the report (attached or not), adapted; kept for evidence. */
  effects: AmendmentEffectCandidate[];
}

const sha = (s: string) => crypto.createHash("sha256").update(s).digest("hex");

function adaptEffect(e: Phase2Effect, amendmentDocumentId: string): AmendmentEffectCandidate {
  const effectId = e.effectId ?? `effect:${sha(JSON.stringify({ amendmentDocumentId, operation: e.operation, target: e.target, effectiveDate: e.effectiveDate, unresolvedReason: e.unresolvedReason })).slice(0, 24)}`;
  return {
    effectId, amendmentDocumentId,
    target: { kind: (["SECTION", "DEFINITION", "DOCUMENT", "UNKNOWN"].includes(e.target.kind) ? e.target.kind : "UNKNOWN") as AmendmentEffectCandidate["target"]["kind"], targetDocumentId: e.target.documentId, targetInstrumentKey: null, targetStructuralNodeKey: null, targetSectionRef: e.target.sectionRef, targetDefinedTermRef: e.target.definedTermRef, targetHint: e.target.hint },
    operation: e.operation as AmendmentEffectCandidate["operation"],
    effectiveDate: { date: e.effectiveDate.date, status: e.effectiveDate.status as AmendmentEffectCandidate["effectiveDate"]["status"], evidence: e.effectiveDate.evidence, reason: e.effectiveDate.reason },
    newText: e.newText ?? null, oldText: e.oldText ?? null,
    sourceCitation: e.sourceCitation ?? amendmentDocumentId, sourceExcerpt: e.sourceExcerpt ?? "(not captured in the preserved Phase-2 report)",
    confidence: e.confidence ?? 0,
    status: e.status as AmendmentEffectCandidate["status"], unresolvedReason: e.unresolvedReason,
    resolutionMethod: e.resolutionMethod as AmendmentEffectCandidate["resolutionMethod"],
  } as AmendmentEffectCandidate;
}

/**
 * Adapt the preserved Phase-2 report for one instrument. `instrumentKey` is the package's own instrument key (the report
 * keys the same instrument differently); `baseDocumentId` is the document the report's provisions name as current source.
 */
export function loadPreservedPhase2OperativeState(args: { instrumentKey: string; baseDocumentId: string; path?: string; asOfDate?: string }): AdaptedOperativeState {
  const path = args.path ?? PRESERVED_CONMED_PHASE2_STATE_PATH;
  const raw = fs.readFileSync(path, "utf8");
  const report = JSON.parse(raw) as Phase2Report;
  const states = report.operativeStates.filter((s) => s.provisions.some((p) => p.currentSourceDocumentId === args.baseDocumentId));
  if (states.length !== 1) throw new Error(`expected exactly one preserved operative state naming ${args.baseDocumentId} as current source; found ${states.length}`);
  const src = states[0]!;
  const asOfDate = args.asOfDate ?? report.asOfDate;
  const provisions: OperativeProvisionView[] = src.provisions.map((p) => ({
    instrumentKey: args.instrumentKey,
    // the report's provisionKey embeds its own instrument key; re-key to the package's, keeping kind + ref
    provisionKey: `${args.instrumentKey}::${p.kind}::${p.kind === "SECTION" ? p.sectionRef : p.definedTermRef}`,
    kind: p.kind, documentId: p.currentSourceDocumentId, sectionRef: p.sectionRef, definedTermRef: p.definedTermRef, asOfDate,
    currentSourceDocumentId: p.currentSourceDocumentId,
    currentSourceNodeKey: null, currentSourceNodeId: null,
    // Phase 2 did not establish the amended text (REVIEW_REQUIRED); never substitute the base text for it here
    currentText: null,
    fullChain: [], appliedChain: [], supersededSourceNodeKeys: [], supersededSourceNodeIds: [],
    status: p.status, unresolvedIssues: [...p.unresolvedIssues, `preserved Phase-2 report: amendment chain of length ${p.chainLength} not replayed by this adapter (summary view only)`],
    conflicts: [], targetResolutionStatus: "NOT_FOUND", targetResolutionReason: "adapted from the preserved Phase-2 summary view; the provision's base node was not re-resolved against the structural index here",
    candidateSourceNodeIds: [], structuralHealthStatus: "STRUCTURAL_HEALTH_SUFFICIENT", structuralHealthIssues: [], attemptedText: null,
    reviewRequired: p.status !== "OPERATIVE_STATE_RESOLVED", candidateTexts: [],
  }));
  const effects = report.perAmendmentDocument.flatMap((d) => d.effects.map((e) => adaptEffect(e, d.documentId)));
  // effects the report could not attach to a provision of this instrument (document-level / unknown targets) are never dropped
  const attachedTargets = new Set(src.provisions.map((p) => (p.kind === "SECTION" ? `SECTION:${p.sectionRef}` : `DEFINITION:${p.definedTermRef}`)));
  const unattachedEffects = effects.filter((e) => !(e.target.kind === "SECTION" && attachedTargets.has(`SECTION:${e.target.targetSectionRef}`)) && !(e.target.kind === "DEFINITION" && attachedTargets.has(`DEFINITION:${(e.target.targetDefinedTermRef ?? "").toLowerCase()}`)));
  const state: OperativeContractState = { instrumentKey: args.instrumentKey, asOfDate, provisions, status: src.status, summary: `${src.summary} [adapted from preserved Phase-2 report ${report.runId}; ${unattachedEffects.length} unattached effect(s)]`, unattachedEffects };
  return { adapterVersion: PHASE2_OPERATIVE_STATE_ADAPTER_VERSION, source: { path, runId: report.runId, generatedAt: report.generatedAt, asOfDate: report.asOfDate, sha256: sha(raw), instrumentKeyInReport: src.instrumentKey }, state, effects };
}
