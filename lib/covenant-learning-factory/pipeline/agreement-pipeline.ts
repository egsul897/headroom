/**
 * One deterministic end-to-end path for ANY agreement text:
 *   text → section tree → clause roles + cross-references → covenant checklist → basket extraction + compute
 *   → per-family summary → (optional) additive Neon persistence.
 *
 * General logic only: no per-issuer branches, zero AI / LLM calls. Missing figures are NEEDS_INPUT. A basket the
 * extractor could not find a cap for is reported NEEDS_INPUT ("no cap located"), never UNLIMITED by default; only
 * clauses whose text itself states unlimited capacity are reported UNLIMITED_EXPLICIT.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { parseDocumentTree, sectionOf, type TextBasis } from "../../contract-model/section-tree/parse";
import {
  CHECKLIST_FAMILIES, covenantChecklist, ownText, resolveCrossRefs, roleOf,
  type ChecklistItem, type ClauseRole, type CrossRef,
} from "../../contract-model/section-tree/semantics";
import { runCovenantComputation } from "../../contract-model/covenant-computation";
import { covenantRatioThresholds } from "../../contract-model/covenant-computation/ratio-terms";
import { attachHeadroom, parseDefinitions } from "../../contract-model/covenant-computation/ratios";
import type { ComputedBasket } from "../../contract-model/covenant-computation/types";
import { buildComputationPackage } from "../sweep/build-package";
import { emptyRuleSet } from "../learned-rules/types";
import type { ComputedRatio } from "../../contract-model/covenant-computation/types";
import type { IssuerFinancials } from "../xbrl/companyfacts";
import { basketUsage, type FacilityFact } from "../xbrl/instance-debt";
import { decide, toMetricInput, type BindDecision } from "../xbrl/bind";
import { debtFromFinancials, leverageDebtCapacity, maxLeverageLimit, optimizeConsolidatedEbitda, ratioCapacity, type EbitdaOptimization, type LeverageCapacity, type RatioCapacity } from "../xbrl/ebitda-optimizer";
import { findEbitdaMeasureTerm } from "../xbrl/definition-items";
import { trackAddBacks, type AddBackFlag } from "../xbrl/addback-tracker";
import { extractDocumentIdentity } from "../../contract-model/compiler/package-graph/document-identity";
import { buildPackageGraph } from "../../contract-model/compiler/package-graph/pipeline";

export const PIPELINE_VERSION = "agreement-pipeline-1";

let cachedParserVersion: string | null = null;
/** "st-" + sha256(parse.ts + semantics.ts)[0:12]; falls back to a static tag when sources are not on disk (bundled app). */
export function sectionTreeParserVersion(): string {
  if (cachedParserVersion) return cachedParserVersion;
  try {
    const p = (f: string) => readFileSync(new URL(`../../contract-model/section-tree/${f}`, import.meta.url));
    cachedParserVersion = "st-" + createHash("sha256").update(Buffer.concat([p("parse.ts"), p("semantics.ts")])).digest("hex").slice(0, 12);
  } catch {
    cachedParserVersion = `st-${PIPELINE_VERSION}`;
  }
  return cachedParserVersion;
}

export type FamilyOutcome = "ABSENT_VERIFIED" | "CAP_COMPUTED" | "NEEDS_INPUT" | "CONDITIONS_LIMITED" | "UNLIMITED_EXPLICIT" | "MISSING";

export interface FamilySummary {
  family: string;
  outcome: FamilyOutcome;
  checklistStatus: ChecklistItem["status"] | "N/A";
  sectionPaths: string[];
  baskets: Array<{ sectionRef: string; category: string; capStatus: string; cap: string | null; /** AT_LEAST: cap computed from a lower-bound metric (capacity is at least `cap`). */ capBound?: "AT_LEAST"; currency: string | null; missingInputs: string[]; citation: string }>;
  needsInputs: string[];
  /**
   * When set, the checklist absence is from this document only (amendment / 8-K / incorporating instrument).
   * Package-wide outcome is never ABSENT_VERIFIED in that case: the base agreement has not been read.
   */
  absentScope?: ChecklistItem["absentScope"];
}

export interface AgreementPipelineResult {
  pipelineVersion: string;
  parserVersion: string;
  textSha256: string;
  basis: TextBasis;
  textLength: number;
  tree: ReturnType<typeof parseDocumentTree>;
  roles: Map<string, ClauseRole>;
  crossRefs: CrossRef[];
  checklist: ChecklistItem[];
  computedBaskets: ComputedBasket[];
  computedRatios: ComputedRatio[];
  /** Headroom (limit minus usage, or usage minus a minimum) for every computed or bounded result, with its label. */
  headroom: HeadroomRow[];
  /** Present when filing financials were supplied: one decision per requested metric name. */
  xbrl?: {
    cik: string; decisions: BindDecision[]; before: { basketsComputed: string[]; ratiosComputed: string[] };
    /** Results computed from a LOWER_BOUND metric: AT_LEAST (cap / ratio ≥ value) or AT_MOST (ratio ≤ value). */
    bounds: Array<{ stableKey: string; kind: "AT_LEAST" | "AT_MOST"; metric: string; missing: string[] }>;
    /** Computed only because of a lower bound in a direction that cannot be bounded: reverted to NEEDS_INPUT. */
    reverted: string[];
    /** Consolidated EBITDA under the agreement's own definition (filings + optional sourced borrower inputs). */
    ebitda?: EbitdaOptimization;
    /** maxLeverage × EBITDA − debt, only when exactly one total-leverage MAX limit and a debt figure are available. */
    leverageCapacity?: LeverageCapacity;
    /** Incurrence-ratio capacity (leverage / secured leverage / interest coverage): exactly one limit per ratio, else refused. */
    ratioCapacity?: RatioCapacity[];
    /**
     * Amendment (or other package doc) names a dated base facility but no in-text EBITDA schedule was found.
     * Fail-closed: packages need the base agreement text before definitions can resolve (package-graph).
     */
    ebitdaBaseHold?: { reason: "AMENDMENT_NEEDS_BASE_TEXT" | "BASE_NOT_BOUND" | "AMENDED_DEFINITION"; namedBase: string; missing: string };
    /**
     * EBITDA measure taken from a base agreement bound by package-graph. CONFIRMED = RESOLVED link; LOWER_CONFIDENCE =
     * REVIEW_REQUIRED link (supporting-evidence / date-mismatch). Carried on every output derived from that EBITDA.
     */
    /** Per-agreement add-back tracker (this agreement's definition × this issuer's filings, period over period). */
    addBackTracker?: AddBackFlag[];
    ebitdaBinding?: { tier: "CONFIRMED" | "LOWER_CONFIDENCE"; baseDocumentId: string; relationship: string; resolutionMethod: string };
  };
  families: FamilySummary[];
  stats: { nodes: number; sections: number; clauses: number; xrefs: number; xrefResolved: number; baskets: number };
}

