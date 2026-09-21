/**
 * §9 — re-score the nine CONMED benchmark cases against the pilot's own output.
 *
 * This is a PILOT COMPARISON, not a canonical measurement (§3). The canonical 47-case
 * score is untouched; nothing here writes to it.
 *
 * The mapping from compiled output to a case outcome is deterministic and conservative,
 * and it is stated rather than buried:
 *
 *  - A candidate is RELEVANT to a case when its normalized section ref is the case's own
 *    claim address or a descendant of it. Ancestors do not count: Section 7.1 as a whole
 *    is not a representation of 7.2(c).
 *  - A relevant candidate yields a SUBSTANTIVE_REPRESENTATION only when its compilation
 *    did not FAIL and it produced at least one rule whose own self-reported sufficiency
 *    is COMPLETE (the IR enum's full-representation value). PARTIAL surfaces the provision
 *    but does not credit it; UNSUPPORTED, MISSING_CONTEXT, AMBIGUOUS and CONFLICTED are
 *    honest abstentions — the safe outcome, and deliberately not credit.
 *  - CREDIT requires at least one substantive representation at the claim's address.
 *  - Where there is no credit, surfacing asks whether the system said ANYTHING specific
 *    about the claim's address: a compiled rule of any sufficiency, or an honest
 *    unresolved flag, counts as surfaced. Silence does not.
 *
 * The conservative direction is deliberate. A pilot that wants to justify more spending
 * has every incentive to grade itself generously, so the mapping refuses to convert a
 * model's own admission of insufficiency into a win.
 *
 * Forensic tooling. Nothing in the production pipeline imports it.
 */
import fs from "node:fs";
import path from "node:path";
import type { CandidateRecord } from "./compile-run";

const ROOT = process.cwd();
const CORPUS = "docs/phase-3-v3.1-final-reconciliation/05-v3.1.1-corrected-47-case-corpus.json";
const RESULTS = "docs/phase-3-v3.1-final-reconciliation/08-final-47-case-results.json";
export const CONMED_DOCUMENT_ID = "conmed-doc-a-eighth-ar-credit-agreement";

const readJson = (p: string) => JSON.parse(fs.readFileSync(path.join(ROOT, p), "utf8"));

/** "7.2(c)" is a descendant of "7.2"; "7.1" is not a descendant of "7.10". */
export function isAtOrBelow(candidateRef: string, claimRef: string): boolean {
  const c = candidateRef.trim();
  const k = claimRef.trim();
  if (c === k) return true;
  if (!c.startsWith(k)) return false;
  const next = c.charAt(k.length);
  return next === "(" || next === ".";
}

/**
 * The IR's own sufficiency values (lib/contract-model/ir/types.ts):
 *   COMPLETE | PARTIAL | AMBIGUOUS | UNSUPPORTED | MISSING_CONTEXT | CONFLICTED
 * Only COMPLETE is a full representation. Everything else is partial or an abstention.
 */
export const CREDIT_SUFFICIENCY = "COMPLETE";
export const PARTIAL_SUFFICIENCY = "PARTIAL";

export interface CaseOutcome {
  /**
   * False when NO candidate at this claim's address was ever served by the provider.
   * Such a case has no pilot result at all — scoring it NOT_SPECIFICALLY_SURFACED would
   * present "we never asked" as "the system stayed silent", which is the single most
   * misleading thing this re-score could do.
   */
  measured: boolean;
  caseId: string;
  claimSectionRef: string;
  materiality: string;
  priorCredit: string;
  priorSurfacing: string;
  priorDangerousSilentOmission: boolean;
  relevantCandidateIds: string[];
  compiledAtAddress: number;
  failedAtAddress: number;
  providerRefusedCandidates: number;
  substantiveRepresentations: number;
  partialRepresentations: number;
  honestAbstentions: number;
  pilotCredit: "CREDIT" | "NO_CREDIT";
  pilotSurfacing: "SPECIFICALLY_SURFACED" | "NOT_SPECIFICALLY_SURFACED";
  pilotDangerousSilentOmission: boolean;
  substantiveRepresentationNowExists: boolean;
  requiredEscalation: boolean;
  modelQualityUncertaintyRemains: boolean;
  modelQualityNote: string;
}

