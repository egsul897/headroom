/**
 * Scripted Pass B submissions (MOCKED model output) derived from the expectation manifests.
 *
 * The FAITHFUL plan is what a correct model would submit for a candidate: one wire rule per manifest covenant inside
 * the candidate's section, with the manifest's value, conditions, scope and cross-references, every excerpt verbatim
 * from the operative text, and inventory lineage attached by excerpt overlap. It tests whether the deterministic
 * layers can accept and certify a correct representation of the package.
 *
 * ADVERSARIAL plans are mutations of the faithful plan that assert one of the manifest's prohibited claims (a false
 * permission, an omitted condition, a figure from a non-operative source, an overstated sufficiency…). They test
 * whether the deterministic layers refuse to certify a wrong representation when the (mocked) reviewer stays silent.
 */
import type { StructuralIndex } from "../../lib/contract-model/compiler/structural-index";
import type { ExpectationsManifest } from "./corpus";
import { inventoryIdsFor, allInventoryIds, inventoryIdsWithValues, excerptOfInventoryId, ws, type SubmissionPlan } from "./mocks";

type Cov = ExpectationsManifest["covenants"][number];
type Cond = Cov["conditions"][number];

const ACTION_BY_FAMILY: Record<string, string | null> = {
  INDEBTEDNESS: "INCUR_DEBT", LIENS: "CREATE_LIEN", RESTRICTED_PAYMENTS: "PAY_DIVIDEND", INVESTMENTS: "MAKE_INVESTMENT", ASSET_SALES: "SELL_ASSET", DISPOSITIONS: "SELL_ASSET",
  FUNDAMENTAL_CHANGES: "MERGE", MANDATORY_PREPAYMENTS: "MAKE_MANDATORY_PREPAYMENT", RESTRICTED_DEBT_PAYMENTS: "PAY_JUNIOR_DEBT", PREPAYMENTS_OF_JUNIOR_DEBT: "PAY_JUNIOR_DEBT",
  SPRINGING_COVENANTS: "SATISFY_RATIO", FINANCIAL_COVENANTS: "SATISFY_RATIO", COLLATERAL_SECURITY: null, AFFILIATE_TRANSACTIONS: "ENTER_AFFILIATE_TRANSACTION",
};
const RULE_TYPE_BY_ROLE: Record<string, string> = {
  GENERAL_PROHIBITION: "PROHIBITION", PERMISSION: "QUALITATIVE_OBLIGATION", BASKET: "QUANTITATIVE_PERMISSION", RATIO_BASED_PERMISSION: "QUANTITATIVE_PERMISSION", BUILDER: "QUANTITATIVE_PERMISSION",
  EXCEPTION: "QUALITATIVE_OBLIGATION", DESIGNATION_RULE: "QUANTITATIVE_PERMISSION", REFINANCING_PERMISSION: "QUALITATIVE_OBLIGATION", FINANCIAL_TEST: "RATIO_TEST", OTHER_RELEVANT_RULE: "MANDATORY_ACTION", SHARED_CAP: "QUANTITATIVE_RESTRICTION",
};
const COND_TYPE: Record<string, string> = {
  NO_DEFAULT: "NO_DEFAULT", RATIO_TEST: "RATIO_SATISFIED", PRO_FORMA: "RATIO_SATISFIED", CONSIDERATION_FORM: "UNSUPPORTED", PROCEEDS_APPLICATION: "OTHER_RULE_SATISFIED", SCOPE_CARVEOUT: "SECURITY_SCOPE",
  UNSECURED: "SECURITY_SCOPE", ELECTION: "UNSUPPORTED", SUBJECT_TO_INSTRUMENT: "OTHER_RULE_SATISFIED", PAYMENT_CONDITIONS: "OTHER_RULE_SATISFIED", AVAILABILITY_TEST: "MINIMUM_LIQUIDITY", TRIGGER: "MINIMUM_LIQUIDITY", CURE: "TIME_PERIOD",
};

export interface CandidateSpec {
  key: string;
  documentId: string;
  sectionRef: string;
  occurrence?: number;
  nodeId: string;
  /** Raw own text of the anchor node (verbatim probe for plan selection). */
  ownText: string;
  fullText: string;
  kind: "COVENANT_SECTION" | "DEFINITIONS";
  covenants: Cov[];
  families: string[];
  role: string;
}

export interface PlanSet { faithful: SubmissionPlan; label: string }

function termRef(termName: string, valueType: "MONEY" | "RATIO", ids: string[], excerpt: string, citation: string) {
  return { kind: "DEFINED_TERM_REFERENCE", termName, valueType, citation, excerpt, inventoryItemIds: ids };
}