export interface HeadroomRow {
  stableKey: string; kind: "RATIO" | "BASKET"; name: string; sectionRef: string | null;
  status: "COMPUTED" | "NEEDS_INPUT"; usage: string | null; usageBound: "EXACT" | "AT_LEAST" | "AT_MOST";
  limit: string | null; direction: "MIN" | "MAX" | null; headroom: string | null; headroomBound: "EXACT" | "AT_LEAST" | "AT_MOST" | null;
  citation: string | null; missing: string[];
  /** For a basket: whether the cap itself is exact or only a bound. */
  limitBound?: "EXACT" | "AT_LEAST" | "AT_MOST";
  /** Filing locator for a basket usage figure. */
  usageSource?: string;
  /** EBITDA came from a package-bound base agreement at this confidence tier. */
  bindingTier?: "CONFIRMED" | "LOWER_CONFIDENCE";
}

const sha = (s: string) => createHash("sha256").update(s).digest("hex");

/** Map extractor families onto the checklist vocabulary (general aliases only). */
function checklistFamilyOf(f: string): string {
  const u = f.toUpperCase();
  if (/INDEBTEDNESS|^DEBT/.test(u)) return "DEBT";
  if (/LIEN/.test(u)) return "LIENS";
  if (/RESTRICTED_PAYMENT|DIVIDEND/.test(u)) return "RESTRICTED_PAYMENTS";
  if (/INVESTMENT/.test(u)) return "INVESTMENTS";
  if (/ASSET_SALE|DISPOSITION/.test(u)) return "ASSET_SALES";
  if (/AFFILIATE/.test(u)) return "AFFILIATE_TRANSACTIONS";
  if (/FUNDAMENTAL|MERGER/.test(u)) return "FUNDAMENTAL_CHANGES";
  if (/PREPAY|JUNIOR/.test(u)) return "PREPAYMENTS";
  if (/RATIO|FINANCIAL/.test(u)) return "FINANCIAL_RATIOS";
  return u;
}


/** Dated Credit/Loan/Indenture reference from amendment preamble — evidence only, never a definition. */
export function namedDatedFacilityReference(text: string): string | null {
  const MONTHS = "January|February|March|April|May|June|July|August|September|October|November|December";
  const window = text.slice(0, 12_000).replace(/\s+/g, " ");
  const re = new RegExp(
    `\\b(?:the|that certain|a|an)\\s+((?:(?:First|Second|Third|Fourth|Fifth|Sixth|Seventh|Eighth|Ninth|Tenth)\\s+Amended and Restated\\s+|Amended and Restated\\s+|First Lien\\s+|Second Lien\\s+|Senior\\s+|Subordinated\\s+)?(?:(?:ABL|Term(?:\\s+Loan)?|Revolving(?:\\s+Credit)?|Bridge|Senior Secured(?:\\s+First Lien)?)\\s+)?(?:Credit Agreement|Loan Agreement|Indenture))\\s*,?\\s*dated\\s+(?:as\\s+of\\s+)?(?:the\\s+)?((?:${MONTHS})\\s+\\d{1,2},\\s*\\d{4})`,
    "i",
  );
  const m = re.exec(window);
  return m ? m[0].replace(/\s+/g, " ").trim() : null;
}

/** Decimal string for a ratio limit ("4.5", "9/2" → "4.5"); null if not a terminating decimal within 6 places. */
function limitDecimal(num: number, den: number): string | null {
  if (!(num > 0) || !(den > 0)) return null;
  const v = num / den;
  const s = Number(v.toFixed(6));
  if (Math.abs(s - v) > 1e-9) return null;
  return String(s);
}

/**
 * Capacity before each incurrence ratio is hit. LEVERAGE = one debt-like numerator / one EBITDA denominator with a
 * maximum; COVERAGE = one EBITDA numerator / one interest denominator with a minimum. Exactly one distinct limit
 * per ratio (thresholds stated in the agreement); anything else is refused (NEEDS_INPUT).
 */
export function incurrenceRatioCapacity(ratios: readonly ComputedRatio[], text: string, decisions: readonly BindDecision[], fin?: IssuerFinancials | null): RatioCapacity[] {
  const out: RatioCapacity[] = [];
  const cache = new Map<string, BindDecision | null>();
  const dec = (name: string) => {
    const hit = decisions.find((d) => d.metricName.toLowerCase() === name.toLowerCase());
    if (hit || !fin) return hit ?? null;
    if (!cache.has(name)) cache.set(name, decide(name, text, fin));
    return cache.get(name)!;
  };
  // Operands from each ratio's own definition text ("the ratio of (a) X to (b) Y"), when the catalog row has none.
  const parsed = new Map(parseDefinitions({ documentId: "doc", role: "CREDIT_AGREEMENT", text }).filter((d) => !d.subtrahendMetrics.length).map((d) => [d.ratioName, d]));
  const withOps: Array<Pick<ComputedRatio, "displayName" | "numerator" | "denominator" | "thresholds">> = ratios.map((r) => {
    const d = !r.numerator.length && !r.denominator.length ? parsed.get(r.displayName) : undefined;
    return d ? { ...r, numerator: d.numeratorMetrics.map((metricName) => ({ metricName }) as ComputedRatio["numerator"][number]), denominator: d.denominatorMetrics.map((metricName) => ({ metricName }) as ComputedRatio["denominator"][number]) } : r;
  });
  for (const d of parsed.values()) if (!withOps.some((r) => r.displayName === d.ratioName)) withOps.push({ displayName: d.ratioName, numerator: d.numeratorMetrics.map((metricName) => ({ metricName }) as ComputedRatio["numerator"][number]), denominator: d.denominatorMetrics.map((metricName) => ({ metricName }) as ComputedRatio["denominator"][number]), thresholds: [] });
  ratios = withOps as unknown as readonly ComputedRatio[];
  const op = (d: BindDecision | null) => (d ? { status: d.status, value: d.input?.value ?? null } : null);
  const seen = new Set<string>();
  for (const r of ratios) {
    if (seen.has(r.displayName)) continue;
    seen.add(r.displayName);
    const lev = /leverage/i.test(r.displayName), cov = /coverage/i.test(r.displayName) && /interest|EBITDA/i.test(r.displayName + r.denominator.map((d) => d.metricName).join(" "));
    if (!lev && !cov) continue;
    if (r.numerator.length !== 1 || r.denominator.length !== 1) continue;
    const num = r.numerator[0]!.metricName, den = r.denominator[0]!.metricName;
    const kind = lev ? "LEVERAGE" as const : "COVERAGE" as const;
    const ebitdaName = kind === "LEVERAGE" ? den : num, otherName = kind === "LEVERAGE" ? num : den;
    if (!/EBITDA/i.test(ebitdaName)) continue;
    if (kind === "COVERAGE" && !/interest/i.test(otherName)) continue;
    const want = kind === "LEVERAGE" ? "MAX" : "MIN";
    let limits = r.thresholds.filter((t) => t.direction === want).map((t) => { const [a, b = "1"] = t.canonical.split("/"); return limitDecimal(Number(a), Number(b)); });
    if (!r.thresholds.length) limits = covenantRatioThresholds(text, r.displayName, [num], [den]).filter((f) => (want === "MAX" ? f.comparator !== "AT_LEAST" : f.comparator === "AT_LEAST")).map((f) => limitDecimal(f.num, f.den));
    const distinct = [...new Set(limits)];
    if (distinct.length !== 1 || distinct[0] == null) {
      if (limits.length) out.push({ name: r.displayName, kind, limit: distinct.filter(Boolean).join("|") || "?", status: "NEEDS_INPUT", capacity: null, capacityOf: kind === "LEVERAGE" ? "DEBT" : "INTEREST_EXPENSE", bound: null, reason: "ratio limit ambiguous (not exactly one); refused" });
      continue;
    }
    out.push(ratioCapacity({ name: r.displayName, kind, limit: distinct[0]!, ebitda: op(dec(ebitdaName)), other: op(dec(otherName)) }));
  }
  return out;
}

