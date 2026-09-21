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
 *    is SUFFICIENT. A rule the model itself marked UNSUPPORTED or MISSING_CONTEXT is an
 *    honest abstention — which is the safe outcome, and deliberately not credit.
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

export interface CaseOutcome {
  caseId: string;
  claimSectionRef: string;
  materiality: string;
  priorCredit: string;
  priorSurfacing: string;
  priorDangerousSilentOmission: boolean;
  relevantCandidateIds: string[];
  compiledAtAddress: number;
  failedAtAddress: number;
  substantiveRepresentations: number;
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
      const substantive = ok.filter((r) => (r.sufficiencySummary.SUFFICIENT ?? 0) > 0);
      const abstentions = ok.filter((r) => (r.sufficiencySummary.SUFFICIENT ?? 0) === 0 && r.rules > 0);
      const saidSomething = ok.filter((r) => r.rules > 0 || r.definitions > 0);
      const prior = rowById.get(c.caseId);

      const credit = substantive.length > 0 ? "CREDIT" : "NO_CREDIT";
      const surfacing = saidSomething.length > 0 ? "SPECIFICALLY_SURFACED" : "NOT_SPECIFICALLY_SURFACED";

      return {
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
        honestAbstentions: abstentions.length,
        pilotCredit: credit,
        pilotSurfacing: surfacing,
        pilotDangerousSilentOmission: credit === "NO_CREDIT" && surfacing === "NOT_SPECIFICALLY_SURFACED",
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

  return {
    cases: outcomes,
    deltas: {
      creditBefore: outcomes.filter((o) => o.priorCredit === "CREDIT").length,
      creditAfter: outcomes.filter((o) => o.pilotCredit === "CREDIT").length,
      dangerousBefore: outcomes.filter((o) => o.priorDangerousSilentOmission).length,
      dangerousAfter: outcomes.filter((o) => o.pilotDangerousSilentOmission).length,
      surfacedBefore: outcomes.filter((o) => o.priorSurfacing === "SPECIFICALLY_SURFACED").length,
      surfacedAfter: outcomes.filter((o) => o.pilotSurfacing === "SPECIFICALLY_SURFACED").length,
      newSubstantiveRepresentations: outcomes.reduce((n, o) => n + o.substantiveRepresentations, 0),
    },
    mappingRule:
      "A candidate is relevant to a case when its normalized ref is the claim address or a descendant of it. Credit requires a non-FAILED compilation with at least one rule the model itself marked SUFFICIENT. Surfacing requires any rule or definition at the address. Honest abstentions surface but never credit.",
  };
}