export function rescore(records: CandidateRecord[]): { cases: CaseOutcome[]; deltas: Record<string, number>; mappingRule: string } {
  const corpus = readJson(CORPUS);
  const results = readJson(RESULTS);
  const rowById = new Map<string, any>(results.rows.map((r: any) => [r.caseId, r] as const));
  const cases = corpus.cases.filter((c: any) => c.documentId === CONMED_DOCUMENT_ID);

  const outcomes: CaseOutcome[] = cases
    .map((c: any): CaseOutcome => {
      const claimRef = String(c.claimSectionRef ?? "");
      const relevant = records.filter((r) => isAtOrBelow(String(r.sourceSectionRef), claimRef));
      const failed = relevant.filter((r) => r.status === "FAILED");
      const ok = relevant.filter((r) => r.status !== "FAILED");
      const substantive = ok.filter((r) => (r.sufficiencySummary[CREDIT_SUFFICIENCY] ?? 0) > 0);
      const partials = ok.filter((r) => (r.sufficiencySummary[CREDIT_SUFFICIENCY] ?? 0) === 0 && (r.sufficiencySummary[PARTIAL_SUFFICIENCY] ?? 0) > 0);
      const abstentions = ok.filter((r) => (r.sufficiencySummary[CREDIT_SUFFICIENCY] ?? 0) === 0 && (r.sufficiencySummary[PARTIAL_SUFFICIENCY] ?? 0) === 0 && r.rules > 0);
      const saidSomething = ok.filter((r) => r.rules > 0 || r.definitions > 0);
      const prior = rowById.get(c.caseId);
      const providerRefused = relevant.filter((r) => r.failureReasons.includes("PROVIDER_FAILURE"));
      const measured = relevant.length > 0 && providerRefused.length < relevant.length;

      const credit = substantive.length > 0 ? "CREDIT" : "NO_CREDIT";
      const surfacing = saidSomething.length > 0 ? "SPECIFICALLY_SURFACED" : "NOT_SPECIFICALLY_SURFACED";

      return {
        measured,
        caseId: c.caseId,
        claimSectionRef: claimRef,
        materiality: prior?.materiality ?? "(unknown)",
        priorCredit: prior?.credit ?? "(unknown)",
        priorSurfacing: prior?.binarySurfacing ?? "(unknown)",
        priorDangerousSilentOmission: Boolean(prior?.dangerousSilentOmission),
        relevantCandidateIds: relevant.map((r) => r.discoveryId),
        compiledAtAddress: ok.length,
        failedAtAddress: failed.length,
        substantiveRepresentations: substantive.length,
        partialRepresentations: partials.length,
        honestAbstentions: abstentions.length,
        pilotCredit: credit,
        pilotSurfacing: surfacing,
        pilotDangerousSilentOmission: measured && credit === "NO_CREDIT" && surfacing === "NOT_SPECIFICALLY_SURFACED",
        providerRefusedCandidates: providerRefused.length,
        substantiveRepresentationNowExists: substantive.length > 0,
        requiredEscalation: relevant.some((r) => r.escalated),
        modelQualityUncertaintyRemains: failed.length > 0 || substantive.length === 0,
        modelQualityNote:
          failed.length > 0
            ? `${failed.length} relevant candidate(s) failed to execute; a stronger model might succeed where this one did not, so a NO_CREDIT here is not evidence about the architecture`
            : substantive.length === 0
              ? "compilation executed cleanly but produced no sufficient rule at this address; that is a representation-quality result, still under a cheaper model than production's configured one"
              : "compilation executed and produced a sufficient rule; model-quality risk here is that a cheaper model's rule may be shallower than production's, not that it is absent",
      };
    })
    .sort((a: CaseOutcome, b: CaseOutcome) => a.caseId.localeCompare(b.caseId));

  const measured = outcomes.filter((o: CaseOutcome) => o.measured);

  return {
    cases: outcomes,
    deltas: {
      // Every delta is computed over MEASURED cases only. Mixing in cases the provider
      // never served would let an unmeasured case masquerade as an improvement or a
      // regression depending only on which direction flattered the result.
      casesMeasured: measured.length,
      casesNotMeasured: outcomes.length - measured.length,
      creditBefore: measured.filter((o) => o.priorCredit === "CREDIT").length,
      creditAfter: measured.filter((o) => o.pilotCredit === "CREDIT").length,
      dangerousBefore: measured.filter((o) => o.priorDangerousSilentOmission).length,
      dangerousAfter: measured.filter((o) => o.pilotDangerousSilentOmission).length,
      surfacedBefore: measured.filter((o) => o.priorSurfacing === "SPECIFICALLY_SURFACED").length,
      surfacedAfter: measured.filter((o) => o.pilotSurfacing === "SPECIFICALLY_SURFACED").length,
      newSubstantiveRepresentations: measured.reduce((n, o) => n + o.substantiveRepresentations, 0),
      newPartialRepresentations: measured.reduce((n, o) => n + o.partialRepresentations, 0),
    },
    mappingRule:
      "A candidate is relevant to a case when its normalized ref is the claim address or a descendant of it. Credit requires a non-FAILED compilation with at least one rule the model itself marked COMPLETE. PARTIAL surfaces but does not credit. Surfacing requires any rule or definition at the address. Honest abstentions surface but never credit.",
  };
}