/** Bind an amendment to a package base document. UNRESOLVED (recital-only) links never bind. */
export function bindAmendmentBase(amendText: string, base: { documentId: string; text: string }): { tier: "CONFIRMED" | "LOWER_CONFIDENCE"; relationship: string; resolutionMethod: string } | null {
  const g = buildPackageGraph("pkg", "pkg", [{ documentId: "__amendment__", label: "amendment", text: amendText }, { documentId: base.documentId, label: "base agreement", text: base.text }]);
  const rels = g.relationshipCandidates.filter((x) => x.sourceDocumentId === "__amendment__" && x.targetDocumentId === base.documentId && /AMENDS|RESTATES|SUPPLEMENTS|MODIFIES/.test(x.relationshipType));
  const ok = rels.find((x) => x.status === "RESOLVED") ?? rels.find((x) => x.status === "REVIEW_REQUIRED");
  return ok ? { tier: ok.status === "RESOLVED" ? "CONFIRMED" : "LOWER_CONFIDENCE", relationship: ok.relationshipType, resolutionMethod: ok.resolutionMethod } : null;
}

export function runAgreementPipeline(args: { sourceId: string; text: string; issuerCik?: string | null; financials?: IssuerFinancials | null; facilityFacts?: readonly FacilityFact[] | null; baseDocuments?: ReadonlyArray<{ documentId: string; text: string }> | null; priorFinancials?: IssuerFinancials | null }): AgreementPipelineResult {
  const raw = args.text ?? "";
  const tree = parseDocumentTree(raw);
  const roles = new Map<string, ClauseRole>();
  for (const n of tree.nodes) if (n.kind === "CLAUSE") roles.set(n.id, roleOf(tree, tree.text, n));
  const crossRefs = resolveCrossRefs(tree, tree.text);
  const checklist = covenantChecklist(tree, tree.text);

  // Extractor-only (v0 ruleset): no learned rules, so nothing issuer-specific can leak in.
  const rules = emptyRuleSet(0);
  const pkg = buildComputationPackage({ source: { sourceId: args.sourceId, issuerCik: args.issuerCik ?? null }, documentText: raw, candidates: [], rules });
  // Amount-bearing tree clauses (BASKET / EXCEPTION_PROVISO with a "$" figure or "greater of") inside sections the
  // checklist assigned to a covenant family, when the regional extractor did not already cite them. Exact spans of
  // the tree text; family from the section classifier. Pipeline-only (the scoreboard path is unchanged).
  const famBySection = new Map<string, string>();
  for (const c of checklist) for (const p of c.sectionPaths) if (!famBySection.has(p)) famBySection.set(p, c.family);
  const cited = pkg.baskets.map((b) => b.operativeText.replace(/[^A-Za-z0-9]/g, "")).join("|");
  const sumSeen = new Set<string>();
  for (const n of tree.nodes) {
    if (n.kind !== "CLAUSE") continue;
    const role = roles.get(n.id);
    if (role !== "BASKET" && role !== "EXCEPTION_PROVISO") continue;
    const sec = sectionOf(tree, n);
    const family = sec ? famBySection.get(sec.path) : undefined;
    if (!family) continue;
    let own = ownText(tree, tree.text, n).trim();
    if (own.length < 24 && !/\$\s?[\d,]{3,}/.test(own)) continue;
    if (!/\$\s?[\d,]{3,}|greater\s+of/i.test(own)) continue;
    // A limb of a sum ("the sum of (1) 50% of CNI, plus (2) ..., plus (3) $200M") is not a cap by itself: cite the
    // whole sum so it is computed as a builder (NEEDS_INPUT while any component is unbound).
    const sum = sumAncestor(tree, n);
    if (sum) {
      if (sumSeen.has(sum.id)) continue;
      sumSeen.add(sum.id);
      own = tree.text.slice(sum.start, sum.end).trim();
    }
    if (own.length < 24) continue;
    const key = own.replace(/[^A-Za-z0-9]/g, "").slice(0, 80);
    if (key.length < 20 || cited.includes(key)) continue;
    pkg.baskets.push({ stableKey: `tree:${n.path}`, sectionRef: n.path, covenantFamily: family, documentId: pkg.baskets[0]?.documentId ?? args.sourceId, operativeText: own, role: "PERMISSION" });
  }
  joinSplitGreaterOf(pkg);
  let result = runCovenantComputation(pkg, { rules, createdAt: "1970-01-01T00:00:00.000Z" });
  let xbrl: AgreementPipelineResult["xbrl"];
  if (args.financials) {
    const before = { basketsComputed: result.baskets.filter((b) => b.capStatus === "COMPUTED").map((b) => b.stableKey), ratiosComputed: result.ratios.filter((r) => r.status === "COMPUTED").map((r) => r.stableKey) };
    // Bind filing figures only to the metric names this computation asked for, each gated by its own definition.
    const requested = [...new Set([...result.baskets.flatMap((b) => b.missingInputs), ...result.ratios.flatMap((r) => r.missingInputs)])];
    const decisions = requested.map((name) => decide(name, tree.text, args.financials!)).filter((d) => d.family);
    const externalMetrics = decisions.map(toMetricInput).filter((m): m is NonNullable<typeof m> => !!m);
    if (externalMetrics.length) result = runCovenantComputation(pkg, { rules, createdAt: "1970-01-01T00:00:00.000Z", externalMetrics });
    // Lower-bound metrics: a cap that rises with the metric (greater-of / % of / builder) is "at least"; a ratio is
    // bounded only when exactly one operand is a lower bound; anything else that used one goes back to NEEDS_INPUT.
    const lb = decisions.filter((d) => d.status === "LOWER_BOUND");
    const bounds: NonNullable<AgreementPipelineResult["xbrl"]>["bounds"] = [];
    const reverted: string[] = [];
    const uses = (s: string, m: string) => new RegExp(`\\b${m.replace(/\s+/g, "\\s+")}\\b`, "i").test(s);
    if (lb.length) {
      for (const b of result.baskets) {
        if (b.capStatus !== "COMPUTED" || b.capBound) continue; // already a bound from the fixed limbs alone
        const d = lb.find((x) => uses(b.citationExcerpt, x.metricName));
        if (!d) continue;
        if (["GROWER_GREATER_OF", "PCT_OF_METRIC", "BUILDER_AVAILABLE_AMOUNT"].includes(b.category)) bounds.push({ stableKey: b.stableKey, kind: "AT_LEAST", metric: d.metricName, missing: d.evaluation?.missing ?? [] });
        else { b.capStatus = "NEEDS_INPUT"; b.capCanonical = null; b.missingInputs = [...b.missingInputs, `${d.metricName} (only a lower bound is derivable)`]; reverted.push(b.stableKey); }
      }
      for (const r of result.ratios) {
        if (r.status !== "COMPUTED") continue;
        const sub = new Set(subtrahendNames(r.expression).map((x) => x.toLowerCase()));
        const has = (list: { metricName: string }[], d: { metricName: string }) => list.some((n) => n.metricName.toLowerCase() === d.metricName.toLowerCase());
        const numLb = lb.filter((x) => has(r.numerator, x) && !sub.has(x.metricName.toLowerCase()));
        const subLb = lb.filter((x) => sub.has(x.metricName.toLowerCase()));
        const den = lb.filter((x) => has(r.denominator, x));
        if (!numLb.length && !subLb.length && !den.length) continue;
        // Numerator lower bound (a lower-bounded subtrahend makes it an upper bound); a lower-bounded denominator turns
        // the direction. Mixed directions, or a bounded denominator under a negative numerator, give no bound.
        // Debt / (that same debt + equity) rises with the debt (equity > 0): a lower-bounded debt in both places gives
        // a lower-bounded ratio.
        if (numLb.length === 1 && !subLb.length && den.length === 1 && den[0]!.growsWith && den[0]!.growsWith.toLowerCase() === numLb[0]!.metricName.toLowerCase()) {
          bounds.push({ stableKey: r.stableKey, kind: "AT_LEAST", metric: numLb[0]!.metricName, missing: numLb[0]!.evaluation?.missing ?? [] });
          continue;
        }
        const numDir = numLb.length && subLb.length ? null : numLb.length ? "LB" : subLb.length ? "UB" : "EXACT";
        const ratioDir = numDir == null ? null : den.length ? (numDir === "LB" ? null : "UB") : numDir === "EXACT" ? null : numDir;
        const negative = r.canonical != null && r.canonical.startsWith("-");
        if (ratioDir == null || (den.length && negative)) { r.status = "NEEDS_INPUT"; r.canonical = null; r.thresholds = r.thresholds.map((t) => ({ ...t, headroomStatus: "NEEDS_INPUT", headroomCanonical: null })); reverted.push(r.stableKey); continue; }
        const d = (numLb[0] ?? subLb[0] ?? den[0])!;
        bounds.push({ stableKey: r.stableKey, kind: ratioDir === "LB" ? "AT_LEAST" : "AT_MOST", metric: d.metricName, missing: [...new Set([...numLb, ...subLb, ...den].flatMap((x) => x.evaluation?.missing ?? []))] });
      }
    }
    xbrl = { cik: args.financials.cik, decisions, before, bounds, reverted };
  }
  const computed = result.baskets;
  // Ratio thresholds stated in the operative covenant (not in a basket clause): taken only when exactly one exists.
  for (const r of result.ratios) {
    if (r.status !== "COMPUTED" || r.thresholds.length) continue;
    const found = covenantRatioThresholds(tree.text, r.displayName, r.numerator.map((n) => n.metricName), r.denominator.map((n) => n.metricName));
    if (found.length !== 1) continue;
    const f = found[0]!;
    const g = (a: bigint, b: bigint): bigint => (b === 0n ? a : g(b, a % b));
    const [n, d] = [BigInt(Math.round(f.num * 1e6)), BigInt(Math.round(f.den * 1e6))];
    const k = g(n, d);
    const canonical = d / k === 1n ? `${n / k}` : `${n / k}/${d / k}`;
    r.thresholds = [attachHeadroom({ sectionRef: "", sourceDocumentId: args.sourceId, citationExcerpt: f.sentence, raw: f.raw, canonical, direction: f.comparator === "AT_LEAST" ? "MIN" : "MAX", comparator: f.comparator, headroomStatus: "NEEDS_INPUT", headroomCanonical: null }, r.canonical)];
  }
  const boundOf = new Map((xbrl?.bounds ?? []).map((b) => [b.stableKey, b.kind]));
  const headroom: HeadroomRow[] = [];
  for (const r of result.ratios) {
    if (r.status !== "COMPUTED") continue;
    const ub = boundOf.get(r.stableKey);
    if (!r.thresholds.length) headroom.push({ stableKey: r.stableKey, kind: "RATIO", name: r.displayName, sectionRef: null, status: "NEEDS_INPUT", usage: r.canonical, usageBound: ub ?? "EXACT", limit: null, direction: null, headroom: null, headroomBound: null, citation: null, missing: ["ratio threshold"] });
    for (const t of r.thresholds) headroom.push({ stableKey: r.stableKey, kind: "RATIO", name: r.displayName, sectionRef: t.sectionRef || null, status: t.headroomStatus === "COMPUTED" ? "COMPUTED" : "NEEDS_INPUT", usage: r.canonical, usageBound: ub ?? "EXACT", limit: t.canonical, direction: t.direction, headroom: t.headroomCanonical, headroomBound: t.headroomStatus === "COMPUTED" ? headroomBound(ub, t.direction) : null, citation: t.citationExcerpt, missing: t.headroomStatus === "COMPUTED" ? [] : ["ratio value"] });
  }
  // A basket's headroom is its cap minus what is already used under it; usage is not in the agreement or in XBRL.
  // Usage is read only for debt and lien baskets that name one facility matching exactly one filing debt-axis member.
  for (const b of computed) {
    if (b.capStatus !== "COMPUTED") continue;
    const row: HeadroomRow = { stableKey: b.stableKey, kind: "BASKET", name: b.category, sectionRef: b.sectionRef, status: "NEEDS_INPUT", usage: null, usageBound: "EXACT", limit: b.capCanonical, limitBound: b.capBound ?? boundOf.get(b.stableKey) ?? "EXACT", direction: "MAX", headroom: null, headroomBound: null, citation: b.citationExcerpt, missing: ["basket usage (amount already used under this basket)"] };
    const debtLike = /DEBT|LIEN/i.test(b.covenantFamily);
    const u = args.facilityFacts && debtLike ? basketUsage(b.citationExcerpt, args.facilityFacts, tree.text) : null;
    if (u && u.status === "NEEDS_INPUT") row.missing = [`basket usage: ${u.reason}`];
    if (u && u.status === "COMPUTED" && b.capCanonical && /^-?\d+(?:\.\d+)?$/.test(b.capCanonical)) {
      const capBound = boundOf.get(b.stableKey);
      const [ci, cf = ""] = b.capCanonical.split(".");
      const scale = 10n ** BigInt(cf.length);
      const capScaled = BigInt(ci! + cf);
      const h = capScaled - u.usage * scale;
      const hs = cf.length ? `${h < 0n ? "-" : ""}${(h < 0n ? -h : h) / scale}.${((h < 0n ? -h : h) % scale).toString().padStart(cf.length, "0")}` : h.toString();
      Object.assign(row, { status: "COMPUTED", usage: u.usage.toString(), usageBound: "EXACT", headroom: hs, headroomBound: (b.capBound ?? capBound) === "AT_LEAST" ? "AT_LEAST" : (b.capBound ?? capBound) === "AT_MOST" ? "AT_MOST" : "EXACT", missing: [], usageSource: `${u.facility} → ${u.fact.concept} [${u.fact.member}] ${u.fact.instant} accn ${u.fact.accession}` });
    }
    headroom.push(row);
  }

  // Consolidated EBITDA optimizer → leverage debt capacity (general rules; no invented inputs).
  if (args.financials && xbrl) {
    let term = findEbitdaMeasureTerm(tree.text);
    let defText = tree.text;
    let binding: NonNullable<AgreementPipelineResult["xbrl"]>["ebitdaBinding"];
    let baseHold: NonNullable<AgreementPipelineResult["xbrl"]>["ebitdaBaseHold"];
    if (!term && args.baseDocuments?.length) {
      const namedBase = namedDatedFacilityReference(tree.text) ?? "base agreement";
      for (const b of args.baseDocuments) {
        const bt = parseDocumentTree(b.text).text;
        const bterm = findEbitdaMeasureTerm(bt);
        const bind = bindAmendmentBase(tree.text, { documentId: b.documentId, text: bt });
        if (!bind) { baseHold ??= { reason: "BASE_NOT_BOUND", namedBase, missing: "package-graph did not bind the amendment to the supplied base (recital-only / no link)" }; continue; }
        if (!bterm) continue;
        // Fail-closed: an amendment that rewrites the measure or its net-income base needs a conformed text.
        const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        if ([bterm, "Consolidated Net Income", "Net Income"].some((x) => new RegExp(`["“]\\s*${esc(x)}\\s*["”]|definition\\s+of\\s+["“]?${esc(x)}`, "i").test(tree.text))) {
          baseHold = { reason: "AMENDED_DEFINITION", namedBase, missing: `amendment rewrites "${bterm}" or its net-income base; conformed text needed` };
          continue;
        }
        term = bterm; defText = bt; binding = { tier: bind.tier, baseDocumentId: b.documentId, relationship: bind.relationship, resolutionMethod: bind.resolutionMethod }; baseHold = undefined;
        break;
      }
    }
    if (term) {
      const ebitda = optimizeConsolidatedEbitda(term, defText, args.financials);
      if (binding) { xbrl.ebitdaBinding = binding; ebitda.bindingTier = binding.tier; }
      xbrl.ebitda = ebitda;
      const levRows: Array<{ kind: string; name: string; direction: string | null; limit: string | null }> = headroom.filter((h) => h.kind === "RATIO");
      for (const r of result.ratios) {
        if (!/leverage/i.test(r.displayName) || /secured|senior|first\s+lien|interest/i.test(r.displayName)) continue;
        if (levRows.some((x) => x.name === r.displayName && x.limit != null)) continue;
        const found = covenantRatioThresholds(tree.text, r.displayName, r.numerator.map((n) => n.metricName), r.denominator.map((n) => n.metricName));
        for (const f of found) {
          if (f.comparator !== "NO_GREATER_THAN" || !(f.den > 0)) continue;
          const limit = f.den === 1 ? String(f.num) : String(f.num / f.den);
          if (!/^\d+(?:\.\d+)?$/.test(limit)) continue;
          levRows.push({ kind: "RATIO", name: r.displayName, direction: "MAX", limit });
        }
      }
      xbrl.ratioCapacity = incurrenceRatioCapacity(result.ratios, tree.text, xbrl.decisions, args.financials).map((c) => (binding ? { ...c, bindingTier: binding.tier } : c));
      const lev = maxLeverageLimit(levRows);
      const debt = debtFromFinancials(args.financials);
      xbrl.addBackTracker = trackAddBacks(ebitda, args.financials, args.priorFinancials ?? null, lev);
      if (lev != null && debt != null) xbrl.leverageCapacity = { ...leverageDebtCapacity(ebitda, lev, debt), ...(binding ? { bindingTier: binding.tier } : {}) };
      // Baskets sized from this EBITDA carry the binding tier too.
      if (binding) for (const row of headroom) if (row.kind === "BASKET" && /EBITDA/i.test(row.citation ?? "")) row.bindingTier = binding.tier;
    } else if (baseHold) {
      xbrl.ebitdaBaseHold = baseHold;
    } else {
      // Fail-closed: name the dated base facility when an amendment has no in-text EBITDA schedule.
      // package-graph can resolve definitions once that base text is in the package — never invent it.
      const namedBase = namedDatedFacilityReference(tree.text)
        ?? extractDocumentIdentity({ documentId: args.sourceId, label: args.sourceId, text: tree.text }).originalAgreementReferenceHint;
      if (namedBase) {
        xbrl.ebitdaBaseHold = {
          reason: "AMENDMENT_NEEDS_BASE_TEXT",
          namedBase,
          missing: "base credit/loan agreement text not in package (package-graph cannot bind definitions)",
        };
      }
    }
  }

  const families: FamilySummary[] = [];
  const byFam = new Map<string, ComputedBasket[]>();
  for (const b of computed) {
    const f = checklistFamilyOf(b.covenantFamily);
    byFam.set(f, [...(byFam.get(f) ?? []), b]);
  }
  const famNames = [...CHECKLIST_FAMILIES, ...[...byFam.keys()].filter((f) => !(CHECKLIST_FAMILIES as readonly string[]).includes(f)).sort()];
  for (const family of famNames) {
    const ck = checklist.find((c) => c.family === family);
    const bs = byFam.get(family) ?? [];
    const baskets = bs.map((b) => {
      // Never unlimited by default: only explicit unlimited-capacity text keeps UNLIMITED.
      const explicitUnlimited = b.capKind === "UNLIMITED" && b.category === "UNLIMITED";
      const defaulted = b.capKind === "UNLIMITED" && !explicitUnlimited;
      return {
        sectionRef: b.sectionRef,
        category: b.category,
        capStatus: defaulted ? "NEEDS_INPUT" : b.capStatus,
        cap: defaulted ? null : b.capCanonical ?? (explicitUnlimited ? "UNLIMITED_EXPLICIT" : null),
        currency: b.capCurrency,
        missingInputs: defaulted ? ["cap not located in clause text"] : b.missingInputs,
        citation: b.citationExcerpt.slice(0, 240),
        ...(xbrl?.bounds.some((x) => x.stableKey === b.stableKey && x.kind === "AT_LEAST") ? { capBound: "AT_LEAST" as const } : {}),
      };
    });
    const needsInputs = [...new Set([...(ck?.needsInputs ?? []), ...baskets.flatMap((b) => b.missingInputs)])];
    let outcome: FamilyOutcome;
    if (baskets.some((b) => b.capStatus === "COMPUTED" && b.cap && b.cap !== "UNLIMITED_EXPLICIT")) outcome = "CAP_COMPUTED";
    else if (baskets.some((b) => b.capStatus === "NEEDS_INPUT" || b.capStatus === "UNKNOWN") || ck?.status === "NEEDS_INPUT") outcome = "NEEDS_INPUT";
    else if (baskets.some((b) => b.cap === "UNLIMITED_EXPLICIT")) outcome = "UNLIMITED_EXPLICIT";
    else if (ck?.status === "ABSENT_VERIFIED" && !ck.absentScope) outcome = "ABSENT_VERIFIED";
    // Document-only absence (partial filing / incorporated-by-reference): the package is unresolved until the base is read.
    else if (ck?.status === "ABSENT_VERIFIED" && ck.absentScope) outcome = "MISSING";
    else if (ck && ck.status !== "MISSING") outcome = ck.status === "CAP_FOUND" ? "NEEDS_INPUT" : "CONDITIONS_LIMITED";
    else outcome = "MISSING";
    if (outcome === "MISSING" && !ck) continue;
    families.push({
      family, outcome, checklistStatus: ck?.status ?? "N/A", sectionPaths: ck?.sectionPaths ?? [], baskets, needsInputs,
      ...(ck?.absentScope ? { absentScope: ck.absentScope } : {}),
    });
  }

  return {
    pipelineVersion: PIPELINE_VERSION,
    parserVersion: sectionTreeParserVersion(),
    textSha256: sha(raw),
    basis: tree.basis,
    textLength: raw.length,
    tree, roles, crossRefs, checklist, computedBaskets: computed, computedRatios: result.ratios, headroom, xbrl, families,
    stats: {
      nodes: tree.nodes.length,
      sections: tree.nodes.filter((n) => n.kind === "SECTION").length,
      clauses: tree.nodes.filter((n) => n.kind === "CLAUSE").length,
      xrefs: crossRefs.length,
      xrefResolved: crossRefs.filter((x) => x.status === "RESOLVED").length,
      baskets: computed.length,
    },
  };
}