function capacityFor(c: Cov, ids: string[], ownText: string): unknown {
  const v = c.value as Record<string, unknown> | undefined;
  const cite = c.sectionRef;
  const ex = (s: string) => (ownText.includes(s) ? s : ws(ownText).slice(0, 120));
  if (!v) return null;
  switch (v.kind) {
    case "MONEY": return { kind: "MONEY", amount: v.amount, currency: v.currency, citation: cite, excerpt: ex(`${v.currency === "EUR" ? "EUR " : "$"}${Number(v.amount).toLocaleString("en-US")}`), inventoryItemIds: ids };
    case "PERCENT_OF_METRIC": return { kind: "MULTIPLY", citation: cite, excerpt: ex(`${v.percent}% of ${v.metric}`), inventoryItemIds: ids, operands: [{ kind: "PERCENT", value: Number(v.percent) / 100, citation: cite, excerpt: ex(`${v.percent}%`), inventoryItemIds: ids }, termRef(String(v.metric), "MONEY", ids, ex(String(v.metric)), cite)] };
    case "RATIO_THRESHOLD": return { kind: "UNLIMITED_CAPACITY", citation: cite, excerpt: ws(ownText).slice(0, 120), inventoryItemIds: ids, gatedBy: { kind: "COMPARE", citation: cite, excerpt: ex(`${Number(v.numerator).toFixed(2)} to 1.00`), inventoryItemIds: ids, left: termRef(String(v.metric), "RATIO", ids, ex(String(v.metric)), cite), operator: String(v.comparator), right: { kind: "RATIO", value: Number(v.numerator) / Number(v.denominator), citation: cite, excerpt: ex(`${Number(v.numerator).toFixed(2)} to 1.00`), inventoryItemIds: ids } } };
    case "UNLIMITED_SUBJECT_TO_CONDITIONS": return { kind: "UNLIMITED_CAPACITY", citation: cite, excerpt: ws(ownText).slice(0, 120), inventoryItemIds: ids };
    case "BUILDER": return termRef(String(v.formulaTerm), "MONEY", ids, ex(String(v.formulaTerm)), cite);
    case "UNRESOLVABLE": case "TRUNCATED": return null;
    default: return null;
  }
}

function conditionFor(cond: Cond, c: Cov, user: string): unknown {
  const ids = cond.textContains ? inventoryIdsFor(user, cond.textContains) : [];
  const base = { conditionType: COND_TYPE[cond.kind] ?? "UNSUPPORTED", expression: null as unknown, referencesDefinitionId: null, description: `${cond.kind}: ${cond.textContains ?? ""}`.slice(0, 200), citation: c.sectionRef, excerpt: cond.textContains ?? null, inventoryItemIds: ids };
  if (cond.kind === "RATIO_TEST" && c.value && (c.value as { kind?: string }).kind === "RATIO_THRESHOLD") {
    const v = c.value as Record<string, unknown>;
    return { ...base, evaluationBasis: { proForma: c.conditions.some((x) => x.kind === "PRO_FORMA"), transactionEffect: null, asOfSelector: null, deemedEffectiveAt: null, testingPeriod: null }, expression: { kind: "COMPARE", citation: c.sectionRef, excerpt: cond.textContains, inventoryItemIds: ids, left: termRef(String(v.metric), "RATIO", ids, String(v.metric), c.sectionRef), operator: String(v.comparator), right: { kind: "RATIO", value: Number(v.numerator) / Number(v.denominator), citation: c.sectionRef, excerpt: `${Number(v.numerator).toFixed(2)} to 1.00`, inventoryItemIds: ids } } };
  }
  if (cond.crossReference) return { ...base, referencesRuleTargets: [{ targetRef: `Section ${cond.crossReference.sectionRef}` }], targetCombination: "ALL_SATISFIED" };
  if (cond.kind === "PAYMENT_CONDITIONS") return { ...base, referencesRuleTargets: [{ targetRef: "Payment Conditions" }], targetCombination: "ALL_SATISFIED" };
  if (cond.kind === "SUBJECT_TO_INSTRUMENT") return { ...base, referencesRuleTargets: [{ targetRef: "Intercreditor Agreement" }], targetCombination: "ALL_SATISFIED" };
  return base;
}

function sufficiencyFor(c: Cov): string {
  const k = (c.value as { kind?: string } | undefined)?.kind;
  if (c.truncated || k === "TRUNCATED") return "PARTIAL";
  if (k === "UNRESOLVABLE" || (c.unresolvedTerms?.length ?? 0) > 0) return "MISSING_CONTEXT";
  return "COMPLETE";
}

