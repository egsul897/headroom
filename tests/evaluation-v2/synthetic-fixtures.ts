/**
 * Evaluation Methodology V2 — synthetic fixture builders for the adversarial
 * suite and the false-credit prohibition regression tests.
 *
 * Phase 3F.1.5. Every fixture here is INVENTED drafting, written to isolate one
 * semantic distinction at a time. None of it is copied from, or tuned to, any
 * real package: the point is to prove the evaluator's rules, not its behaviour
 * on a particular document.
 *
 * All synthetic candidates default to accountingRole
 * SUBSTANTIVE_REPRESENTATION so that a refusal in these tests can only come
 * from the semantic-correspondence layers, never from the accounting gate.
 */
import { buildCandidate, buildGroundTruthUnit, EMPTY_SELF_REPORT } from "@/lib/contract-model/evaluation-v2/adapters/common";
import type {
  CandidateAccountingRole,
  CandidateSemanticRepresentation,
  EvaluationMateriality,
  GroundTruthSemanticUnit,
} from "@/lib/contract-model/evaluation-v2/types";

export const SYNTHETIC_DATASET = "evaluation-v2-adversarial-suite";

export interface SyntheticGtInput {
  id: string;
  sectionRef: string;
  text: string;
  unitType?: string;
  materiality?: EvaluationMateriality;
  documentId?: string;
  definedTerms?: string[];
  notes?: string;
}

export function gt(input: SyntheticGtInput): GroundTruthSemanticUnit {
  return buildGroundTruthUnit({
    gtUnitId: input.id,
    datasetKey: SYNTHETIC_DATASET,
    packageKey: SYNTHETIC_DATASET,
    documentId: input.documentId ?? "synthetic-doc-a",
    sectionRef: input.sectionRef,
    articleRef: null,
    sourceExcerpt: input.text,
    sourceExcerptResolution: "PROVIDED_BY_GROUND_TRUTH",
    semanticDescription: input.text,
    materiality: input.materiality ?? "CRITICAL",
    unitType: input.unitType ?? "COVENANT",
    referencedDefinedTerms: input.definedTerms ?? [],
    materialDependencies: [],
    operativeStateAssumption: `as stated in ${input.documentId ?? "synthetic-doc-a"}`,
    adjudication: {
      kind: "HUMAN_AUTHORED_NOT_EXTERNALLY_REVIEWED",
      sourceStatement: "synthetic adversarial fixture authored for the Evaluation V2 regression suite",
      authoredAt: null,
      sourceArtifactPath: "tests/evaluation-v2/synthetic-fixtures.ts",
      externallyHumanReviewed: false,
    },
    notes: input.notes ?? null,
  });
}

export interface SyntheticCandidateInput {
  id: string;
  sectionRef: string | null;
  text: string;
  declaredRole?: string | null;
  documentId?: string;
  accountingRole?: CandidateAccountingRole;
  definedTerms?: string[];
  selfReport?: Partial<CandidateSemanticRepresentation["selfReportedState"]>;
}

export function candidate(input: SyntheticCandidateInput): CandidateSemanticRepresentation {
  return buildCandidate({
    candidateId: input.id,
    datasetKey: SYNTHETIC_DATASET,
    packageKey: SYNTHETIC_DATASET,
    documentId: input.documentId ?? "synthetic-doc-a",
    sectionRef: input.sectionRef,
    representationType: "SYNTHETIC_TEST_CANDIDATE",
    accountingRole: input.accountingRole ?? "SUBSTANTIVE_REPRESENTATION",
    excerpts: [input.text],
    normalizedSemantics: input.text,
    provisionRoleDeclared: input.declaredRole ?? null,
    declaredFamily: null,
    formulaSemantics: null,
    dependencyRefs: [],
    referencedDefinedTerms: input.definedTerms ?? [],
    selfReportedState: { ...EMPTY_SELF_REPORT, ...(input.selfReport ?? {}) },
    operativeProvenance: { documentId: input.documentId ?? "synthetic-doc-a", operativeVersionRef: null, sourceCitation: input.sectionRef },
    provenancePath: "tests/evaluation-v2/synthetic-fixtures.ts",
  });
}