// ---------------- persistence (additive tables created by prisma/migrations/20261014220000_section_tree_knowledge) ----------------
// No DDL here: tables come from migrations. Public corpus → kf_* (text sha256 + parser version).
// Customer uploads → customer_* only, scoped by (companyId, documentId); never the shared kf_* corpus tables.

export interface SqlExecutor { execute(sql: string, params?: unknown[]): Promise<Array<Record<string, unknown>>> }

const JSONB_COLS = new Set(["issues", "sectionPaths", "parts", "needsInputs", "totals", "stats", "families"]);
const INT_COLS = new Set(["start", "headingEnd", "end", "depth", "ord", "at", "textLength", "nodeCount", "xrefCount", "checklistCount", "findingCount", "spanStart", "spanEnd", "occurrence"]);

/** Multi-row INSERT ... ON CONFLICT DO NOTHING, chunked. */
export async function insertRows(ex: SqlExecutor, table: string, cols: string[], rows: unknown[][], chunk = 150): Promise<void> {
  for (let i = 0; i < rows.length; i += chunk) {
    const part = rows.slice(i, i + chunk);
    const params: unknown[] = [];
    // Explicit casts so typed drivers bind JSON text and integers correctly.
    const values = part.map((r) => "(" + r.map((v, j) => { params.push(v); return `$${params.length}${JSONB_COLS.has(cols[j] ?? "") ? "::jsonb" : INT_COLS.has(cols[j] ?? "") ? "::int" : ""}`; }).join(",") + ")");
    await ex.execute(`INSERT INTO ${table} (${cols.map((c) => `"${c}"`).join(",")}) VALUES ${values.join(",")} ON CONFLICT DO NOTHING`, params);
  }
}