/** Verbatim own text of the covenant's node inside the candidate's full text (the excerpt must be a real substring). */
function excerptFor(index: StructuralIndex, c: Cov, spec: CandidateSpec): string {
  if (c.operativeTextDocumentId) return c.mustContain[0] ?? c.sectionRef;
  const nodes = index.findNodesByRef(c.documentId, c.sectionRef);
  const node = c.occurrence ? nodes[c.occurrence - 1] : nodes.length >= 1 ? nodes.find((n) => n.nodeId === spec.nodeId) ?? nodes[0] : undefined;
  const own = node ? index.getNodeText(node.nodeId, "OWN") : "";
  const stripped = own.replace(/^SECTION \S+ [^.]*\.\s*/, "").trim();
  return (stripped || own).slice(0, 300).trim();
}

export function faithfulPlan(index: StructuralIndex, m: ExpectationsManifest, spec: CandidateSpec): SubmissionPlan {
  return (user: string) => {
    if (spec.kind === "DEFINITIONS") {
      const defs = m.definitions.exact.filter((d) => d.documentId === spec.documentId);
      const definitions = defs.map((d, i) => {
        const full = (index.getDefinitionFullText(d.term, d.documentId) ?? "").trim();
        const excerpt = full.slice(0, 300);
        // every inventory item whose excerpt sits inside this definition's text belongs to it
        const ids = [...new Set([...inventoryIdsFor(user, `"${d.term}" means`), ...allInventoryIds(user).filter((id) => { const ex = excerptOfInventoryId(user, id); return ex.length >= 12 && ws(full).includes(ex); })])];
        const builder = m.covenants.map((c) => c.value as Record<string, unknown> | undefined).find((v) => v && v.kind === "BUILDER" && v.formulaTerm === d.term);
        const comps = (builder?.components ?? []) as Array<Record<string, unknown>>;
        const starter = comps.find((x) => x.kind === "STARTER"), pct = comps.find((x) => x.kind === "PERCENT_OF_METRIC"), less = comps.find((x) => x.kind === "LESS_PRIOR_USAGE");
        const calc = builder && starter && pct ? { kind: "ADD", citation: spec.sectionRef, excerpt: excerpt.slice(0, 160), inventoryItemIds: ids, operands: [{ kind: "MONEY", amount: starter.amount, currency: "USD", citation: spec.sectionRef, excerpt: `$${Number(starter.amount).toLocaleString("en-US")}`, inventoryItemIds: ids }, { kind: "MULTIPLY", citation: spec.sectionRef, excerpt: `${pct.percent}% of ${pct.metric}`, inventoryItemIds: ids, operands: [{ kind: "PERCENT", value: Number(pct.percent) / 100, citation: spec.sectionRef, excerpt: `${pct.percent}%`, inventoryItemIds: ids }, termRef(String(pct.metric), "MONEY", ids, String(pct.metric), spec.sectionRef)] }] } : null;
        const hasNumbers = /\$[\d,]+|\d+(?:\.\d+)?%|\d+\.\d{2} to 1\.00/.test(full);
        const sufficiency = calc ? (less ? "PARTIAL" : "COMPLETE") : hasNumbers ? "PARTIAL" : "COMPLETE";
        return { localRef: `d${i + 1}`, termName: d.term, covenantFamily: "DEFINITIONS_CALCULATION_RULES", calculationExpression: calc, dependsOnTerms: pct ? [String(pct.metric)] : [], sufficiency, sufficiencyReasons: sufficiency === "COMPLETE" ? [] : [less ? "prior-usage subtraction not formalized by the mock" : "quantitative definition not formalized by the mock"], citation: spec.sectionRef, excerpt, inventoryItemIds: ids };
      });
      const consumed = new Set(definitions.flatMap((d) => d.inventoryItemIds));
      const inventoryDispositions = allInventoryIds(user).filter((id) => !consumed.has(id)).map((id) => ({ inventoryItemId: id, disposition: "INTENTIONALLY_NON_COMPUTATIONAL", note: "definitions lead-in / descriptive" }));
      return { rules: [], definitions, sharedCapacities: [], irExtensionCandidates: [], inventoryDispositions, overallNotes: [] };
    }
    const covs = spec.covenants;
    const refOf = new Map(covs.map((c, i) => [c.sectionRef + (c.occurrence ? `#${c.occurrence}` : ""), `r${i + 1}`] as const));
    const rules = covs.map((c, i) => {
      const excerpt = excerptFor(index, c, spec);
      const ids = [...new Set([...inventoryIdsFor(user, excerpt), ...c.mustContain.flatMap((s) => inventoryIdsFor(user, s))])];
      const isProhibition = c.role === "GENERAL_PROHIBITION";
      const siblingExceptions = isProhibition ? covs.filter((x) => x !== c && x.posture === "PERMISSION" && x.sectionRef.startsWith(c.sectionRef)).map((x) => ({ description: `clause ${x.sectionRef}`, permissionRef: refOf.get(x.sectionRef + (x.occurrence ? `#${x.occurrence}` : "")) ?? null, conditions: [], citation: x.sectionRef, excerpt: excerptFor(index, x, spec).slice(0, 160), inventoryItemIds: inventoryIdsFor(user, excerptFor(index, x, spec)) })) : [];
      // an inline "except …" carve-out on a bare prohibition (no enumerated sub-clauses) is itself an exception
      const inlineExcept = isProhibition && siblingExceptions.length === 0 ? excerpt.match(/except (.+?)(?:\.|$)/) : null;
      const inlineExceptions = inlineExcept ? [{ description: inlineExcept[1]!.slice(0, 160), permissionRef: null, conditions: c.crossReferences.filter((x) => x.sectionRef).map((x) => ({ conditionType: "OTHER_RULE_SATISFIED", expression: null, referencesDefinitionId: null, referencesRuleTargets: [{ targetRef: `Section ${x.sectionRef}` }], targetCombination: "ALL_SATISFIED", description: `permitted under Section ${x.sectionRef}`, citation: c.sectionRef, excerpt: inlineExcept[1]!.slice(0, 160), inventoryItemIds: inventoryIdsFor(user, inlineExcept[1]!) })), citation: c.sectionRef, excerpt: `except ${inlineExcept[1]!}`.slice(0, 200), inventoryItemIds: inventoryIdsFor(user, inlineExcept[1]!) }] : [];
      const exceptions = [...siblingExceptions, ...inlineExceptions];
      const conditions = c.conditions.filter((k) => k.kind !== "SHARED_CAP").map((k) => conditionFor(k, c, user));
      // IPV-15: a cross-reference that exists only inside a retrieved definition (note names the
      // definition / "shared usage through") is not stated in the clause's operative text. Emitting
      // it as dependsOn triggers MODEL_INVENTED_REFERENCE under SA-1. Represent the shared pool via
      // sharedCapacities (below), not as an invented operative dependsOn.
      const dependsOn = c.crossReferences
        .filter((x) => x.sectionRef && !/definition|shared usage through/i.test(x.note ?? ""))
        .map((x) => ({ relationshipType: "REQUIRES", targetRef: `Section ${x.sectionRef}`, description: `cross-reference to ${x.sectionRef}`, inventoryItemIds: inventoryIdsFor(user, `Section ${x.sectionRef}`) }));
      const ruleType = isProhibition && (c.value as { kind?: string } | undefined)?.kind === "MONEY" ? "QUANTITATIVE_RESTRICTION" : RULE_TYPE_BY_ROLE[c.role] ?? "QUALITATIVE_OBLIGATION";
      return { localRef: `r${i + 1}`, sourceSectionRef: c.sectionRef, covenantFamily: c.family, ruleType, posture: c.posture, action: ACTION_BY_FAMILY[c.family] ?? null, entityScope: c.entityScope ?? ["BORROWER"], entityScopeExcluded: [], capacityExpression: capacityFor(c, ids, excerpt), conditions, exceptions, dependsOn, sufficiency: sufficiencyFor(c), sufficiencyReasons: sufficiencyFor(c) === "COMPLETE" ? [] : [`${c.unresolvedTerms?.join(", ") ?? ""}${c.truncated ? " source truncated" : ""}`.trim()], citation: c.sectionRef, excerpt, inventoryItemIds: ids };
    });
    // enumerated children of the section that the manifest does not single out: a faithful model still represents them
    // (as qualitative permissions under an "except:" lead-in) or carries their items on the lead rule (formula parts)
    const anchor = index.getNodeById(spec.nodeId);
    const covered = new Set(covs.map((c) => c.sectionRef));
    const lead = rules.find((r) => r.sourceSectionRef === spec.sectionRef) ?? rules[0];
    const exceptLead = /except:?\s*$/.test(ws(spec.ownText));
    if (anchor) for (const child of index.getDescendants(anchor.nodeId)) {
      if (covered.has(child.sectionRef) || [...covered].some((r) => child.sectionRef.startsWith(r + "("))) continue;
      const own = index.getNodeText(child.nodeId, "OWN").trim();
      const ids = inventoryIdsFor(user, own);
      if (exceptLead && child.nodeType === "SUBSECTION") {
        const family = covs[0]?.family ?? "INDEBTEDNESS";
        rules.push({ localRef: `q${rules.length + 1}`, sourceSectionRef: child.sectionRef, covenantFamily: family, ruleType: "QUALITATIVE_OBLIGATION", posture: "PERMISSION", action: ACTION_BY_FAMILY[family] ?? null, entityScope: ["BORROWER"], entityScopeExcluded: [], capacityExpression: { kind: "UNLIMITED_CAPACITY", citation: child.sectionRef, excerpt: own.slice(0, 160), inventoryItemIds: ids }, conditions: [], exceptions: [], dependsOn: [], sufficiency: "COMPLETE", sufficiencyReasons: [], citation: child.sectionRef, excerpt: own.slice(0, 300), inventoryItemIds: ids });
        if (lead && lead.ruleType === "PROHIBITION") (lead.exceptions as unknown[]).push({ description: `clause ${child.sectionRef}`, permissionRef: `q${rules.length}`, conditions: [], citation: child.sectionRef, excerpt: own.slice(0, 160), inventoryItemIds: ids });
      } else if (lead) {
        (lead.inventoryItemIds as string[]).push(...ids);
        const firstCond = (lead.conditions as Array<{ inventoryItemIds?: string[] }>)[0];
        if (firstCond) firstCond.inventoryItemIds = [...new Set([...(firstCond.inventoryItemIds ?? []), ...ids])];
      }
    }
    // IPV-15: include a shared cap when any participant is in this candidate (definition-mediated
    // pools span sections compiled separately). Member refs are only the local rules; BUILDER caps
    // reference the formula term rather than inventing a sibling dependsOn.
    const sharedCapacities = m.sharedCaps
      .filter((s) => s.participants.some((p) => covs.some((c) => c.sectionRef === p || c.sectionRef.startsWith(p))))
      .map((s, i) => {
        const ids = inventoryIdsFor(user, s.textContains);
        const cap = s.cap as { kind?: string; amount?: number; currency?: string; formulaTerm?: string };
        const localMembers = s.participants
          .map((p) => refOf.get(p) ?? refOf.get([...refOf.keys()].find((k) => k.startsWith(p)) ?? "") ?? "")
          .filter(Boolean);
        const capExpression =
          cap.kind === "BUILDER" && cap.formulaTerm
            ? termRef(String(cap.formulaTerm), "MONEY", ids, s.textContains, spec.sectionRef)
            : { kind: "MONEY", amount: Number(cap.amount ?? 0), currency: String(cap.currency ?? "USD"), citation: spec.sectionRef, excerpt: s.textContains, inventoryItemIds: ids };
        return { localRef: `sc${i + 1}`, description: s.where, capExpression, memberRefs: localMembers, citation: spec.sectionRef, excerpt: s.textContains, inventoryItemIds: ids };
      })
      .filter((s) => s.memberRefs.length > 0);
    // a cooperative model dispositions the non-quantitative items it did not consume; items carrying values are left to the deterministic check
    const consumed = new Set<string>(JSON.stringify({ rules, sharedCapacities }).match(/inv-item:[0-9a-f]+/g) ?? []);
    const valued = new Set(inventoryIdsWithValues(user));
    const inventoryDispositions = allInventoryIds(user).filter((id) => !consumed.has(id) && !valued.has(id)).map((id) => ({ inventoryItemId: id, disposition: "INTENTIONALLY_NON_COMPUTATIONAL", note: "lead-in / descriptive" }));
    return { rules, definitions: [], sharedCapacities, irExtensionCandidates: [], inventoryDispositions, overallNotes: [] };
  };
}

