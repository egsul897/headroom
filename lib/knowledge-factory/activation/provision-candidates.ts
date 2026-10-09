/**
 * Activate source-backed v2 provision summaries into independently checkable
 * formula/threshold candidates — WITHOUT certification or Permission writes.
 *
 * Cycle 5: formula discovery is SEPARATE from legal-permission eligibility.
 * A plausible numeric formula alone must NOT yield EXECUTABLE_FORMULA_CANDIDATE.
 *
 * High-confidence mechanics (FLAT, ASSETS grower, EBITDA grower with resolved
 * defs) may become executable only after eligibility gates pass.
 * BUILDER / LEVERAGE stay behind strict review gates.
 */

import type { CovenantSummaryItem } from "../../product/covenant-intelligence/summarize";
import { parseCounselFormulaForTest } from "../../product/customer-intelligence/compile-accepted";

export type ActivationReadiness =
  | "EXECUTABLE_FORMULA_CANDIDATE"
  /** Formula shape discovered; not eligible as executable legal permission. */
  | "DISCOVERED_FORMULA"
  | "REVIEW_REQUIRED"
  | "NEEDS_DEFINITION_RESOLUTION"
  | "NEEDS_CROSS_REF_RESOLUTION"
  | "NEEDS_HUMAN_REVIEW"
  | "NOT_ACTIVATABLE"
  | "BLOCKED_SHARED_CAPACITY"
  | "BLOCKED_MECHANIC_GATE";

export type EligibilityGateId =
  | "source_text_sufficient"
  | "operative_document_identified"
  | "entity_scope_established"
  | "applicable_definitions_resolved"
  | "material_conditions_represented"
  | "shared_capacity_resolved_or_blocked"
  | "financial_inputs_identified"
  | "historical_utilization_status_established"
  | "legal_review_status_preserved"
  | "high_confidence_mechanic"
  | "formula_threshold_evidenced";

export interface EligibilityGateResult {
  gate: EligibilityGateId;
  ok: boolean;
  detail: string;
}

export interface ActivatedProvisionCandidate {
  sourceId: string;
  sectionRef: string;
  heading: string;
  families: string[];
  posture: string;
  readiness: ActivationReadiness;
  formulaType: string | null;
  thresholdValue: number | null;
  params: Record<string, unknown> | null;
  excerptEvidence: string;
  independentChecks: Array<{ check: string; ok: boolean; detail: string }>;
  eligibilityGates: EligibilityGateResult[];
  allChecksPassed: boolean;
  /** True only when readiness is EXECUTABLE_FORMULA_CANDIDATE. */
  executableEligible: boolean;
  certificationStatus: "NOT_CERTIFIED";
  unresolvedDependencies: string[];
  ownershipHints: string[];
  note: string;
}

/** Mechanics allowed to reach EXECUTABLE after gates (Cycle 5 priority). */
export const HIGH_CONFIDENCE_MECHANICS = new Set([
  "FLAT_AMOUNT",
  "GREATER_OF_FLAT_OR_PCT_EBITDA",
  "GREATER_OF_FLAT_OR_PCT_TOTAL_ASSETS",
]);

/** Mechanics retained as discovery only until defects cleared. */
export const STRICT_REVIEW_MECHANICS = new Set(["BUILDER_BASKET", "LEVERAGE_RATIO_ROOM", "RATIO_GATE"]);

const NON_OPERATIVE_SECTION =
  /\b(?:Notices?|Communications|Evidence of Indebtedness|Successor Trustee|Definitions?|Interpretation|Accounting Terms|Construction|Incremental\s+(?:Term\s+)?Facilit|Refinancing Amendment|Amend and Extend)\b/i;

/** Definitional / admin / incremental section refs that must not become executable from coincidental dollars. */
const NON_BASKET_SECTION_REF = /^(?:1\.0[01]|1\.1|2\.1[14]|2\.20|Article\s*I\b)/i;

