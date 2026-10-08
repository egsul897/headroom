/**
 * Offline CKG scorer — deterministic, zero paid calls.
 *
 * Distinguishes UNLABELED from SUCCESS/FAILURE. Never promotes a model
 * prediction into ground truth.
 */
import type {
  CaseOutcome,
  CaseResult,
  CkgCase,
  MetricId,
  MetricScore,
  StratifiedSlice,
  SystemCandidate,
} from "./types";

function asRecord(v: unknown): Record<string, unknown> | null {
  return v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function normalizeString(v: unknown): string {
  return String(v ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function setEqual(a: string[], b: string[]): boolean {
  const A = new Set(a.map((x) => normalizeString(x)));
  const B = new Set(b.map((x) => normalizeString(x)));
  if (A.size !== B.size) return false;
  for (const x of A) if (!B.has(x)) return false;
  return true;
}

function includesAll(hay: string[], needles: string[]): boolean {
  const H = new Set(hay.map((x) => normalizeString(x)));
  return needles.every((n) => H.has(normalizeString(n)));
}

function recall(found: string[], expected: string[]): { hit: number; total: number } {
  const F = new Set(found.map((x) => normalizeString(x)));
  const total = expected.length;
  const hit = expected.filter((e) => F.has(normalizeString(e))).length;
  return { hit, total };
}

function comparePredictions(metric: MetricId, expected: unknown, prediction: unknown): { ok: boolean; detail: string } {
  const exp = asRecord(expected) ?? { value: expected };
  const pred = asRecord(prediction);

  switch (metric) {
    case "covenant_family_discovery_recall": {
      const expectedFamilies = (exp.families as string[]) ?? [];
      const predictedFamilies = (pred?.families as string[]) ?? [];
      // Empty expected set = correct absence (do not invent families).
      if (expectedFamilies.length === 0) {
        const ok = predictedFamilies.length === 0;
        return {
          ok,
          detail: `family absence check; predicted=[${predictedFamilies.join(",")}] expected=[]`,
        };
      }
      const { hit, total } = recall(predictedFamilies, expectedFamilies);
      const ok = hit === total;
      return {
        ok,
        detail: `family recall ${hit}/${total}; predicted=[${predictedFamilies.join(",")}] expected=[${expectedFamilies.join(",")}]`,
      };
    }
    case "definition_extraction_accuracy": {
      const expectedTerms = (exp.terms as string[]) ?? [];
      const predictedTerms = (pred?.terms as string[]) ?? [];
      const requireExact = Boolean(exp.requireExact);
      const ok = requireExact ? setEqual(predictedTerms, expectedTerms) : includesAll(predictedTerms, expectedTerms);
      return {
        ok,
        detail: `defs predicted=${predictedTerms.length} expected=${expectedTerms.length} exact=${requireExact} ok=${ok}`,
      };
    }
    case "cross_reference_accuracy": {
      const expectedTargets = (exp.resolvedTargets as string[]) ?? [];
      const predictedTargets = (pred?.resolvedTargets as string[]) ?? [];
      const unresolvedOk = Boolean(exp.allowUnresolved) && Boolean(pred?.unresolved);
      const { hit, total } = recall(predictedTargets, expectedTargets);
      const ok = unresolvedOk || (total > 0 && hit === total);
      return { ok, detail: `xref hit=${hit}/${total} unresolvedOk=${unresolvedOk}` };
    }
    case "condition_recall": {
      const expectedConds = (exp.conditions as string[]) ?? [];
      const predictedConds = (pred?.conditions as string[]) ?? [];
      const { hit, total } = recall(predictedConds, expectedConds);
      const ok = total > 0 && hit === total;
      return { ok, detail: `conditions ${hit}/${total}` };
    }
    case "exception_recall": {
      const expectedEx = (exp.exceptions as string[]) ?? [];
      const predictedEx = (pred?.exceptions as string[]) ?? [];
      const { hit, total } = recall(predictedEx, expectedEx);
      const ok = total > 0 && hit === total;
      return { ok, detail: `exceptions ${hit}/${total}` };
    }
    case "entity_scope_accuracy": {
      const expectedScope = normalizeString(exp.entityScope);
      const predictedScope = normalizeString(pred?.entityScope);
      const ok = expectedScope.length > 0 && predictedScope === expectedScope;
      return { ok, detail: `scope predicted="${predictedScope}" expected="${expectedScope}"` };
    }
    case "amendment_reconstruction": {
      const expectedRel = normalizeString(exp.relationship);
      const predictedRel = normalizeString(pred?.relationship);
      const expectedStatus = normalizeString(exp.status ?? "resolved");
      const predictedStatus = normalizeString(pred?.status ?? "");
      const ok = expectedRel === predictedRel && (expectedStatus === "" || expectedStatus === predictedStatus);
      return { ok, detail: `rel="${predictedRel}" status="${predictedStatus}" vs "${expectedRel}"/"${expectedStatus}"` };
    }
    case "shared_capacity_recognition": {
      const expectedShared = Boolean(exp.isSharedCapacity);
      const predictedShared = Boolean(pred?.isSharedCapacity);
      const memberOk =
        !expectedShared ||
        !Array.isArray(exp.memberRefs) ||
        includesAll((pred?.memberRefs as string[]) ?? [], exp.memberRefs as string[]);
      const ok = expectedShared === predictedShared && memberOk;
      return { ok, detail: `shared expected=${expectedShared} predicted=${predictedShared} memberOk=${memberOk}` };
    }
    case "comparator_correctness": {
      const expectedComp = normalizeString(exp.comparator);
      const predictedComp = normalizeString(pred?.comparator);
      const expectedThreshold = normalizeString(exp.threshold);
      const predictedThreshold = normalizeString(pred?.threshold ?? "");
      const ok =
        expectedComp === predictedComp &&
        (expectedThreshold === "" || expectedThreshold === predictedThreshold);
      return { ok, detail: `comparator="${predictedComp}" threshold="${predictedThreshold}"` };
    }
    case "false_permission_rate": {
      // SUCCESS means the system did NOT emit a false permission (safe).
      // FAILURE means it affirmatively permitted when it should not.
      const shouldDeny = Boolean(exp.shouldDeny);
      const systemPermitted = Boolean(pred?.permitted === true || pred?.status === "PERMITTED");
      const falsePermission = shouldDeny && systemPermitted;
      return {
        ok: !falsePermission,
        detail: `shouldDeny=${shouldDeny} systemPermitted=${systemPermitted} falsePermission=${falsePermission}`,
      };
    }
    case "unsupported_semantic_refusal": {
      const expectedRefusal = Boolean(exp.mustRefuse);
      const refused = Boolean(
        pred?.refused === true ||
          pred?.status === "UNSUPPORTED" ||
          pred?.status === "HONESTLY_UNSUPPORTED" ||
          pred?.status === "REVIEW_REQUIRED",
      );
      const coerced = Boolean(pred?.coercedRepresentation === true);
      const ok = expectedRefusal ? refused && !coerced : !refused;
      return { ok, detail: `mustRefuse=${expectedRefusal} refused=${refused} coerced=${coerced}` };
    }
    case "provenance_accuracy": {
      const expectedCitation = normalizeString(exp.citationSectionRef);
      const predictedCitation = normalizeString(pred?.citationSectionRef);
      const excerptOk =
        !exp.requiresExcerpt ||
        (typeof pred?.excerpt === "string" && (pred.excerpt as string).length > 0);
      const ok = expectedCitation === predictedCitation && excerptOk;
      return { ok, detail: `citation="${predictedCitation}" excerptOk=${excerptOk}` };
    }
    case "unseen_document_performance": {
      // Aggregate proxy case: require the listed sub-outcomes all SUCCESS.
      const required = (exp.requiredCaseIds as string[]) ?? [];
      const reported = (pred?.successfulCaseIds as string[]) ?? [];
      const ok = required.length > 0 && includesAll(reported, required);
      return { ok, detail: `unseen subcases ${recall(reported, required).hit}/${required.length}` };
    }
    case "cost_per_source_verified_representation": {
      // Scored at report aggregation time; per-case always SUCCESS if cost recorded.
      const cost = typeof pred?.costUsd === "number" ? (pred.costUsd as number) : null;
      const ok = cost !== null && cost >= 0;
      return { ok, detail: `costUsd=${cost}` };
    }
    default: {
      const _exhaustive: never = metric;
      return { ok: false, detail: `unknown metric ${_exhaustive}` };
    }
  }
}

export function scoreCase(c: CkgCase, candidate: SystemCandidate | undefined): CaseResult {
  if (c.expected.authority === "UNLABELED") {
    return {
      caseId: c.caseId,
      metric: c.metric,
      outcome: "UNLABELED",
      authority: c.expected.authority,
      strata: c.strata,
      detail: c.expected.notes ?? "intentionally unlabeled",
      attributedCostUsd: c.attributedCostUsd ?? 0,
    };
  }

  if (!candidate || candidate.predictionSource === "ABSENT" || candidate.prediction === undefined) {
    return {
      caseId: c.caseId,
      metric: c.metric,
      outcome: "NOT_EVALUATED",
      authority: c.expected.authority,
      strata: c.strata,
      detail: "no system candidate available (offline, unpaid evaluation)",
      attributedCostUsd: c.attributedCostUsd ?? 0,
    };
  }

  const { ok, detail } = comparePredictions(c.metric, c.expected.value, candidate.prediction);
  const outcome: CaseOutcome = ok ? "SUCCESS" : "FAILURE";
  return {
    caseId: c.caseId,
    metric: c.metric,
    outcome,
    authority: c.expected.authority,
    strata: c.strata,
    detail,
    attributedCostUsd: c.attributedCostUsd ?? 0,
  };
}

export function aggregateMetrics(results: CaseResult[]): MetricScore[] {
  const metrics = Array.from(new Set(results.map((r) => r.metric)));
  return metrics.map((metric) => {
    const rows = results.filter((r) => r.metric === metric);
    const success = rows.filter((r) => r.outcome === "SUCCESS").length;
    const failure = rows.filter((r) => r.outcome === "FAILURE").length;
    const unlabeled = rows.filter((r) => r.outcome === "UNLABELED").length;
    const notEvaluated = rows.filter((r) => r.outcome === "NOT_EVALUATED").length;
    const labeled = success + failure;
    const lowerIsBetter = metric === "false_permission_rate";
    // For false_permission_rate the "rate" is failure/(success+failure) (false permission incidence).
    const rate =
      labeled === 0 ? null : lowerIsBetter ? failure / labeled : success / labeled;
    const sourceVerifiedSuccesses = rows.filter(
      (r) => r.outcome === "SUCCESS" && r.authority === "SOURCE_VERIFIED",
    );
    return {
      metric,
      evaluated: labeled,
      success,
      failure,
      unlabeled,
      notEvaluated,
      rate,
      lowerIsBetter,
      costUsdOnSourceVerifiedSuccesses: sourceVerifiedSuccesses.reduce((s, r) => s + r.attributedCostUsd, 0),
      sourceVerifiedSuccesses: sourceVerifiedSuccesses.length,
    };
  });
}

export function stratify(results: CaseResult[]): StratifiedSlice[] {
  const dims: Array<StratifiedSlice["dimension"]> = [
    "agreementType",
    "issuer",
    "covenantFamily",
    "draftingComplexity",
  ];
  const out: StratifiedSlice[] = [];
  for (const dimension of dims) {
    const values = new Set(results.map((r) => String(r.strata[dimension])));
    for (const value of values) {
      const rows = results.filter((r) => String(r.strata[dimension]) === value);
      const success = rows.filter((r) => r.outcome === "SUCCESS").length;
      const failure = rows.filter((r) => r.outcome === "FAILURE").length;
      const unlabeled = rows.filter((r) => r.outcome === "UNLABELED").length;
      const labeled = success + failure;
      out.push({
        key: `${dimension}=${value}`,
        dimension,
        value,
        cases: rows.length,
        success,
        failure,
        unlabeled,
        rate: labeled === 0 ? null : success / labeled,
      });
    }
  }
  return out.sort((a, b) => a.key.localeCompare(b.key));
}

export function costPerSourceVerified(results: CaseResult[]): number | null {
  const sv = results.filter((r) => r.outcome === "SUCCESS" && r.authority === "SOURCE_VERIFIED");
  if (sv.length === 0) return null;
  const cost = sv.reduce((s, r) => s + r.attributedCostUsd, 0);
  return cost / sv.length;
}

export function runBenchmark(cases: CkgCase[], candidates: SystemCandidate[]): CaseResult[] {
  const byId = new Map(candidates.map((c) => [c.caseId, c]));
  return cases.map((c) => scoreCase(c, byId.get(c.caseId)));
}