export type Mutation =
  | { kind: "DROP_CONDITIONS"; sectionRef: string }
  /** Removes every condition AND the capacity's gatedBy test: the rule is presented as an unconditional permission. */
  | { kind: "DROP_GATE"; sectionRef: string }
  | { kind: "SET_AMOUNT"; sectionRef: string; amount: number; excerpt: string }
  | { kind: "ADD_RULE_FROM_TEXT"; sectionRef: string; amount: number; excerpt: string; family: string }
  | { kind: "SET_SCOPE"; sectionRef: string; entityScope: string[] }
  | { kind: "SET_FAMILY"; sectionRef: string; family: string; action: string }
  | { kind: "CLAIM_COMPLETE"; sectionRef: string; amount?: number; excerpt?: string }
  | { kind: "DROP_SHARED_CAPS" }
  /** Rewrites the ratio test on a rule: its gatedBy COMPARE and every COMPARE condition expression (operator and/or threshold). */
  | { kind: "SET_RATIO"; sectionRef: string; operator?: string; value?: number; excerpt?: string }
  /** Flips a rule's posture (PROHIBITION ↔ PERMISSION) and the rule type with it (an exception presented as a permission, a prohibition as a permission). */
  | { kind: "SET_POSTURE"; sectionRef: string; posture: "PERMISSION" | "PROHIBITION" }
  /** Rewrites the percentage of a percentage-of-metric capacity (MULTIPLY with a PERCENT operand). */
  | { kind: "SET_PERCENT"; sectionRef: string; percent: number; excerpt: string };

