/**
 * Independent evaluation harness for Phase-4 analyzer.
 * Does not train/tune on held-out cases.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  analyzeGibraltar706,
  analyzeRiot502,
  type AnalyzedException,
} from "./analyzer";
import { entityScopeOverlaps } from "./entity-scope";
import { crossRefOverlaps } from "./cross-reference";

export interface GtItem {
  gtId: string;
  kind: string;
  sectionRef: string;
  summary: string;
  expectedClassification?: string;
  remoteConditionsExpected?: string[];
  provisoAttachmentExpected?: string;
  entityScopeExpected?: string[];
  crossRefsExpected?: string[];
  expectedRefusal?: string;
  polarity?: "POSITIVE" | "NEGATIVE";
}

export interface MetricCell {
  value: number | null;
  numerator: number;
  denominator: number;
  status: "MEASURED";
  evidence?: string[];
}

function scoreRemote(pred: AnalyzedException, expected: string[]): boolean {
  if (!expected.length) return false;
  const predBlob = pred.predictedRemoteConditions.join(" || ").toLowerCase();
  // Require at least one expected remote theme to match
  let hits = 0;
  for (const e of expected) {
    const el = e.toLowerCase();
    if (el.includes("closing date") && predBlob.includes("closing date")) hits++;
    else if (el.includes("loan document") && predBlob.includes("loan document")) hits++;
    else if (el.includes("parent") && predBlob.includes("parent")) hits++;
    else if (el.includes("acquisition") && predBlob.includes("acquisition")) hits++;
    else if (el.includes("nested") && predBlob.includes("nested")) hits++;
    else if (el.includes("subsequent") && predBlob.includes("subsequent")) hits++;
    else if (el.includes("transaction documents") && predBlob.includes("transaction documents")) hits++;
    else if (el.includes("initial agreement") && predBlob.includes("initial agreement")) hits++;
    else if (el.includes("collateral") && predBlob.includes("collateral")) hits++;
    else if (el.includes("contest") && predBlob.includes("contest")) hits++;
    else if (el.includes("local contest") && predBlob.includes("local contest")) hits++;
    else if (predBlob.includes(el.slice(0, 24))) hits++;
  }
  return hits > 0;
}

function scoreProviso(pred: AnalyzedException, expected: string): boolean {
  const p = pred.predictedProvisoAttachment;
  if (expected === "PARENT_PROVISO_MAY_INTERACT") {
    return p === "PARENT_PROVISO_MAY_INTERACT" || p === "SECTION_WIDE";
  }
  if (expected === "HANGING") {
    return p === "HANGING" || p === "OWN_CLAUSE" || p === "MULTI_LIMB";
  }
  return p === expected;
}

export function evaluateAgainstGt(
  predictions: AnalyzedException[],
  gtItems: GtItem[],
  label: string,
): {
  label: string;
  metrics: Record<string, MetricCell>;
  denominators: Record<string, number>;
  confusion: { tp: string[]; fp: string[]; fn: string[] };
} {
  const gtExceptions = gtItems.filter((i) => i.kind === "EXCEPTION");
  const gtRefs = new Set(gtExceptions.map((i) => i.sectionRef));
  const detRefs = new Set(predictions.map((p) => p.sectionRef));
  const tp = [...gtRefs].filter((r) => detRefs.has(r)).sort();
  const fp = [...detRefs].filter((r) => !gtRefs.has(r)).sort();
  const fn = [...gtRefs].filter((r) => !detRefs.has(r)).sort();

  const byRef = new Map(predictions.map((p) => [p.sectionRef, p]));

  // Remote-condition recall
  const gtRemote = gtExceptions.filter((i) => (i.remoteConditionsExpected ?? []).length > 0);
  let remoteTp = 0;
  const remoteEvidence: string[] = [];
  for (const g of gtRemote) {
    const p = byRef.get(g.sectionRef);
    if (p && scoreRemote(p, g.remoteConditionsExpected ?? [])) {
      remoteTp++;
      remoteEvidence.push(`${g.sectionRef}: ${p.predictedRemoteConditions.join("; ")}`);
    }
  }

  // Proviso attachment
  const gtProviso = gtExceptions.filter((i) => i.provisoAttachmentExpected);
  let provisoOk = 0;
  const provisoEvidence: string[] = [];
  for (const g of gtProviso) {
    const p = byRef.get(g.sectionRef);
    if (p && scoreProviso(p, g.provisoAttachmentExpected!)) {
      provisoOk++;
      provisoEvidence.push(`${g.sectionRef}: ${p.predictedProvisoAttachment}`);
    }
  }

  // Entity scope
  const gtEntity = gtExceptions.filter((i) => (i.entityScopeExpected ?? []).length > 0);
  let entityOk = 0;
  const entityEvidence: string[] = [];
  for (const g of gtEntity) {
    const p = byRef.get(g.sectionRef);
    if (p && entityScopeOverlaps(p.entityScope, g.entityScopeExpected ?? [])) {
      entityOk++;
      entityEvidence.push(`${g.sectionRef}: ${p.predictedEntityScope.join(", ")}`);
    }
  }

  // Cross-ref
  const gtCross = gtExceptions.filter((i) => (i.crossRefsExpected ?? []).length > 0);
  let crossOk = 0;
  const crossEvidence: string[] = [];
  for (const g of gtCross) {
    const p = byRef.get(g.sectionRef);
    if (p && crossRefOverlaps(p.crossReferences, g.crossRefsExpected ?? [])) {
      crossOk++;
      crossEvidence.push(`${g.sectionRef}: ${p.predictedCrossRefs.join(", ")}`);
    }
  }

  // Incorrect unconditional
  const gtCond = gtExceptions.filter((i) => i.expectedClassification === "CONDITIONAL");
  let incorrectUncond = 0;
  for (const g of gtCond) {
    const p = byRef.get(g.sectionRef);
    if (p?.predictedClassification === "UNCONDITIONAL_SOURCE_VERIFIED") incorrectUncond++;
  }

  // Unsupported-case refusal: GT expecting AMBIGUOUS refusal or nested complex cases
  const gtRefusal = gtExceptions.filter(
    (i) => i.expectedRefusal === "AMBIGUOUS_CONDITION_SCOPE" || (i.remoteConditionsExpected ?? []).some((r) => /nested/i.test(r)),
  );
  let refusalOk = 0;
  const refusalEvidence: string[] = [];
  for (const g of gtRefusal) {
    const p = byRef.get(g.sectionRef);
    if (!p) continue;
    const refused =
      p.unsupportedRefusal === "AMBIGUOUS_CONDITION_SCOPE" ||
      p.predictedProvisoAttachment === "AMBIGUOUS" ||
      p.predictedClassification !== "UNCONDITIONAL_SOURCE_VERIFIED";
    // For nested cases, correct refusal = not claiming unconditional + surfacing nested remote or ambiguous attachment
    if (
      refused &&
      (p.unsupportedRefusal === "AMBIGUOUS_CONDITION_SCOPE" ||
        p.predictedRemoteConditions.some((r) => /nested/i.test(r)) ||
        p.predictedClassification === "CONDITIONAL")
    ) {
      // Stricter: count only explicit ambiguous refusal OR nested remote surfaced without unconditional
      if (
        p.unsupportedRefusal === "AMBIGUOUS_CONDITION_SCOPE" ||
        p.predictedRemoteConditions.some((r) => /nested/i.test(r))
      ) {
        refusalOk++;
        refusalEvidence.push(
          `${g.sectionRef}: refusal=${p.unsupportedRefusal ?? "none"} remote=${p.predictedRemoteConditions.join("|")}`,
        );
      }
    }
  }

  const metrics: Record<string, MetricCell> = {
    exceptionDiscoveryPrecision: {
      value: detRefs.size ? tp.length / detRefs.size : null,
      numerator: tp.length,
      denominator: detRefs.size,
      status: "MEASURED",
    },
    exceptionDiscoveryRecall: {
      value: gtRefs.size ? tp.length / gtRefs.size : null,
      numerator: tp.length,
      denominator: gtRefs.size,
      status: "MEASURED",
    },
    remoteConditionRecall: {
      value: gtRemote.length ? remoteTp / gtRemote.length : null,
      numerator: remoteTp,
      denominator: gtRemote.length,
      status: "MEASURED",
      evidence: remoteEvidence,
    },
    provisoAttachmentAccuracy: {
      value: gtProviso.length ? provisoOk / gtProviso.length : null,
      numerator: provisoOk,
      denominator: gtProviso.length,
      status: "MEASURED",
      evidence: provisoEvidence,
    },
    entityScopeFidelity: {
      value: gtEntity.length ? entityOk / gtEntity.length : null,
      numerator: entityOk,
      denominator: gtEntity.length,
      status: "MEASURED",
      evidence: entityEvidence,
    },
    crossReferenceAccuracy: {
      value: gtCross.length ? crossOk / gtCross.length : null,
      numerator: crossOk,
      denominator: gtCross.length,
      status: "MEASURED",
      evidence: crossEvidence,
    },
    incorrectUnconditionalPermissionRate: {
      value: gtCond.length ? incorrectUncond / gtCond.length : null,
      numerator: incorrectUncond,
      denominator: gtCond.length,
      status: "MEASURED",
    },
    unsupportedCaseRefusal: {
      value: gtRefusal.length ? refusalOk / gtRefusal.length : null,
      numerator: refusalOk,
      denominator: gtRefusal.length,
      status: "MEASURED",
      evidence: refusalEvidence,
    },
  };

  return {
    label,
    metrics,
    denominators: {
      gtExceptionCount: gtExceptions.length,
      detectorHitCount: predictions.length,
      gtWithRemoteConditionsExpected: gtRemote.length,
      gtWithProvisoAttachmentExpected: gtProviso.length,
      gtWithEntityScopeExpected: gtEntity.length,
      crossReferenceCases: gtCross.length,
      gtConditionalForUncondRate: gtCond.length,
      unsupportedRefusalCases: gtRefusal.length,
    },
    confusion: { tp, fp, fn },
  };
}

export function loadFrozenPhase3Gt(workspaceRoot = process.cwd()): {
  document: { issuerKey: string; sourcePath: string; sourceSha256: string };
  items: GtItem[];
} {
  const path = resolve(
    workspaceRoot,
    "docs/negative-covenant-exception-database/phase-4/held-out/frozen-phase3-gibraltar-7.06-gt.json",
  );
  return JSON.parse(readFileSync(path, "utf8"));
}

export function runPhase4Evaluations(workspaceRoot = process.cwd()): {
  frozenPhase3: ReturnType<typeof evaluateAgainstGt>;
  riotDisjoint: ReturnType<typeof evaluateAgainstGt>;
  predictions: { gibraltar: AnalyzedException[]; riot: AnalyzedException[] };
} {
  const frozen = loadFrozenPhase3Gt(workspaceRoot);
  const gibPath = resolve(workspaceRoot, frozen.document.sourcePath);
  const gibText = readFileSync(gibPath, "utf8");
  const gibAnalysis = analyzeGibraltar706(gibText);

  const frozenEval = evaluateAgainstGt(gibAnalysis.exceptions, frozen.items, "frozen-phase3-gibraltar-7.06");

  const riotGtPath = resolve(
    workspaceRoot,
    "docs/negative-covenant-exception-database/phase-4/held-out/riot-5.02-issuer-disjoint-gt.json",
  );
  const riotGt = JSON.parse(readFileSync(riotGtPath, "utf8")) as {
    document: { sourcePath: string };
    items: GtItem[];
  };
  const riotText = readFileSync(resolve(workspaceRoot, riotGt.document.sourcePath), "utf8");
  const riotPreds = analyzeRiot502(riotText);
  const riotEval = evaluateAgainstGt(riotPreds, riotGt.items, "issuer-disjoint-riot-5.02");

  return {
    frozenPhase3: frozenEval,
    riotDisjoint: riotEval,
    predictions: { gibraltar: gibAnalysis.exceptions, riot: riotPreds },
  };
}