/** Content key for a cross-reference: its span in the tree text plus sha256 of that span (not list position). */
export function xrefSpanKey(text: string, x: CrossRef): { spanStart: number; spanEnd: number; spanSha256: string } {
  const spanEnd = x.at + x.raw.length;
  return { spanStart: x.at, spanEnd, spanSha256: sha(text.slice(x.at, spanEnd)) };
}

/** Content-keyed rows; identical (span, hash) pairs collapse, which is the point of content keys. */
function xrefRows(r: AgreementPipelineResult) {
  const seen = new Set<string>();
  const out: Array<ReturnType<typeof xrefSpanKey> & { x: CrossRef }> = [];
  for (const x of r.crossRefs) {
    const k = xrefSpanKey(r.tree.text, x);
    const id = `${k.spanStart}:${k.spanEnd}:${k.spanSha256}`;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({ ...k, x });
  }
  return out;
}

async function countWhere(ex: SqlExecutor, table: string, h: string, pv: string): Promise<number> {
  return Number((await ex.execute(`SELECT count(*)::int AS n FROM ${table} WHERE "textSha256"=$1 AND "parserVersion"=$2`, [h, pv]))[0]?.n ?? -1);
}

/**
 * PUBLIC CORPUS ONLY (verified SEC / research texts). Writes tree nodes / content-keyed xrefs / checklist keyed by
 * textSha256 + parserVersion, verifies counts with SELECT, then writes the kf_tree_parses completion marker and the
 * pipeline result. Re-runs are no-ops. Customer uploads must use persistCustomerAgreementRun.
 */