export interface AdversarialCase { id: string; prohibitedClaimId: string; mutation: Mutation; candidateKey: string; claim: string; severity: string }

type Sub = { rules: Record<string, unknown>[]; sharedCapacities: unknown[]; inventoryDispositions?: unknown[]; [k: string]: unknown };

function stripIds(node: unknown, ids: Set<string>): void {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) { for (const x of node) stripIds(x, ids); return; }
  const o = node as Record<string, unknown>;
  if (Array.isArray(o.inventoryItemIds)) o.inventoryItemIds = (o.inventoryItemIds as string[]).filter((id) => !ids.has(id));
  for (const v of Object.values(o)) if (v && typeof v === "object") stripIds(v, ids);
}
function idsIn(node: unknown): string[] { return JSON.stringify(node ?? null).match(/inv-item:[0-9a-f]+/g) ?? []; }

export function mutate(plan: SubmissionPlan, mutation: Mutation, opts: { stripLineage?: boolean } = {}): SubmissionPlan {
  return (user: string) => {
    const s = plan(user) as Sub;
    const rule = (ref: string) => s.rules.find((r) => r.sourceSectionRef === ref);
    const dropLineageOf = (dropped: unknown) => { if (!opts.stripLineage) return; const ids = new Set(idsIn(dropped)); stripIds(s.rules, ids); stripIds(s.sharedCapacities, ids); s.inventoryDispositions = (s.inventoryDispositions ?? []).filter((d) => !ids.has((d as { inventoryItemId: string }).inventoryItemId)); };
    switch (mutation.kind) {
      case "DROP_CONDITIONS": { const r = rule(mutation.sectionRef); if (r) { const dropped = r.conditions; r.conditions = []; dropLineageOf(dropped); } break; }
      case "DROP_GATE": { const r = rule(mutation.sectionRef); if (r) { const cap = r.capacityExpression as { gatedBy?: unknown } | undefined; const dropped = [r.conditions, cap?.gatedBy]; r.conditions = []; if (cap && "gatedBy" in cap) delete cap.gatedBy; dropLineageOf(dropped); } break; }
      case "SET_AMOUNT": { const r = rule(mutation.sectionRef); if (r) { r.capacityExpression = { kind: "MONEY", amount: mutation.amount, currency: "USD", citation: mutation.sectionRef, excerpt: mutation.excerpt, inventoryItemIds: inventoryIdsFor(user, mutation.excerpt) }; r.excerpt = mutation.excerpt; } break; }
      case "ADD_RULE_FROM_TEXT": s.rules.push({ localRef: "rx", sourceSectionRef: mutation.sectionRef, covenantFamily: mutation.family, ruleType: "QUANTITATIVE_PERMISSION", posture: "PERMISSION", action: ACTION_BY_FAMILY[mutation.family] ?? null, entityScope: ["BORROWER"], entityScopeExcluded: [], capacityExpression: { kind: "MONEY", amount: mutation.amount, currency: "USD", citation: mutation.sectionRef, excerpt: mutation.excerpt, inventoryItemIds: inventoryIdsFor(user, mutation.excerpt) }, conditions: [], exceptions: [], dependsOn: [], sufficiency: "COMPLETE", sufficiencyReasons: [], citation: mutation.sectionRef, excerpt: mutation.excerpt, inventoryItemIds: inventoryIdsFor(user, mutation.excerpt) }); break;
      case "SET_SCOPE": { const r = rule(mutation.sectionRef); if (r) r.entityScope = mutation.entityScope; break; }
      case "SET_FAMILY": { const r = rule(mutation.sectionRef); if (r) { r.covenantFamily = mutation.family; r.action = mutation.action; } break; }
      case "CLAIM_COMPLETE": { const r = rule(mutation.sectionRef); if (r) { r.sufficiency = "COMPLETE"; r.sufficiencyReasons = []; if (mutation.amount !== undefined) r.capacityExpression = { kind: "MONEY", amount: mutation.amount, currency: "USD", citation: mutation.sectionRef, excerpt: mutation.excerpt ?? r.excerpt, inventoryItemIds: inventoryIdsFor(user, String(mutation.excerpt ?? r.excerpt)) }; else if (!r.capacityExpression) r.capacityExpression = { kind: "UNLIMITED_CAPACITY", citation: mutation.sectionRef, excerpt: r.excerpt, inventoryItemIds: r.inventoryItemIds }; } break; }
      case "DROP_SHARED_CAPS": { const dropped = s.sharedCapacities; s.sharedCapacities = []; dropLineageOf(dropped); break; }
      case "SET_POSTURE": { const r = rule(mutation.sectionRef); if (r) { r.posture = mutation.posture; r.ruleType = mutation.posture === "PERMISSION" ? (r.capacityExpression ? "QUANTITATIVE_PERMISSION" : "QUALITATIVE_OBLIGATION") : "PROHIBITION"; } break; }
      case "SET_PERCENT": {
        const r = rule(mutation.sectionRef); if (!r) break;
        const cap = r.capacityExpression as { kind?: string; operands?: Array<Record<string, unknown>>; excerpt?: string } | undefined;
        if (cap?.kind === "MULTIPLY" && cap.operands) { for (const o of cap.operands) if (o.kind === "PERCENT") { o.value = mutation.percent / 100; o.excerpt = mutation.excerpt; } cap.excerpt = mutation.excerpt; }
        break;
      }
      case "SET_RATIO": {
        const r = rule(mutation.sectionRef); if (!r) break;
        const rewrite = (cmp: Record<string, unknown> | null | undefined) => { if (!cmp || cmp.kind !== "COMPARE") return; if (mutation.operator) cmp.operator = mutation.operator; const right = cmp.right as Record<string, unknown> | undefined; if (right && mutation.value !== undefined) { right.value = mutation.value; if (mutation.excerpt) { right.excerpt = mutation.excerpt; cmp.excerpt = mutation.excerpt; } } };
        rewrite((r.capacityExpression as { gatedBy?: Record<string, unknown> } | undefined)?.gatedBy);
        for (const c of (r.conditions as Array<{ expression?: Record<string, unknown> | null }>)) rewrite(c.expression ?? null);
        break;
      }
    }
    return s;
  };
}

