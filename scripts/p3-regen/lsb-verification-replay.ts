/**
 * §6 — LSB verification replay against the UNCHANGED current production verifier.
 *
 * The LSB dataset's frozen evidence carries JUDGMENT_REQUIRED demotions produced by a
 * legacy Phase-C verification stage. The question this mission has to answer — Question 4
 * — is narrower than "was the legacy demotion right?": it is whether the CURRENT
 * production verifier, `verifyRuleAgainstSource`, still demotes a composed citation
 * (a subsection address such as "Section 6.03(a)") that the agreement's own text never
 * prints as a literal string, even though the parent section is present verbatim.
 *
 * This replay costs nothing: `verifyRuleAgainstSource` is pure and deterministic. It
 * reads the real LSB source text and the real citation strings the frozen packet carries,
 * and runs them through the production function with no modification of any kind.
 *
 * Forensic tooling. Nothing in the production pipeline imports it.
 */
import fs from "node:fs";
import path from "node:path";
import { verifyRuleAgainstSource } from "../../lib/contract-model/analyzer/verify";
import type { CandidateContractRule } from "../../lib/contract-model/types";
import { P, readJson } from "./evidence-provenance";

const ROOT = process.cwd();
const LSB_DIR = "tests/fixtures/unseen-packages/lsb-2023-abl-credit-agreement";

/**
 * The source text a current-pipeline LSB compilation would verify against: the
 * agreement's own text as this repository holds it. Concatenated in file order so the
 * replay cannot be accused of hiding a section in a file it chose not to read.
 */
export function lsbSourceText(): string {
  return ["article-6-negative-covenants.txt", "definitions-excerpt.txt", "intercreditor-joinder.txt"]
    .map((f) => fs.readFileSync(path.join(ROOT, LSB_DIR, f), "utf8"))
    .join("\n\n");
}

/** Every distinct citation the frozen LSB evidence actually carries on a compiled rule. */
export function frozenLsbCitations(): string[] {
  const packet = readJson(P.packet);
  const refs = new Set<string>();
  for (const c of packet.cases.filter((c: any) => c.documentId === "lsb")) {
    for (const s of c.systemOutput) {
      if (s.representationType === "COMPILED_IR_RULE" || s.representationType === "COMPILED_IR_DEFINITION") {
        const ref = s.sourceSectionRef ?? s.sectionRef;
        if (ref) refs.add(String(ref));
      }
    }
  }
  return [...refs].sort();
}

/**
 * A citation that is deliberately absent from the agreement. It is the control: if it
 * did NOT demote, the replay would be measuring nothing.
 */
export const CONTROL_MISCITATION = "Section 99.99";

export interface ReplayRow {
  citation: string;
  origin: "frozen-lsb-evidence" | "control";
  /** Does the citation string appear in the source under the production matcher? */
  citationResolved: boolean;
  /** Is the citation composed (a subsection address) rather than a bare section? */
  composed: boolean;
  /** Does the PARENT section (the citation with its subsection suffix stripped) resolve? */
  parentResolved: boolean;
  outcome: "PASSED" | "DEMOTED";
  demotionNote: string | null;
}

function stripSubsection(citation: string): string {
  return citation.replace(/\([^)]*\)\s*$/, "").trim();
}

/** Runs the unchanged production verifier over each citation. No model call, no cost. */
export function replay(): ReplayRow[] {
  const source = lsbSourceText();
  const citations = [...frozenLsbCitations(), CONTROL_MISCITATION];

  return citations.map((citation): ReplayRow => {
    const rule = {
      ruleId: "replay",
      ruleType: "OTHER",
      description: "verification replay probe",
      evaluationClass: "DETERMINISTIC",
      sourceSectionRef: citation,
      notes: null,
    } as unknown as CandidateContractRule;

    const out = verifyRuleAgainstSource(rule, source);
    const demoted = out.evaluationClass === "JUDGMENT_REQUIRED";
    const parent = stripSubsection(citation);
    const parentRule = { ...rule, sourceSectionRef: parent } as CandidateContractRule;
    const parentDemoted = verifyRuleAgainstSource(parentRule, source).evaluationClass === "JUDGMENT_REQUIRED";

    return {
      citation,
      origin: citation === CONTROL_MISCITATION ? "control" : "frozen-lsb-evidence",
      citationResolved: !demoted,
      composed: parent !== citation,
      parentResolved: !parentDemoted,
      outcome: demoted ? "DEMOTED" : "PASSED",
      demotionNote: demoted ? String(out.notes ?? "") : null,
    };
  });
}

/** The Question-4 answer, derived from the replay rather than asserted. */
export function question4() {
  const rows = replay();
  const composedDemotedWithLiveParent = rows.filter((r) => r.origin === "frozen-lsb-evidence" && r.composed && r.outcome === "DEMOTED" && r.parentResolved);
  const control = rows.find((r) => r.origin === "control")!;

  return {
    question:
      "Does the current production verifier still demote a compiled rule whose cited subsection address is not printed verbatim in the source, even when the parent section IS present?",
    answer: composedDemotedWithLiveParent.length > 0 ? "YES — still reproduces in current production" : "NO — current production no longer demotes these",
    controlBehavedCorrectly: control.outcome === "DEMOTED",
    verifierUnchangedByThisMission: true,
    costUsd: 0,
    modelCalls: 0,
    citationsReplayed: rows.length,
    demotedCitations: rows.filter((r) => r.outcome === "DEMOTED").map((r) => r.citation),
    passedCitations: rows.filter((r) => r.outcome === "PASSED").map((r) => r.citation),
    composedDemotionsWithResolvingParent: composedDemotedWithLiveParent.map((r) => r.citation),
    mechanism:
      "findCitationIndex() is whitespace-tolerant but still literal: it looks for the citation string itself. An agreement that prints 'SECTION 6.03' as a header and then '(a)' as an indented clause never contains the literal 'Section 6.03(a)', so a correct subsection citation fails the lookup and the rule is demoted to JUDGMENT_REQUIRED.",
    scopeNote:
      "§6 forbids fixing verification in this mission. This replay only establishes that the behaviour is current, so that a future remediation mission has a measured starting point.",
    rows,
  };
}

if (process.argv[1] && process.argv[1].endsWith("lsb-verification-replay.ts")) {
  const q = question4();
  console.log(JSON.stringify({ ...q, rows: undefined }, null, 2));
  console.table(q.rows.map((r) => ({ citation: r.citation, origin: r.origin, composed: r.composed, parentResolved: r.parentResolved, outcome: r.outcome })));
}