const SHARED_CAPACITY_RE =
  /\b(?:combined with|shared (?:capacity|basket)|together with\b[\s\S]{0,120}?\b(?:pursuant to|under)\s+(?:Section|clause)|without duplication|pursuant to clauses?\s*\()/i;

function excerptHasMoney(excerpt: string, millions: number): boolean {
  const raw = millions >= 1 && millions < 10_000 ? millions * 1_000_000 : millions;
  const asM = millions;
  const patterns = [
    new RegExp(`\\$${asM.toLocaleString("en-US").replace(/,/g, "[,]?")}`),
    new RegExp(`\\$${raw.toLocaleString("en-US").replace(/,/g, "[,]?")}`),
    new RegExp(`${asM}\\s*million`, "i"),
    new RegExp(`\\$${asM}\\b`),
  ];
  return patterns.some((re) => re.test(excerpt));
}

function excerptHasPct(excerpt: string, pct: number): boolean {
  const display = (pct * 100).toFixed(1).replace(/\.0$/, "");
  return new RegExp(`${display}\\s*%`).test(excerpt) || new RegExp(`${pct * 100}\\s*%`).test(excerpt);
}

function hasEntityScope(_item: CovenantSummaryItem, excerpt: string): boolean {
  // Lexical evidence in the operative excerpt is required — structured flags alone
  // over-fired on Cycle 4 false-executables when entityScope was inferred elsewhere.
  return /\b(?:Borrower|Loan Part(?:y|ies)|Restricted Subsidiar|Guarantor|Parent)\b/i.test(excerpt);
}

/** Greater-of growers must show comparator + base in proximity (not distant co-mentions). */
function growerProximityOk(excerpt: string, formulaType: string): boolean {
  if (!formulaType.startsWith("GREATER_OF")) return true;
  if (formulaType.includes("EBITDA")) {
    return /greater of[\s\S]{0,220}?\bEBITDA\b|\bEBITDA\b[\s\S]{0,220}?greater of/i.test(excerpt);
  }
  if (formulaType.includes("TOTAL_ASSETS")) {
    return /greater of[\s\S]{0,220}?(?:Total Assets|total consolidated assets)|(?:Total Assets|total consolidated assets)[\s\S]{0,220}?greater of/i.test(
      excerpt,
    );
  }
  return /greater of/i.test(excerpt);
}

function evaluateEligibilityGates(params: {
  item: CovenantSummaryItem;
  excerpt: string;
  formulaType: string;
  thresholdValue: number;
  params: Record<string, unknown> | null;
  moneyOk: boolean;
  pctOk: boolean | null;
  unresolvedDefs: Array<{ term: string }>;
}): { gates: EligibilityGateResult[]; unresolved: string[]; ownership: string[] } {
  const { item, excerpt, formulaType, unresolvedDefs } = params;
  const gates: EligibilityGateResult[] = [];
  const unresolved: string[] = [];
  const ownership: string[] = [];

  const operativeVerb = /\b(?:shall not|may not|not to exceed|greater of|lesser of|Incur|create|assume)\b/i.test(
    excerpt,
  );
  const definitionalSection =
    NON_BASKET_SECTION_REF.test(item.sectionRef.trim()) ||
    (/\bmeans\b/i.test(excerpt) && /\bDefinitions?\b/i.test(item.heading));
  const sourceOk =
    excerpt.replace(/\s+/g, " ").trim().length >= 80 &&
    operativeVerb &&
    !NON_OPERATIVE_SECTION.test(item.heading) &&
    !NON_OPERATIVE_SECTION.test(item.sectionRef) &&
    !definitionalSection;
  gates.push({
    gate: "source_text_sufficient",
    ok: sourceOk,
    detail: sourceOk
      ? "excerpt length + operative verbs; heading not a non-covenant article"
      : definitionalSection
        ? "definitional / Article I section — not an executable basket"
        : "excerpt too thin, non-operative heading, or missing operative verbs",
  });
  if (!sourceOk) unresolved.push("source_text_incomplete");

  const docOk = Boolean(item.governingAgreement?.trim()) && Boolean(item.sourceCitation?.trim());
  gates.push({
    gate: "operative_document_identified",
    ok: docOk,
    detail: docOk ? "governingAgreement + sourceCitation present" : "missing governing document identity",
  });
  if (!docOk) unresolved.push("operative_document_unidentified");

  const entityOk = hasEntityScope(item, excerpt);
  gates.push({
    gate: "entity_scope_established",
    ok: entityOk,
    detail: entityOk ? "borrower/guarantor/RS scope evidenced" : "entity scope not established",
  });
  if (!entityOk) unresolved.push("entity_scope");

  const defsOk = unresolvedDefs.length === 0;
  gates.push({
    gate: "applicable_definitions_resolved",
    ok: defsOk,
    detail: defsOk ? "no unresolved applicableDefinitions" : `unresolved: ${unresolvedDefs.map((d) => d.term).join(", ")}`,
  });
  if (!defsOk) {
    unresolved.push("definitions");
    ownership.push("Agent2:contractual-financial-definitions");
  }

  const hasConditionLang = /\b(?:provided that|so long as|subject to|no Default|Event of Default|Payment Conditions)\b/i.test(
    excerpt,
  );
  // Hard gate: condition language in excerpt requires structured conditions[] (Cycle 5 remediation).
  const conditionGateOk = !hasConditionLang || (item.conditions ?? []).length > 0;
  gates.push({
    gate: "material_conditions_represented",
    ok: conditionGateOk,
    detail: hasConditionLang
      ? (item.conditions ?? []).length
        ? "conditions[] populated"
        : "condition language present but conditions[] empty — REVIEW_REQUIRED (Agent5)"
      : "no material condition language detected in excerpt",
  });
  if (!conditionGateOk) {
    unresolved.push("conditions_not_structured");
    ownership.push("Agent5:cross-document-conditions");
  }

  const sharedInExcerpt = SHARED_CAPACITY_RE.test(excerpt);
  const sharedInFamilies = (item.families ?? []).some((f) => /SHARED_CAPACITY/i.test(f));
  const sharedBlocked = sharedInExcerpt || sharedInFamilies;
  // Shared capacity must be explicitly blocked from executable promotion (fail-closed).
  gates.push({
    gate: "shared_capacity_resolved_or_blocked",
    ok: !sharedBlocked,
    detail: sharedBlocked
      ? "shared-capacity language/family present — blocked from executable (Agent5)"
      : "no shared-capacity dependency detected",
  });
  if (sharedBlocked) {
    unresolved.push("shared_capacity");
    ownership.push("Agent5:shared-capacity");
  }

  const needsFin =
    formulaType.includes("EBITDA") ||
    formulaType.includes("TOTAL_ASSETS") ||
    formulaType === "LEVERAGE_RATIO_ROOM" ||
    formulaType === "BUILDER_BASKET";
  gates.push({
    gate: "financial_inputs_identified",
    ok: true,
    detail: needsFin
      ? "requires approved financial snapshot (EBITDA/assets/leverage) — labeled at evaluation time"
      : "flat basket — threshold only; utilization still required for remaining capacity",
  });
  if (needsFin) ownership.push("Agent2:financial-inputs");

  gates.push({
    gate: "historical_utilization_status_established",
    ok: true,
    detail:
      "utilization not asserted by formula alone — status must be ZERO_NO_ATTRIBUTED_USAGE / attributed / fail-closed (Agent3/Neon lifecycle)",
  });
  unresolved.push("utilization_pending_ledger");

  const reviewPreserved =
    item.epistemicStatus === "DISCOVERED_CANDIDATE" || item.epistemicStatus === "STRUCTURE_ONLY";
  gates.push({
    gate: "legal_review_status_preserved",
    ok: reviewPreserved && item.reviewerDecision !== "ACCEPTED",
    detail: reviewPreserved
      ? `epistemicStatus=${item.epistemicStatus}; not auto-counsel-accepted`
      : "unexpected epistemic status",
  });

  const highConf = HIGH_CONFIDENCE_MECHANICS.has(formulaType);
  gates.push({
    gate: "high_confidence_mechanic",
    ok: highConf,
    detail: highConf
      ? `${formulaType} eligible for executable path after other gates`
      : `${formulaType} behind strict review gate (BUILDER/LEVERAGE/other)`,
  });
  if (!highConf) {
    unresolved.push(`mechanic_gate:${formulaType}`);
    if (formulaType === "BUILDER_BASKET") ownership.push("Agent3:builder-formula + Agent2:Available-Amount-definition");
    if (formulaType === "LEVERAGE_RATIO_ROOM" || formulaType === "RATIO_GATE") {
      ownership.push("Agent3:leverage-ratio-formula + Agent2:leverage-definitions");
    }
  }

  const growerOk = growerProximityOk(excerpt, formulaType);
  const evidenceOk =
    params.moneyOk && (params.pctOk === null || params.pctOk === true) && growerOk;
  gates.push({
    gate: "formula_threshold_evidenced",
    ok: evidenceOk,
    detail: !growerOk
      ? "greater-of / base not in proximity in excerpt (Agent3)"
      : evidenceOk
        ? "threshold/pct tokens evidenced in source excerpt"
        : "formula/threshold not evidenced in excerpt",
  });
  if (!evidenceOk) {
    unresolved.push("formula_threshold_evidence");
    if (!growerOk) ownership.push("Agent3:formula-proximity");
  }

  return { gates, unresolved: [...new Set(unresolved)], ownership: [...new Set(ownership)] };
}

function readinessFromGates(params: {
  gates: EligibilityGateResult[];
  formulaType: string;
  unresolvedDefs: number;
  crossRefs: number;
  hasDollar: boolean;
}): ActivationReadiness {
  const byId = Object.fromEntries(params.gates.map((g) => [g.gate, g.ok])) as Record<
    EligibilityGateId,
    boolean
  >;

  if (STRICT_REVIEW_MECHANICS.has(params.formulaType) || !byId.high_confidence_mechanic) {
    return "BLOCKED_MECHANIC_GATE";
  }
  if (!byId.shared_capacity_resolved_or_blocked) {
    return "BLOCKED_SHARED_CAPACITY";
  }
  if (params.unresolvedDefs > 0 || !byId.applicable_definitions_resolved) {
    return "NEEDS_DEFINITION_RESOLUTION";
  }
  if (!byId.source_text_sufficient || !byId.operative_document_identified) {
    return "DISCOVERED_FORMULA";
  }
  if (
    !byId.entity_scope_established ||
    !byId.formula_threshold_evidenced ||
    !byId.material_conditions_represented
  ) {
    return "REVIEW_REQUIRED";
  }
  if (!byId.legal_review_status_preserved) {
    return "REVIEW_REQUIRED";
  }

  // Executable only when hard gates pass — formula alone never sufficient.
  const hardOk =
    byId.source_text_sufficient &&
    byId.operative_document_identified &&
    byId.entity_scope_established &&
    byId.applicable_definitions_resolved &&
    byId.material_conditions_represented &&
    byId.shared_capacity_resolved_or_blocked &&
    byId.high_confidence_mechanic &&
    byId.formula_threshold_evidenced &&
    byId.legal_review_status_preserved;

  if (hardOk) return "EXECUTABLE_FORMULA_CANDIDATE";

  if (params.crossRefs > 0 && !params.hasDollar) return "NEEDS_CROSS_REF_RESOLUTION";
  return "REVIEW_REQUIRED";
}

export function activateSummaryItem(params: {
  sourceId: string;
  item: CovenantSummaryItem;
}): ActivatedProvisionCandidate {
  const item = params.item;
  // Evidence for token checks may include structured baskets; eligibility gates
  // that require operative completeness prefer the operative excerpt alone.
  const operativeOnly = item.operativeLanguageExcerpt ?? "";
  const excerpt = [
    operativeOnly,
    ...(item.materialBasketsThresholds ?? []),
    ...(item.permissions ?? []),
  ].join("\n");

  const parsed = parseCounselFormulaForTest(item);
  const checks: ActivatedProvisionCandidate["independentChecks"] = [];

  const hasGreaterOf = /greater of/i.test(excerpt);
  const hasDollar = /\$\s*[\d,]+/.test(excerpt);
  const unresolvedDefs = (item.applicableDefinitions ?? []).filter((d) => d.resolved === false);

  if (parsed.modelingStatus === "KNOWN_NOT_MODELED" || !parsed.formulaType || parsed.thresholdValue == null) {
    let readiness: ActivationReadiness = "NOT_ACTIVATABLE";
    if (unresolvedDefs.length) readiness = "NEEDS_DEFINITION_RESOLUTION";
    else if ((item.crossReferences ?? []).length > 0 && !hasDollar) readiness = "NEEDS_CROSS_REF_RESOLUTION";
    else if (item.posture === "GENERAL_PROHIBITION" || item.posture === "UNRESOLVED") readiness = "NEEDS_HUMAN_REVIEW";
    return {
      sourceId: params.sourceId,
      sectionRef: item.sectionRef,
      heading: item.heading,
      families: item.families,
      posture: item.posture,
      readiness,
      formulaType: parsed.formulaType ?? null,
      thresholdValue: parsed.thresholdValue ?? null,
      params: null,
      excerptEvidence: (item.operativeLanguageExcerpt ?? "").slice(0, 400),
      independentChecks: [
        {
          check: "parseable_tested_formula",
          ok: false,
          detail: parsed.missingFields.join(", ") || "no modeled formula",
        },
      ],
      eligibilityGates: [],
      allChecksPassed: false,
      executableEligible: false,
      certificationStatus: "NOT_CERTIFIED",
      unresolvedDependencies: ["no_modeled_formula"],
      ownershipHints: [],
      note: "Not activated — insufficient source-backed formula/threshold evidence.",
    };
  }

  checks.push({
    check: "parseable_tested_formula",
    ok: true,
    detail: `${parsed.formulaType} threshold=${parsed.thresholdValue}`,
  });

  const moneyOk = excerptHasMoney(excerpt, parsed.thresholdValue);
  checks.push({
    check: "threshold_tokens_in_excerpt",
    ok: moneyOk,
    detail: moneyOk ? "dollar/million tokens found in excerpt" : "parsed threshold not evidenced in excerpt",
  });

  const pct =
    (parsed.params as { pctEbitda?: number; pctTotalAssets?: number } | undefined)?.pctEbitda ??
    (parsed.params as { pctTotalAssets?: number } | undefined)?.pctTotalAssets;
  let pctOk: boolean | null = null;
  if (pct != null) {
    pctOk = excerptHasPct(excerpt, pct);
    checks.push({
      check: "pct_tokens_in_excerpt",
      ok: pctOk,
      detail: pctOk ? `${pct * 100}% evidenced` : "parsed pct not evidenced in excerpt",
    });
  }

  if (parsed.formulaType.startsWith("GREATER_OF")) {
    checks.push({
      check: "greater_of_language",
      ok: hasGreaterOf,
      detail: hasGreaterOf ? "greater-of language present" : "missing greater-of language",
    });
  }

  checks.push({
    check: "no_unresolved_blocking_defs",
    ok: unresolvedDefs.length === 0,
    detail: unresolvedDefs.length ? `unresolved: ${unresolvedDefs.map((d) => d.term).join(", ")}` : "ok",
  });

  // Eligibility gates use operative excerpt for scope/conditions/grower proximity
  // so permissions[] cannot launder a formula into EXECUTABLE (Cycle 5 ALKS 2.20).
  const gateExcerpt = (operativeOnly.trim().length >= 40 ? operativeOnly : excerpt).slice(0, 2500);
  const gateMoneyOk = excerptHasMoney(gateExcerpt, parsed.thresholdValue);
  let gatePctOk: boolean | null = null;
  if (pct != null) gatePctOk = excerptHasPct(gateExcerpt, pct);

  const { gates, unresolved, ownership } = evaluateEligibilityGates({
    item,
    excerpt: gateExcerpt,
    formulaType: parsed.formulaType,
    thresholdValue: parsed.thresholdValue,
    params: (parsed.params as Record<string, unknown>) ?? null,
    moneyOk: gateMoneyOk,
    pctOk: gatePctOk,
    unresolvedDefs,
  });

  // Token checks still required for evidence, but executable needs eligibility.
  const tokenChecksOk = checks.every((c) => c.ok);
  const readiness = readinessFromGates({
    gates,
    formulaType: parsed.formulaType,
    unresolvedDefs: unresolvedDefs.length,
    crossRefs: (item.crossReferences ?? []).length,
    hasDollar,
  });

  // Downgrade if token checks failed even when gates would pass.
  let finalReadiness = readiness;
  if (!tokenChecksOk && readiness === "EXECUTABLE_FORMULA_CANDIDATE") {
    finalReadiness = "REVIEW_REQUIRED";
  }

  const executableEligible = finalReadiness === "EXECUTABLE_FORMULA_CANDIDATE";
  // allChecksPassed means discovery+evidence checks — NOT permission to treat as executable.
  // For backward compat with Cycle 3 scripts: allChecksPassed && EXECUTABLE for executable set.
  const allChecksPassed = tokenChecksOk;

  return {
    sourceId: params.sourceId,
    sectionRef: item.sectionRef,
    heading: item.heading,
    families: item.families,
    posture: item.posture,
    readiness: finalReadiness,
    formulaType: parsed.formulaType,
    thresholdValue: parsed.thresholdValue,
    params: (parsed.params as Record<string, unknown>) ?? null,
    excerptEvidence: (item.operativeLanguageExcerpt ?? "").slice(0, 400),
    independentChecks: checks,
    eligibilityGates: gates,
    allChecksPassed,
    executableEligible,
    certificationStatus: "NOT_CERTIFIED",
    unresolvedDependencies: unresolved,
    ownershipHints: ownership,
    note: executableEligible
      ? "EXECUTABLE formula candidate after eligibility gates — NOT certified; NOT counsel-accepted; NOT written to Permission."
      : `Formula discovery retained as ${finalReadiness} — not an authoritative executable permission. Unresolved: ${unresolved.slice(0, 6).join(", ") || "n/a"}.`,
  };
}