export async function persistAgreementPipeline(ex: SqlExecutor, r: AgreementPipelineResult, meta: { sourceId: string; verification?: string | null }): Promise<{ nodes: number; xrefs: number; checklist: number }> {
  if (/^customer:|^cust-/i.test(meta.sourceId) || meta.verification === "CUSTOMER_UPLOAD") throw new Error("customer uploads must not be written to the shared kf_* corpus tables");
  const h = r.textSha256, pv = r.parserVersion;
  const nodes = r.tree.nodes.map((n) => [h, pv, n.id, n.parentId, n.kind, n.label, n.path, n.sectionNumber, n.title, n.level,
    n.start, n.headingEnd, n.end, n.depth, n.status, r.roles.get(n.id) ?? null, JSON.stringify(n.issues)]);
  const xr = xrefRows(r).map((k) => [h, pv, k.spanStart, k.spanEnd, k.spanSha256, k.x.fromNodeId, k.x.raw, k.x.target, k.x.status, k.x.targetNodeId]);
  const cl = r.checklist.map((c) => [h, pv, c.family, c.status, JSON.stringify(c.sectionPaths), JSON.stringify(c.parts), JSON.stringify(c.needsInputs), c.note]);
  await insertRows(ex, "kf_tree_nodes", ["textSha256","parserVersion","nodeId","parentId","kind","label","path","sectionNumber","title","level","start","headingEnd","end","depth","status","role","issues"], nodes, 100);
  await insertRows(ex, "kf_tree_xref_spans", ["textSha256","parserVersion","spanStart","spanEnd","spanSha256","fromNodeId","raw","target","status","targetNodeId"], xr);
  await insertRows(ex, "kf_tree_checklist", ["textSha256","parserVersion","family","status","sectionPaths","parts","needsInputs","note"], cl);
  const got = { nodes: await countWhere(ex, "kf_tree_nodes", h, pv), xrefs: await countWhere(ex, "kf_tree_xref_spans", h, pv), checklist: await countWhere(ex, "kf_tree_checklist", h, pv) };
  if (got.nodes !== nodes.length || got.xrefs !== xr.length || got.checklist !== cl.length) {
    throw new Error(`knowledge count mismatch for ${meta.sourceId}: nodes ${got.nodes}/${nodes.length} xrefs ${got.xrefs}/${xr.length} checklist ${got.checklist}/${cl.length}`);
  }
  await insertRows(ex, "kf_tree_parses", ["textSha256","parserVersion","sourceId","basis","verification","textLength","nodeCount","xrefCount","checklistCount"],
    [[h, pv, meta.sourceId, r.basis, meta.verification ?? null, r.textLength, nodes.length, xr.length, cl.length]]);
  await insertRows(ex, "kf_agreement_pipeline_results", ["textSha256","parserVersion","pipelineVersion","sourceId","companyId","documentId","stats","families"],
    [[h, pv, r.pipelineVersion, meta.sourceId, null, null, JSON.stringify(r.stats), JSON.stringify(r.families)]]);
  return got;
}