/** The adversarial matrix: which prohibited claims can be expressed as a Pass B submission, per package. */
export function adversarialCases(m: ExpectationsManifest, specs: CandidateSpec[]): AdversarialCase[] {
  const sec = (ref: string, doc?: string) => specs.find((s) => s.kind === "COVENANT_SECTION" && (!doc || s.documentId === doc) && s.covenants.some((c) => c.sectionRef === ref))?.key ?? "";
  const claim = (id: string) => m.prohibitedClaims.find((p) => p.id === id);
  const out: AdversarialCase[] = [];
  const add = (id: string, mutation: Mutation, candidateKey: string) => { const p = claim(id); if (p && candidateKey) out.push({ id: `${id}:adv`, prohibitedClaimId: id, mutation, candidateKey, claim: p.claim, severity: p.severityIfAsserted }); };
  switch (m.packageId) {
    case "pkg-a-basic-credit-agreement":
      add("A-P1", { kind: "DROP_CONDITIONS", sectionRef: "7.01(b)" }, sec("7.01(b)"));
      add("A-P2", { kind: "SET_SCOPE", sectionRef: "7.01(c)", entityScope: ["BORROWER", "ANY_SUBSIDIARY"] }, sec("7.01(c)"));
      break;
    case "pkg-b-multi-document":
      add("B-P1", { kind: "SET_AMOUNT", sectionRef: "7.01(c)", amount: 150000000, excerpt: "not to exceed $150,000,000" }, sec("7.01(c)", "credit-agreement"));
      add("B-P3", { kind: "SET_SCOPE", sectionRef: "4.09", entityScope: ["BORROWER", "ANY_SUBSIDIARY", "UNRESTRICTED_SUB"] }, sec("4.09", "indenture"));
      break;
    case "pkg-c-amendment-supersession":
      add("C-P1", { kind: "SET_AMOUNT", sectionRef: "7.01(b)", amount: 25000000, excerpt: "not to exceed $25,000,000" }, sec("7.01(b)"));
      add("C-P4", { kind: "DROP_CONDITIONS", sectionRef: "7.01(b)" }, sec("7.01(b)"));
      break;
    case "pkg-d-qualitative-restrictions":
      add("D-P1", { kind: "DROP_CONDITIONS", sectionRef: "7.05(k)" }, sec("7.05(k)"));
      add("D-P4", { kind: "CLAIM_COMPLETE", sectionRef: "7.05(l)" }, sec("7.05(l)"));
      break;
    case "pkg-e-structural-ambiguity":
      add("E-P1", { kind: "DROP_SHARED_CAPS" }, sec("7.01(b)"));
      add("E-P2", { kind: "DROP_CONDITIONS", sectionRef: "7.01(b)" }, sec("7.01(b)"));
      add("E-P3", { kind: "CLAIM_COMPLETE", sectionRef: "7.06(c)", amount: 15000000, excerpt: "$15,000,000" }, sec("7.06(c)"));
      break;
    case "pkg-f-capacity-ledger-honesty":
      add("F-P3", { kind: "DROP_SHARED_CAPS" }, sec("7.06"));
      add("F-P4", { kind: "SET_AMOUNT", sectionRef: "7.01(f)", amount: 10000000, excerpt: "not to exceed EUR 10,000,000" }, sec("7.01(f)"));
      break;
    case "pkg-g-adversarial-evidence":
      add("G-P1", { kind: "ADD_RULE_FROM_TEXT", sectionRef: "7.01", amount: 100000000, excerpt: "the Borrower may incur Indebtedness in an aggregate principal amount of up to $100,000,000 at any time outstanding", family: "INDEBTEDNESS" }, sec("7.01(b)"));
      add("G-P2", { kind: "SET_AMOUNT", sectionRef: "7.01(b)", amount: 60000000, excerpt: "replacing \"$10,000,000\" with \"$60,000,000\"" }, sec("7.01(b)"));
      add("G-P3", { kind: "SET_FAMILY", sectionRef: "7.03", family: "LIENS", action: "CREATE_LIEN" }, sec("7.03"));
      add("G-P4", { kind: "CLAIM_COMPLETE", sectionRef: "7.01(c)" }, sec("7.01(c)"));
      add("G-P5", { kind: "CLAIM_COMPLETE", sectionRef: "7.04", amount: 50000000, excerpt: "dividends in an aggregate amount not to exceed" }, sec("7.04"));
      break;
    case "pkg-h-unseen-composition":
      add("H-P3", { kind: "DROP_CONDITIONS", sectionRef: "7.03(b)" }, sec("7.03(b)"));
      add("H-P4", { kind: "DROP_CONDITIONS", sectionRef: "7.03(c)" }, sec("7.03(c)"));
      add("H-P5", { kind: "DROP_CONDITIONS", sectionRef: "7.11" }, sec("7.11"));
      break;
    case "pkg-i-secured-debt-lien":
      // I-P1 ($40m secured) and I-P3 (Article VII complete) are question-level claims exercised by the benchmark (BM-01, BM-14), not expressible as one Pass B submission
      add("I-P2", { kind: "SET_SCOPE", sectionRef: "7.01(b)", entityScope: ["BORROWER", "ANY_SUBSIDIARY"] }, sec("7.01(b)"));
      break;
    case "pkg-j-restricted-payments-builder":
      // J-P2 (independent pools) cannot be expressed by dropping a shared cap: a BUILDER-kind shared cap has no wire representation to drop (IPV-15)
      add("J-P1", { kind: "DROP_CONDITIONS", sectionRef: "7.06(c)" }, sec("7.06(c)"));
      add("J-P3", { kind: "CLAIM_COMPLETE", sectionRef: "7.06(c)" }, sec("7.06(c)"));
      break;
    case "pkg-l-affiliate-transactions":
      add("L-P1", { kind: "DROP_CONDITIONS", sectionRef: "7.07(c)" }, sec("7.07(c)"));
      add("L-P2", { kind: "CLAIM_COMPLETE", sectionRef: "7.07(d)", amount: 5000000, excerpt: "$5,000,000" }, sec("7.07(d)"));
      add("L-P3", { kind: "SET_SCOPE", sectionRef: "7.07", entityScope: ["BORROWER"] }, sec("7.07"));
      break;
    case "pkg-k-three-way-builder":
      // K-P1 (three independent pools) is the IPV-15 representation gap again; K-P2 drops the definition-sourced Default kill-switch on the third basket
      add("K-P2", { kind: "DROP_CONDITIONS", sectionRef: "7.09(b)" }, sec("7.09(b)"));
      break;
  }
  // declarative cases (manifest prohibitedClaims[].adversarial) - used by in-memory variations and by any package without a switch entry
  for (const pc of m.prohibitedClaims) {
    const a = pc.adversarial; if (!a || out.some((o) => o.prohibitedClaimId === pc.id)) continue;
    const mutation: Mutation = a.kind === "DROP_CONDITIONS" ? { kind: "DROP_CONDITIONS", sectionRef: a.sectionRef }
      : a.kind === "DROP_GATE" ? { kind: "DROP_GATE", sectionRef: a.sectionRef }
      : a.kind === "SET_AMOUNT" ? { kind: "SET_AMOUNT", sectionRef: a.sectionRef, amount: a.amount ?? 0, excerpt: a.excerpt ?? "" }
      : a.kind === "SET_SCOPE" ? { kind: "SET_SCOPE", sectionRef: a.sectionRef, entityScope: a.entityScope ?? ["BORROWER"] }
      : a.kind === "CLAIM_COMPLETE" ? { kind: "CLAIM_COMPLETE", sectionRef: a.sectionRef, amount: a.amount, excerpt: a.excerpt }
      : a.kind === "SET_RATIO" ? { kind: "SET_RATIO", sectionRef: a.sectionRef, operator: a.operator, value: a.value, excerpt: a.excerpt }
      : a.kind === "SET_POSTURE" ? { kind: "SET_POSTURE", sectionRef: a.sectionRef, posture: (a.posture ?? "PERMISSION") as "PERMISSION" | "PROHIBITION" }
      : a.kind === "SET_PERCENT" ? { kind: "SET_PERCENT", sectionRef: a.sectionRef, percent: a.percent ?? 0, excerpt: a.excerpt ?? "" }
      : { kind: "DROP_SHARED_CAPS" };
    add(pc.id, mutation, sec(a.sectionRef, a.documentId));
  }
  return out;
}
