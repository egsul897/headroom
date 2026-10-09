/**
 * Deterministic production stages for one corpus package, executed through the same entry points the production
 * pipeline uses (parse -> definitions/references -> structural index -> package graph -> discovery Pass A ->
 * amendment pipeline -> operative state -> supersession index). No provider, no network.
 *
 * The amendment pipeline's semantic interpreter is the one stage in this file that would need a model; it is
 * supplied a MOCKED StageCaller that answers UNKNOWN_CHANGE / confidence 0 so that the production code's own
 * fail-closed path is exercised and every such call is counted and disclosed.
 */
import { parseDocumentStructure } from "../../lib/contract-model/compiler/stage-structure";
import { detectStructuralDefinitions } from "../../lib/contract-model/compiler/structural-definitions";
import { detectStructuralReferences } from "../../lib/contract-model/compiler/structural-references";
import { buildStructuralIndex, type StructuralIndex } from "../../lib/contract-model/compiler/structural-index";
import { buildPackageGraph } from "../../lib/contract-model/compiler/package-graph/pipeline";
import type { PackageGraphResult } from "../../lib/contract-model/compiler/package-graph/types";
import { runPassADeterministicSignals } from "../../lib/contract-model/compiler/discovery/pass-a-signals";
import type { DeterministicCandidate } from "../../lib/contract-model/compiler/discovery/types";
import { runAmendmentPipeline, countAmbiguousEffectsNeedingInterpretation, type AmendmentPipelineResult } from "../../lib/contract-model/compiler/amendment/pipeline";
import { computeOperativeContractState, buildNodeSupersessionIndex, EMPTY_SUPERSESSION_INDEX } from "../../lib/contract-model/compiler/amendment/operative-state";
import type { OperativeContractState, NodeSupersessionIndex } from "../../lib/contract-model/compiler/amendment/types";
import type { StageCaller } from "../../lib/contract-model/compiler/llm-caller";
import type { CorpusPackage } from "./corpus";
import type { StageRecord } from "./report-types";

export interface DeterministicStages {
  index: StructuralIndex;
  packageGraph: PackageGraphResult;
  passA: Map<string, DeterministicCandidate[]>;
  amendment: AmendmentPipelineResult | null;
  amendmentError: string | null;
  /** Interpreter calls the production pipeline attempted (each answered by the mock). */
  interpreterCalls: number;
  /** One operative state per as-of date in the manifest, for the package's base agreement. */
  operativeStates: Map<string, OperativeContractState>;
  supersessionIndexes: Map<string, NodeSupersessionIndex>;
  /** Package-graph instrument key per base document (what production callers pass to computeOperativeContractState). */
  instrumentKeys: Map<string, string>;
  baseDocumentId: string;
  exactTermsByDocument: Map<string, Map<string, string>>;
  stageRecords: StageRecord[];
}

/** MOCKED amendment interpreter: declines to classify. Exercises the production fail-closed path, never a model. */
export function mockedInterpreterCaller(counter: { calls: number }): StageCaller {
  return {
    providerName: "MOCKED", model: "MOCKED-no-provider", isSynthetic: true,
    async call(schema, stage) {
      counter.calls += 1;
      if (stage !== "amendment_interpretation") throw new Error(`mocked interpreter asked for unexpected stage ${stage}`);
      return schema.parse({ operation: "UNKNOWN_CHANGE", proposedNewText: null, targetConfirmed: true, effectiveDateEvidence: null, sourceCitations: [], confidence: 0, unresolvedQuestions: ["MOCKED interpreter: offline acceptance run, no provider available"] });
    },
    lastTelemetry: () => null,
  } as StageCaller;
}

export function buildIndex(pkg: CorpusPackage): StructuralIndex {
  const nodesByDocument = new Map<string, { text: string; nodes: ReturnType<typeof parseDocumentStructure> }>();
  const allDefinitions: ReturnType<typeof detectStructuralDefinitions> = [];
  const allReferences: ReturnType<typeof detectStructuralReferences> = [];
  for (const d of pkg.documents) {
    const doc = { documentId: d.documentId, label: d.label, text: d.text };
    const nodes = parseDocumentStructure(doc);
    nodesByDocument.set(d.documentId, { text: d.text, nodes });
    allDefinitions.push(...detectStructuralDefinitions(d.documentId, d.text, nodes));
    allReferences.push(...detectStructuralReferences(d.documentId, d.text, nodes));
  }
  return buildStructuralIndex(nodesByDocument, allDefinitions, allReferences);
}