/** Minimal Prisma surface used for customer persistence (so tests can pass an in-memory fake). */
export interface CustomerStore {
  $transaction<T>(fn: (tx: CustomerStore) => Promise<T>): Promise<T>;
  customerAgreementRun: {
    create(args: { data: Record<string, unknown> }): Promise<{ id: string }>;
    findUnique(args: { where: { runKey: string } }): Promise<{ id: string; status: string } | null>;
    update(args: { where: { id: string }; data: Record<string, unknown> }): Promise<{ id: string }>;
  };
  customerTreeNode: { createMany(args: { data: Record<string, unknown>[] }): Promise<{ count: number }> };
  customerTreeXref: { createMany(args: { data: Record<string, unknown>[] }): Promise<{ count: number }> };
  customerTreeChecklist: { createMany(args: { data: Record<string, unknown>[] }): Promise<{ count: number }> };
}

export function customerRunKey(scope: { companyId: string; documentId: string }, textSha256: string | null, parserVersion: string, pipelineVersion: string): string {
  return sha([scope.companyId, scope.documentId, textSha256 ?? "", parserVersion, pipelineVersion].join("|"));
}

export type CustomerRunOutcome =
  | { status: "OK"; runId: string; textSha256: string; stored: { nodes: number; xrefs: number; checklist: number }; reused?: boolean }
  | { status: "FAILED"; runId: string | null; error: string };

/**
 * Customer upload persistence. Isolation key = (companyId, documentId): every row hangs off a customer_agreement_runs
 * row for that company+document, so identical texts uploaded by two customers never collapse or cross. A pipeline
 * failure is recorded as a FAILED run with the error (visible), and is returned rather than thrown.
 */
export async function persistCustomerAgreementRun(
  db: CustomerStore,
  scope: { companyId: string; documentId: string; sourceId: string },
  run: () => AgreementPipelineResult | Promise<AgreementPipelineResult>,
): Promise<CustomerRunOutcome> {
  if (!scope.companyId || !scope.documentId) throw new Error("customer agreement runs require companyId and documentId");
  // FAILED rows are keyed too, so repeated failing re-analysis updates one row instead of piling up.
  const recordFailure = async (data: Record<string, unknown>): Promise<{ id: string }> => {
    const runKey = customerRunKey(scope, (data.textSha256 as string | undefined) ?? null, String(data.parserVersion), String(data.pipelineVersion));
    const prior = await db.customerAgreementRun.findUnique({ where: { runKey } });
    if (prior) return db.customerAgreementRun.update({ where: { id: prior.id }, data: { status: "FAILED", error: data.error } });
    return db.customerAgreementRun.create({ data: { ...data, runKey } });
  };
  let r: AgreementPipelineResult;
  try {
    r = await run();
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    try {
      const row = await recordFailure({ ...scope, parserVersion: sectionTreeParserVersion(), pipelineVersion: PIPELINE_VERSION, status: "FAILED", error });
      return { status: "FAILED", runId: row.id, error };
    } catch (err2) {
      return { status: "FAILED", runId: null, error: `${error}; failure record not written: ${err2 instanceof Error ? err2.message : String(err2)}` };
    }
  }
  const runKey = customerRunKey(scope, r.textSha256, r.parserVersion, r.pipelineVersion);
  try {
    // Re-analysis of identical input reuses the completed run (deterministic pipeline → identical rows).
    const prior = await db.customerAgreementRun.findUnique({ where: { runKey } });
    if (prior?.status === "OK") return { status: "OK", runId: prior.id, textSha256: r.textSha256, stored: { nodes: r.tree.nodes.length, xrefs: xrefRows(r).length, checklist: r.checklist.length }, reused: true };
    return await db.$transaction(async (tx) => {
      const okData = { ...scope, runKey, textSha256: r.textSha256, parserVersion: r.parserVersion, pipelineVersion: r.pipelineVersion, status: "OK", error: null, stats: r.stats, families: r.families };
      // A prior FAILED run with the same key is promoted in place (it has no child rows).
      const row = prior ? await tx.customerAgreementRun.update({ where: { id: prior.id }, data: okData }) : await tx.customerAgreementRun.create({ data: okData });
      const runId = row.id;
      const n = await tx.customerTreeNode.createMany({ data: r.tree.nodes.map((x) => ({ runId, nodeId: x.id, parentId: x.parentId, kind: x.kind, label: x.label, path: x.path, sectionNumber: x.sectionNumber, title: x.title, level: x.level, start: x.start, headingEnd: x.headingEnd, end: x.end, depth: x.depth, status: x.status, role: r.roles.get(x.id) ?? null, issues: x.issues })) });
      const xr = await tx.customerTreeXref.createMany({ data: xrefRows(r).map((k) => ({ runId, spanStart: k.spanStart, spanEnd: k.spanEnd, spanSha256: k.spanSha256, fromNodeId: k.x.fromNodeId, raw: k.x.raw, target: k.x.target, status: k.x.status, targetNodeId: k.x.targetNodeId })) });
      // absentScope lives on FamilySummary (persisted in customer_agreement_runs.families JSON); the checklist table has no column yet.
      const cl = await tx.customerTreeChecklist.createMany({ data: r.checklist.map((c) => ({ runId, family: c.family, status: c.status, sectionPaths: c.sectionPaths, parts: c.parts, needsInputs: c.needsInputs, note: c.note })) });
      return { status: "OK" as const, runId, textSha256: r.textSha256, stored: { nodes: n.count, xrefs: xr.count, checklist: cl.count } };
    });
  } catch (err) {
    const error = `persist failed: ${err instanceof Error ? err.message : String(err)}`;
    try {
      const row = await recordFailure({ ...scope, textSha256: r.textSha256, parserVersion: r.parserVersion, pipelineVersion: r.pipelineVersion, status: "FAILED", error });
      return { status: "FAILED", runId: row.id, error };
    } catch {
      return { status: "FAILED", runId: null, error };
    }
  }
}