export function exactTerms(pkg: CorpusPackage): Map<string, Map<string, string>> {
  const out = new Map<string, Map<string, string>>();
  for (const d of pkg.documents) {
    const nodes = parseDocumentStructure({ documentId: d.documentId, label: d.label, text: d.text });
    const terms = new Map<string, string>();
    for (const def of detectStructuralDefinitions(d.documentId, d.text, nodes)) terms.set(def.normalizedTerm, def.exactTerm);
    out.set(d.documentId, terms);
  }
  return out;
}

export async function runDeterministicStages(pkg: CorpusPackage): Promise<DeterministicStages> {
  const stageRecords: StageRecord[] = [];
  const timed = <T>(stage: StageRecord["stage"], mode: StageRecord["mode"], note: string, fn: () => T): T => {
    const t0 = Date.now();
    try {
      const v = fn();
      stageRecords.push({ stage, mode, note, durationMs: Date.now() - t0 });
      return v;
    } catch (e) {
      stageRecords.push({ stage, mode, note, durationMs: Date.now() - t0, error: e instanceof Error ? e.message : String(e) });
      throw e;
    }
  };

  const index = timed("STRUCTURE", "PRODUCTION", "parseDocumentStructure + detectStructuralDefinitions/References + buildStructuralIndex", () => buildIndex(pkg));
  const docs = pkg.documents.map((d) => ({ documentId: d.documentId, label: d.label, text: d.text }));
  const packageGraph = timed("PACKAGE_GRAPH", "PRODUCTION", "buildPackageGraph (classification, identities, relationships, modification candidates)", () => buildPackageGraph(pkg.manifest.companyId, `${pkg.packageId}-package`, docs));
  const passA = timed("DISCOVERY_PASS_A", "PRODUCTION", "runPassADeterministicSignals per document (Pass B–D need a provider: NOT_RUN)", () => new Map(pkg.documents.map((d) => [d.documentId, runPassADeterministicSignals(d.documentId, index)] as const)));
  stageRecords.push({ stage: "DISCOVERY_PASS_B_PLUS", mode: "NOT_RUN", note: "Semantic discovery passes require a provider. The candidate population for the semantic stage is MANIFEST-DECLARED, which is a capability gap recorded in the report, not evidence of discovery coverage." });

  const base = pkg.manifest.documents.find((d) => d.role === "BASE_AGREEMENT")!;
  const counter = { calls: 0 };
  let amendment: AmendmentPipelineResult | null = null;
  let amendmentError: string | null = null;
  const t0 = Date.now();
  const expectedInterpreterCalls = countAmbiguousEffectsNeedingInterpretation({ documents: docs, packageGraph, index });
  try {
    amendment = await runAmendmentPipeline(mockedInterpreterCaller(counter), { documents: docs, packageGraph, index });
    stageRecords.push({ stage: "AMENDMENT_DETERMINISTIC", mode: "PRODUCTION", note: "runAmendmentPipeline deterministic pass + independent verification gate", durationMs: Date.now() - t0 });
  } catch (e) {
    amendmentError = e instanceof Error ? e.message : String(e);
    stageRecords.push({ stage: "AMENDMENT_DETERMINISTIC", mode: "PRODUCTION", note: "runAmendmentPipeline threw", durationMs: Date.now() - t0, error: amendmentError });
  }
  stageRecords.push({ stage: "AMENDMENT_INTERPRETER", mode: counter.calls > 0 ? "MOCKED" : "NOT_RUN", note: counter.calls > 0 ? `${counter.calls} interpreter call(s) (${expectedInterpreterCalls} predicted) answered by the MOCKED caller with UNKNOWN_CHANGE/confidence 0 - the production REVIEW_REQUIRED path, no model evidence.` : "No ambiguous amendment operation needed interpretation; the interpreter was never invoked." });

  // Operative state per instrument. Production callers pass the package graph's own `instrument:<base>` key; a
  // non-matching key silently yields OPERATIVE_STATE_RESOLVED with zero provisions (recorded as an observation by
  // the auditor), so the key is taken from the graph here exactly as production does.
  const instrumentKeys = new Map<string, string>();
  for (const d of pkg.manifest.documents.filter((d) => d.operative && (d.role === "BASE_AGREEMENT" || d.role === "INDENTURE" || d.role === "INTERCREDITOR"))) {
    const group = packageGraph.instruments.find((g) => g.baseDocumentId === d.documentId) ?? packageGraph.instruments.find((g) => g.documentIds.includes(d.documentId));
    instrumentKeys.set(d.documentId, group?.instrumentKey ?? `instrument:${d.documentId}`);
  }
  const operativeStates = new Map<string, OperativeContractState>();
  const supersessionIndexes = new Map<string, NodeSupersessionIndex>();
  const t1 = Date.now();
  try {
    for (const asOfDate of pkg.manifest.operativeState.asOfDates) {
      // IPV-05: amendment effects that could not resolve a target instrument must still
      // surface as unattached REVIEW material on every candidate instrument — never leave
      // the instrument OPERATIVE_STATE_RESOLVED with zero disclosure.
      const unresolvedOrphanEffects = (amendment?.effects ?? []).filter(
        (e) => (e.status === "UNRESOLVED" || e.status === "REVIEW_REQUIRED") && !e.target.targetInstrumentKey,
      );
      const states = [...instrumentKeys].map(([baseDocumentId, instrumentKey]) => ({
        baseDocumentId,
        state: computeOperativeContractState({
          instrumentKey,
          baseDocumentId,
          asOfDate,
          index,
          allEffects: amendment?.effects ?? [],
          unresolvedTargetEffectsForThisInstrument: unresolvedOrphanEffects,
        }),
      }));
      // Per-instrument keys for operative-state auditor lookups; package-level
      // asOf key merges every instrument so multi-instrument candidates
      // (indenture + credit agreement) see descendant splices (IPV-04).
      for (const x of states) operativeStates.set(`${asOfDate}::${x.baseDocumentId}`, x.state);
      const rank: Record<string, number> = {
        OPERATIVE_STATE_CONFLICTED: 4,
        OPERATIVE_STATE_REVIEW_REQUIRED: 3,
        OPERATIVE_STATE_PARTIAL: 2,
        OPERATIVE_STATE_RESOLVED: 1,
      };
      const mergedStatus = states.reduce((worst, x) => ((rank[x.state.status] ?? 0) > (rank[worst] ?? 0) ? x.state.status : worst), "OPERATIVE_STATE_RESOLVED" as (typeof states)[number]["state"]["status"]);
      operativeStates.set(asOfDate, {
        instrumentKey: `package:${pkg.packageId}`,
        asOfDate,
        provisions: states.flatMap((x) => x.state.provisions),
        unattachedEffects: states.flatMap((x) => x.state.unattachedEffects),
        status: mergedStatus,
        summary: `Merged operative state across ${states.length} instrument(s) at ${asOfDate}.`,
      });
      supersessionIndexes.set(asOfDate, buildNodeSupersessionIndex(states));
    }
    stageRecords.push({ stage: "OPERATIVE_STATE", mode: "PRODUCTION", note: `computeOperativeContractState + buildNodeSupersessionIndex for ${pkg.manifest.operativeState.asOfDates.length} as-of date(s) × ${instrumentKeys.size} instrument(s)`, durationMs: Date.now() - t1 });
  } catch (e) {
    stageRecords.push({ stage: "OPERATIVE_STATE", mode: "PRODUCTION", note: "computeOperativeContractState threw", durationMs: Date.now() - t1, error: e instanceof Error ? e.message : String(e) });
  }
  if (operativeStates.size === 0) for (const asOfDate of pkg.manifest.operativeState.asOfDates) supersessionIndexes.set(asOfDate, EMPTY_SUPERSESSION_INDEX);

  return { index, packageGraph, passA, amendment, amendmentError, interpreterCalls: counter.calls, operativeStates, supersessionIndexes, instrumentKeys, baseDocumentId: base.documentId, exactTermsByDocument: exactTerms(pkg), stageRecords };
}