const SUM_LEAD = /\b(?:the\s+)?(?:sum|aggregate)\s+of\b[^.;]{0,40}$|\bplus\b[^.;]{0,20}$|\b(?:sum|aggregate)\s+of\s*:?\s*$/i;
const SUM_LIMB = /\bplus\b|\bminus\b/i;

/** Nearest clause ancestor that introduces a sum whose limbs include node n (lead-in ends "sum of" / limbs joined by "plus"). */
function sumAncestor(tree: AgreementPipelineResult["tree"], n: AgreementPipelineResult["tree"]["nodes"][number]) {
  const byId = new Map(tree.nodes.map((x) => [x.id, x]));
  let p = n.parentId ? byId.get(n.parentId) : undefined;
  for (let hops = 0; p && p.kind === "CLAUSE" && hops < 3; hops++, p = p.parentId ? byId.get(p.parentId) : undefined) {
    const lead = ownText(tree, tree.text, p).trim();
    const body = tree.text.slice(p.start, p.end);
    if (SUM_LEAD.test(lead) || (/\b(?:sum|aggregate)\s+of\b/i.test(lead) && SUM_LIMB.test(body))) return p;
  }
  return null;
}


const FIRST_LIMB_ONLY = /greater\s+of\s*:?\s*(?:(?:\(\s*\w{1,4}\s*\)\s*)?(?:U\.S\.\s*)?\$\s*[\d,]+(?:\.\d+)?(?:\s+million)?\s*(?:,|and|or)?)?\s*$/i;

/**
 * A greater-of whose second limb sits in the next tree node ("… the greater of (1) $250,000,000" / "(2) 2% of
 * Consolidated Total Assets …") is cited as one clause: the cited text is extended with the exact following document
 * text up to the end of the percent limb, and the orphaned percent-limb clause is dropped (it is not a cap by itself).
 */
/** Metric names under the subtracted side of a ratio numerator ("Debt minus Cash"). */
function subtrahendNames(e: unknown): string[] {
  const x = e as { kind?: string; numerator?: { kind?: string; right?: unknown } } | null;
  const right = x?.kind === "DIVIDE" && x.numerator?.kind === "SUBTRACT" ? x.numerator.right : null;
  const out: string[] = [];
  const walk = (n: unknown) => { const y = n as { kind?: string; metricName?: string; operands?: unknown[] } | null; if (!y) return; if (y.kind === "METRIC_REFERENCE" && y.metricName) out.push(y.metricName); (y.operands ?? []).forEach(walk); };
  walk(right);
  return out;
}

/**
 * Headroom label for a bounded ratio: actual − limit (MIN) or limit − actual (MAX). An AT_LEAST ratio gives at-least
 * headroom against a minimum and at-most headroom against a maximum; an AT_MOST ratio the reverse.
 */
export function headroomBound(ratioBound: "AT_LEAST" | "AT_MOST" | undefined, direction: "MIN" | "MAX"): "EXACT" | "AT_LEAST" | "AT_MOST" {
  if (!ratioBound) return "EXACT";
  return (ratioBound === "AT_LEAST") === (direction === "MIN") ? "AT_LEAST" : "AT_MOST";
}

export function joinSplitGreaterOf(pkg: { documents: Array<{ documentId: string; text: string }>; baskets: Array<{ operativeText: string; documentId: string }> }): number {
  let joined = 0;
  const drop = new Set<number>();
  pkg.baskets.forEach((b, i) => {
    const op = b.operativeText.replace(/\s+$/, "");
    if (!FIRST_LIMB_ONLY.test(op.replace(/\s+/g, " "))) return;
    // Already cited whole by another clause ("… greater of (1) $X and (2) Y% of …"): drop the truncated duplicate.
    const nOp = op.replace(/\s+/g, " ").trim(), key = nOp.slice(nOp.toLowerCase().lastIndexOf("greater of"));
    if (pkg.baskets.some((o, j) => j !== i && !drop.has(j) && (() => { const n = o.operativeText.replace(/\s+/g, " "); const k = n.indexOf(key); return k >= 0 && /^[^;]{0,120}%/.test(n.slice(k + key.length)) && (key.length > 12 || /\$/.test(n.slice(k + key.length, k + key.length + 120))); })())) { drop.add(i); return; }
    const doc = pkg.documents.find((d) => d.documentId === b.documentId) ?? pkg.documents[0];
    if (!doc) return;
    const loc = new RegExp(nOp.slice(-200).replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/ /g, "\\s+")).exec(doc.text);
    if (!loc) return;
    const at = loc.index + loc[0].length - op.length;
    const end = loc.index + loc[0].length;
    const tail = doc.text.slice(end, end + 600);
    if (at < 0 || doc.text.slice(at, end).replace(/\s+/g, " ").trim() !== nOp) return;
    const m = /^[^;]{0,160}?(?:\(\s*\w{1,4}\s*\)\s*)?(?:an\s+amount\s+equal\s+to\s+)?(?:[a-z][a-z\- ]{2,40}\s+percent\s*\(\s*)?\d+(?:\.\d+)?\s*%\s*\)?\s+of\s+[^;]{3,240}?(?=;|\.\s|\.$|$)/.exec(tail);
    if (!m || /greater\s+of/i.test(m[0]) || (!/\$/.test(nOp.slice(nOp.toLowerCase().lastIndexOf("greater of"))) && !/\$/.test(m[0]))) return;
    b.operativeText = doc.text.slice(at, end) + m[0];
    joined++;
    const limb = m[0].replace(/\s+/g, " ").trim();
    pkg.baskets.forEach((o, j) => { if (j !== i && limb.includes(o.operativeText.replace(/\s+/g, " ").trim()) && /%/.test(o.operativeText)) drop.add(j); });
  });
  if (drop.size) pkg.baskets.splice(0, pkg.baskets.length, ...pkg.baskets.filter((_, j) => !drop.has(j)));
  return joined;
}
