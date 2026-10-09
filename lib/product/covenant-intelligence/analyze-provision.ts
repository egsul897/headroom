/**
 * Substantive, source-backed provision analysis built on KF extractors.
 * Explains what the provision does — does not invent capacity or permission.
 */

import { detectPatternsInText, getPattern } from "../../knowledge-factory/patterns/library";
import { extractConditionsAndExceptions } from "../../knowledge-factory/pipeline/conditions";
import type {
  CovenantCandidateRecord,
  CrossReferenceRecord,
  DefinitionRecord,
  StructuralNodeRecord,
} from "../../knowledge-factory/types";
import type { CovenantCategoryKey } from "./summarize";

export type ProvisionPosture =
  | "GENERAL_PROHIBITION"
  | "ENUMERATED_PERMISSION"
  | "MAINTENANCE_TEST"
  | "CONDITIONAL_PERMISSION"
  | "OBLIGATION"
  | "UNRESOLVED";

export interface ProvisionAnalysis {
  sectionRef: string;
  heading: string;
  category: CovenantCategoryKey;
  categoryLabel: string;
  families: string[];
  posture: ProvisionPosture;
  /** Genuine plain-English explanation of operative substance. */
  plainEnglish: string;
  restriction: string | null;
  permissions: string[];
  coveredEntities: string[];
  entityScopeNotes: string[];
  exceptions: string[];
  conditions: string[];
  basketsAndThresholds: string[];
  draftingPatterns: string[];
  applicableDefinitions: Array<{ term: string; excerpt: string; resolved: boolean }>;
  crossReferences: string[];
  dependencies: string[];
  operativeLanguageExcerpt: string;
  sourceCitation: string;
  unresolved: string[];
  epistemicStatus: "DISCOVERED_CANDIDATE";
  interpretationNote: string;
}

const FAMILY_TO_CATEGORY: Record<string, CovenantCategoryKey> = {
  INDEBTEDNESS: "DEBT_INCURRENCE",
  INCREMENTAL_DEBT_AND_FACILITIES: "DEBT_INCURRENCE",
  RATIO_BASED_PERMISSIONS: "DEBT_INCURRENCE",
  LIENS: "LIENS_SECURED_DEBT",
  RESTRICTED_PAYMENTS: "RESTRICTED_PAYMENTS_INVESTMENTS",
  INVESTMENTS: "RESTRICTED_PAYMENTS_INVESTMENTS",
  ASSET_SALES: "ASSET_SALES",
  AFFILIATE_TRANSACTIONS: "AFFILIATE_TRANSACTIONS",
  GUARANTEES: "GUARANTEES",
  FUNDAMENTAL_CHANGES: "MERGERS_FUNDAMENTAL_CHANGES",
  FINANCIAL_MAINTENANCE_COVENANTS: "FINANCIAL_MAINTENANCE",
  EVENTS_OF_DEFAULT: "EVENTS_OF_DEFAULT",
  AVAILABLE_AMOUNT_AND_BUILDER_BASKETS: "BASKETS_EXCEPTIONS_CONDITIONS",
  SHARED_CAPACITY_PROVISIONS: "BASKETS_EXCEPTIONS_CONDITIONS",
  GENERAL_CONDITIONS_AND_EXCEPTIONS: "BASKETS_EXCEPTIONS_CONDITIONS",
  MANDATORY_PREPAYMENTS: "DEBT_INCURRENCE",
  JUNIOR_DEBT_PREPAYMENTS: "DEBT_INCURRENCE",
  RESTRICTED_SUBSIDIARIES: "OTHER",
  UNRESTRICTED_SUBSIDIARIES: "OTHER",
  DESIGNATIONS: "OTHER",
};

const CATEGORY_LABELS: Record<CovenantCategoryKey, string> = {
  DEBT_INCURRENCE: "Debt incurrence",
  LIENS_SECURED_DEBT: "Liens and secured debt",
  RESTRICTED_PAYMENTS_INVESTMENTS: "Restricted payments and investments",
  ASSET_SALES: "Asset sales",
  AFFILIATE_TRANSACTIONS: "Affiliate transactions",
  GUARANTEES: "Guarantees",
  MERGERS_FUNDAMENTAL_CHANGES: "Mergers and fundamental changes",
  FINANCIAL_MAINTENANCE: "Financial maintenance covenants",
  EVENTS_OF_DEFAULT: "Events of default",
  BASKETS_EXCEPTIONS_CONDITIONS: "Relevant baskets, exceptions, conditions and defined terms",
  OTHER: "Other provisions",
};

function sectionForNode(
  nodeId: string | undefined,
  nodes: StructuralNodeRecord[],
): { sectionRef: string; heading: string } {
  if (!nodeId) return { sectionRef: "n/a", heading: "Document body" };
  const n = nodes.find((x) => x.nodeId === nodeId);
  return {
    sectionRef: n?.sectionRef || n?.heading || nodeId,
    heading: n?.heading || n?.sectionRef || "Untitled provision",
  };
}

function normalizeWs(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

function clip(s: string, n: number): string {
  const t = normalizeWs(s);
  return t.length > n ? `${t.slice(0, n)}…` : t;
}

function detectPosture(excerpt: string, heading: string, families: string[]): ProvisionPosture {
  // TOC lines often append a page number ("Section 7.06 Restricted Payments 125").
  const cleanHeading = heading.replace(/\s+\d{1,4}\s*$/g, "").trim();
  const hay = `${cleanHeading}\n${excerpt}`;
  // Classic negative-covenant stem (shall-not often lives in the Article chapeau).
  if (
    /\bCreate,\s*incur,\s*assume or suffer to exist\b/i.test(hay) ||
    /\bMake any Restricted Payment\b/i.test(hay) ||
    /\bEnter into or suffer to exist\b/i.test(hay) ||
    (/\bLimitation on\b/i.test(cleanHeading) && /\bexcept\s*:/i.test(hay))
  ) {
    return "GENERAL_PROHIBITION";
  }
  // Named negative-covenant sections are general prohibitions even when the
  // retrieved span is TOC-contaminated or the chapeau "shall not" is truncated.
  if (
    families.includes("RESTRICTED_PAYMENTS") &&
    /\bRestricted\s+Payments?\b/i.test(cleanHeading) &&
    !/^\s*\([a-z0-9]+\)/i.test(cleanHeading)
  ) {
    return "GENERAL_PROHIBITION";
  }
  if (
    families.includes("INDEBTEDNESS") &&
    /\b(?:Limitation on\s+)?Indebtedness\b/i.test(cleanHeading) &&
    !/\bIncremental|Refinancing Indebtedness|Convertible Notes\b/i.test(cleanHeading) &&
    !/^\s*\([a-z0-9]+\)/i.test(cleanHeading)
  ) {
    return "GENERAL_PROHIBITION";
  }
  if (
    families.includes("LIENS") &&
    /\b(?:Limitation on\s+)?Liens?\b/i.test(cleanHeading) &&
    !/^\s*\([a-z0-9]+\)/i.test(cleanHeading)
  ) {
    return "GENERAL_PROHIBITION";
  }
  if (
    /\bshall\s+not\b/i.test(hay) &&
    /\bexcept\b/i.test(hay) &&
    (/\bcreate,\s*incur\b/i.test(hay) ||
      /\bpermit\b/i.test(hay) ||
      /\bmake\s+any\s+Restricted\s+Payment/i.test(hay) ||
      /\bDisposition\b/i.test(hay) ||
      /\bLien\b/i.test(hay))
  ) {
    return "GENERAL_PROHIBITION";
  }
  if (
    families.includes("FINANCIAL_MAINTENANCE_COVENANTS") ||
    /\bPermit the Consolidated\b/i.test(hay) ||
    (/\bFinancial Condition Covenants?\b/i.test(cleanHeading) &&
      /\bto exceed\b|\bto be less than\b/i.test(hay))
  ) {
    return "MAINTENANCE_TEST";
  }
  if (/\bshall\s+not\b|\bwill\s+not\b|\bmay\s+not\b/i.test(hay) && !/\bexcept\b/i.test(hay)) {
    return "GENERAL_PROHIBITION";
  }
  if (/^\s*\([a-z0-9]+\)/i.test(excerpt.trim()) || /\bnot to exceed\b|\bgreater of\b/i.test(hay)) {
    return /\bprovided that\b|\bso long as\b|\bno Default\b|\bpro forma\b/i.test(hay)
      ? "CONDITIONAL_PERMISSION"
      : "ENUMERATED_PERMISSION";
  }
  if (/\bshall\b/i.test(hay) && !/\bshall\s+not\b/i.test(hay)) return "OBLIGATION";
  return "UNRESOLVED";
}

function extractEntities(excerpt: string, heading: string): {
  coveredEntities: string[];
  entityScopeNotes: string[];
} {
  const hay = `${heading} ${excerpt}`;
  const covered: string[] = [];
  const notes: string[] = [];
  const checks: Array<[RegExp, string]> = [
    [/\bParent Borrower\b/i, "Parent Borrower"],
    [/\bBorrower\b/i, "Borrower"],
    [/\bLoan Part(?:y|ies)\b/i, "Loan Parties"],
    [/\bGuarantor/i, "Guarantor(s)"],
    [/\bSubsidiary Guarantor/i, "Subsidiary Guarantor(s)"],
    [/\bRestricted Subsidiar/i, "Restricted Subsidiaries"],
    [/\bUnrestricted Subsidiar/i, "Unrestricted Subsidiaries"],
    [/\bForeign Subsidiar/i, "Foreign Subsidiaries"],
    [/\bSubsidiar(?:y|ies)\b/i, "Subsidiaries"],
  ];
  for (const [re, label] of checks) {
    if (re.test(hay) && !covered.includes(label)) covered.push(label);
  }
  if (/\bshall not permit any of its Subsidiaries\b/i.test(hay)) {
    notes.push("Obligation extends to Subsidiaries (shall-not-permit formulation).");
  }
  if (covered.length === 0) {
    notes.push("Covered entities are not explicit in the retrieved excerpt — unresolved.");
  }
  return { coveredEntities: covered, entityScopeNotes: notes };
}

function moneyToken(raw: string): string {
  const s = raw.replace(/\s+/g, "").replace(/,/g, "");
  if (/million/i.test(raw)) {
    const n = Number(s.replace(/[^\d.]/g, ""));
    if (Number.isFinite(n)) return `$${(n * 1_000_000).toLocaleString("en-US")}`;
  }
  if (/billion/i.test(raw)) {
    const n = Number(s.replace(/[^\d.]/g, ""));
    if (Number.isFinite(n)) return `$${(n * 1_000_000_000).toLocaleString("en-US")}`;
  }
  return raw.replace(/\s/g, "").startsWith("$") ? raw.replace(/\s/g, "") : `$${raw.replace(/\s/g, "")}`;
}

function extractBaskets(excerpt: string): string[] {
  const out: string[] = [];
  const pushUnique = (s: string) => {
    if (!out.some((x) => x === s)) out.push(s);
  };

  // Grower: greater of (x)/(y) OR (i)/(ii) OR unlabeled, including "$108.0 million" drafting.
  const greaterOfPatterns = [
    /greater\s+of\s*\(\s*(?:x|i)\s*\)\s*\$?\s*([\d,]+(?:\.\d+)?)\s*(million|billion)?\s*(?:and|or|,)\s*\(\s*(?:y|ii)\s*\)\s*([\d.]+)\s*%\s*of\s+([A-Za-z][A-Za-z0-9\s.%]{1,80}?)(?:\s*(?:\(|,|;|\.|\)| at | for | calculated))/gi,
    /greater\s+of\s*\(\s*(?:i)\s*\)\s*\$?\s*([\d,]+(?:\.\d+)?)\s*(million|billion)?\s*and\s*\(\s*(?:ii)\s*\)\s*([\d.]+)\s*%\s*of\s+([A-Za-z][A-Za-z0-9\s.%]{1,80}?)(?:\s|$|,|;|\))/gi,
    /greater\s+of\s*\(?\s*\$?\s*([\d,]+(?:\.\d+)?)\s*(million|billion)?\s*(?:and|or|,)\s*(?:\(\s*(?:y|ii)\s*\)\s*)?([\d.]+)\s*%\s*(?:of\s+)?([A-Za-z][A-Za-z0-9\s.%]{1,80}?)(?:\)|,|;|\.|$)/gi,
  ];
  for (const re of greaterOfPatterns) {
    for (const m of excerpt.matchAll(re)) {
      const dollars = moneyToken(`${m[1]}${m[2] ? ` ${m[2]}` : ""}`);
      pushUnique(
        `Greater-of / grower basket: ${dollars} and ${m[3]}% of ${normalizeWs(m[4] ?? "")}`,
      );
      if (out.length >= 8) break;
    }
    if (out.length >= 4) break;
  }
  if (!out.some((x) => /Greater-of/i.test(x)) && /\bgreater\s+of\b/i.test(excerpt)) {
    const clipGo = excerpt.match(/greater\s+of\b[\s\S]{0,180}/i);
    if (clipGo) pushUnique(`Greater-of construct: ${normalizeWs(clipGo[0]).slice(0, 160)}`);
  }

  // Fixed dollar ceilings (incl. millions)
  const dollars = [
    ...(excerpt.match(/\$\s?[\d,]+(?:\.\d+)?(?:\s*(?:million|billion))?/gi) ?? []),
  ];
  for (const d of dollars.slice(0, 8)) {
    const norm = /million|billion/i.test(d) ? moneyToken(d) : d.replace(/\s/g, "");
    if (!out.some((x) => x.includes(norm))) pushUnique(`Amount/threshold: ${norm}`);
  }

  // Ratio permissions / maintenance thresholds (incl. X.XX to 1 and X.XX:1.00)
  const ratios = [
    ...(excerpt.match(/\d+(?:\.\d+)?\s*(?:to|:)\s*1(?:\.00)?/gi) ?? []),
  ];
  for (const r of ratios.slice(0, 5)) pushUnique(`Ratio threshold: ${normalizeWs(r)}`);

  if (
    /\bat the Borrowers?['’`]?\s+option\b/i.test(excerpt) ||
    /\bat the (?:Initial )?Borrower['’`]s option\b/i.test(excerpt)
  ) {
    pushUnique("Borrower election / optional ratio path present.");
  }
  if (/\bAvailable Amount\b|\bAvailable Amount Builder Basket\b|\bCumulative Credit\b|\bbuilder basket\b/i.test(excerpt)) {
    pushUnique("Builder / Available Amount construct referenced.");
  }
  if (/\bNot Otherwise Applied\b/i.test(excerpt)) {
    pushUnique("Not Otherwise Applied / builder netting referenced.");
    const noaUses = excerpt.match(
      /Not Otherwise Applied[^.…]{0,220}(?:Section\s+[\dA-Za-z.()-]+|clause\s+\([^)]+\))/gi,
    );
    for (const hit of (noaUses ?? []).slice(0, 2)) {
      pushUnique(`NOA usage / deduction path: ${normalizeWs(hit).slice(0, 160)}`);
    }
    // Definition-style NOA: "previously applied pursuant to Section …"
    const noaDef = excerpt.match(
      /Not Otherwise Applied[^.…]{0,40}(?:means|that was not previously applied)[^.…]{0,280}/i,
    );
    if (noaDef) {
      const sections = noaDef[0].match(/Section\s+[\dA-Za-z.()-]+|clause\s+\([^)]+\)/gi) ?? [];
      if (sections.length) {
        pushUnique(`NOA deductions / prior applications: ${sections.slice(0, 4).join("; ")}`);
      }
    }
  }
  if (
    /\btaken together with\b|\bin reliance on this (?:clause|Section)\b|\bin the aggregate(?:\s+outstanding)?\b|\bshared\s+(?:basket|capacity)\b|\bGeneral (?:Debt|Investment|RP) Basket\b/i.test(
      excerpt,
    )
  ) {
    pushUnique("Shared / aggregated capacity or cross-clause stacking language present.");
  }
  if (
    /\bwithout duplication\s+for purposes of\s+Section\b/i.test(excerpt) ||
    (/\bwithout duplication\b/i.test(excerpt) &&
      /\b(?:Section|clause|basket|Indebtedness|Investment|Restricted Payment)\b/i.test(excerpt))
  ) {
    pushUnique("Anti-stacking / without-duplication across clauses referenced.");
    const forPurposes = excerpt.match(
      /without duplication\s+for purposes of\s+Section\s+[\dA-Za-z.()-]+/gi,
    );
    for (const hit of (forPurposes ?? []).slice(0, 2)) {
      pushUnique(`Anti-stacking scope: ${normalizeWs(hit)}`);
    }
  }
  if (
    /\b(?:classify|reclassify|classification|reclassification)\b/i.test(excerpt) &&
    /\b(?:basket|clause|Section|Indebtedness|Lien|Investment|Restricted Payment|Permitted)\b/i.test(excerpt)
  ) {
    pushUnique("Classification / reclassification election present (basket designation may change).");
  }
  if (
    /\bdivide(?:\s+and)?,?\s*classify\b|\bdivide and classify or reclassify\b|\bdivide,\s*classify\b/i.test(
      excerpt,
    )
  ) {
    pushUnique("Divide-and-classify / reclassify election across covenant categories.");
  }
  if (
    /\breallocated amount\b|\bGeneral (?:Debt|Lien) Basket Reallocated Amount\b|\breallocated from\b/i.test(
      excerpt,
    )
  ) {
    pushUnique("Basket reallocation / reclassification right referenced.");
  }
  // Incremental facility alternative paths (Chewy-style names + Gibraltar-style facilities)
  if (/\bFixed Incremental Amount\b|\bCash-Capped Incremental Facility\b/i.test(excerpt)) {
    pushUnique("Incremental path: Fixed / Cash-Capped Incremental Amount.");
  }
  if (
    /\bRatio Incremental Amount\b|\bRatio-Based Incremental(?:\s+Facility|\s+Amount)?\b/i.test(excerpt)
  ) {
    pushUnique("Incremental path: Ratio Incremental Amount (ratio condition).");
  }
  if (
    /\bVoluntary Prepayment Incremental Amount\b|\bPrepayment-Based Incremental Facility\b/i.test(
      excerpt,
    )
  ) {
    pushUnique("Incremental path: Voluntary Prepayment / Prepayment-Based Incremental Amount.");
  }
  if (
    (/\bIncremental (?:Amount|Cap)\b/i.test(excerpt) && /\b(?:plus|minus|sum of)\b/i.test(excerpt)) ||
    (/\bCash-Capped Incremental\b/i.test(excerpt) &&
      /\bRatio-Based Incremental\b/i.test(excerpt) &&
      /\bPrepayment-Based Incremental\b/i.test(excerpt))
  ) {
    pushUnique("Incremental Amount is a multi-component sum (fixed / ratio / voluntary / reallocations).");
  }
  if (
    /\bunless the (?:Initial )?Borrower elects otherwise\b/i.test(excerpt) &&
    /\b(?:Ratio[- ]Based Incremental|Ratio Incremental|Fixed Incremental|Cash-Capped)\b/i.test(excerpt)
  ) {
    pushUnique("Incremental default utilization order / election dependency present.");
  }
  if (
    /\b(?:redesignat|automatically cease to be deemed incurred|deemed incurred under the Ratio)\b/i.test(
      excerpt,
    ) &&
    /\bIncremental\b/i.test(excerpt)
  ) {
    pushUnique("Incremental redesignation into ratio path when ratio test later satisfied.");
  }
  if (/\bAvailable Amount\b/i.test(excerpt)) {
    if (/\b(?:minus|reduced|reduction|deduct|Not Otherwise Applied)\b/i.test(excerpt)) {
      pushUnique("Available Amount subject to deductions / reductions.");
    }
    if (/\bplus\b/i.test(excerpt)) {
      pushUnique("Available Amount builder includes additive components.");
    }
  }
  if (/\bat any (?:one )?time outstanding\b|\bthen outstanding\b/i.test(excerpt)) {
    pushUnique("Cap measured on outstanding amount at any time.");
  }
  if (/\bper fiscal year\b|\bin any fiscal year\b/i.test(excerpt)) {
    pushUnique("Cap measured on a per-fiscal-year basis.");
  }
  if (/\bpro forma\b/i.test(excerpt) && /\b(?:Leverage|Coverage)\s+Ratio\b/i.test(excerpt)) {
    pushUnique("Pro forma leverage/coverage test gates capacity.");
  }
  return out.slice(0, 18);
}

function extractRestriction(excerpt: string, heading: string, posture: ProvisionPosture, categoryLabel: string): string | null {
  const createIncur = excerpt.match(
    /Create,\s*incur,\s*assume or suffer to exist[^.…]{0,160}?(?:except|$)/i,
  );
  if (createIncur) {
    return clip(createIncur[0].replace(/\bexcept\s*:?\s*$/i, "").trim() + " — except as expressly permitted", 320);
  }
  const makeRp = excerpt.match(/Make any Restricted Payment[^.…]{0,120}/i);
  if (makeRp) return clip(makeRp[0], 280);

  const prohib =
    excerpt.match(
      /(?:shall not|will not|may not)[^.…]{10,220}(?:except|\.|provided)/i,
    ) ??
    excerpt.match(/(?:shall not|will not|may not)[^.…]{10,220}/i);
  if (prohib) return clip(prohib[0].replace(/\bexcept\b.*$/i, "").trim(), 280);

  if (posture === "MAINTENANCE_TEST") {
    const m =
      excerpt.match(/Permit the Consolidated[^.…]{10,220}(?:exceed|less than)[^.…]{0,80}/i) ??
      excerpt.match(/Permit[^.…]{10,160}(?:exceed|less than)[^.…]{0,60}/i);
    if (m) return `Maintenance restriction: ${clip(m[0], 280)}`;
  }
  if (posture === "GENERAL_PROHIBITION") {
    return `General prohibition on ${categoryLabel.toLowerCase()} activity (heading “${clip(heading, 80)}”), subject to enumerated exceptions if any appear in the text.`;
  }
  return null;
}

function extractPermissions(excerpt: string, posture: ProvisionPosture): string[] {
  const perms: string[] = [];
  if (
    posture === "ENUMERATED_PERMISSION" ||
    posture === "CONDITIONAL_PERMISSION" ||
    /\bexcept\b/i.test(excerpt)
  ) {
    // Letter-clause baskets: (a) ... ; (b) ...
    const clauses = [...excerpt.matchAll(/\(([a-z]|[ivx]+|\d+)\)\s+([^;.]{15,220})/gi)];
    for (const c of clauses.slice(0, 12)) {
      perms.push(`(${c[1]}) ${clip(c[2] ?? "", 200)}`);
    }
    if (perms.length === 0 && /\bexcept\b/i.test(excerpt)) {
      const after = excerpt.split(/\bexcept\b/i)[1];
      if (after) perms.push(clip(`Except: ${after}`, 280));
    }
  }
  return perms.slice(0, 12);
}

function relatedDefinitions(
  excerpt: string,
  defs: DefinitionRecord[],
): Array<{ term: string; excerpt: string; resolved: boolean }> {
  const hay = excerpt.toLowerCase();
  // Prefer longer terms first so "Consolidated EBITDA" wins over "EBITDA",
  // and scan the full definition set (not only the first 300 discovery hits).
  const ranked = [...defs]
    .filter((d) => d.term.length >= 3)
    .sort((a, b) => b.term.length - a.term.length);
  const hits: Array<{ term: string; excerpt: string; resolved: boolean }> = [];
  const seen = new Set<string>();
  for (const d of ranked) {
    const term = d.term.toLowerCase();
    // Word-boundary-ish match avoids "lien" inside unrelated tokens when possible.
    const re = new RegExp(`(?:^|[^a-z0-9])${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:[^a-z0-9]|$)`, "i");
    if (!re.test(hay) && !hay.includes(term)) continue;
    if (seen.has(term)) continue;
    seen.add(term);
    hits.push({
      term: d.term,
      excerpt: clip(d.excerpt ?? "", 220),
      resolved: Boolean(d.excerpt && d.excerpt.length > 20),
    });
    if (hits.length >= 10) break;
  }
  return hits;
}

function crossRefsFor(
  nodeId: string | undefined,
  excerpt: string,
  xrefs: CrossReferenceRecord[],
): string[] {
  const fromNode = nodeId
    ? xrefs.filter((x) => x.fromNodeId === nodeId).map((x) => x.rawReference)
    : [];
  const fromText =
    excerpt.match(/\b(?:Section|Article|§)\s*[\dA-Za-z.()-]+/g)?.map((s) => normalizeWs(s)) ?? [];
  return Array.from(new Set([...fromNode, ...fromText])).slice(0, 12);
}

function buildPlainEnglish(params: {
  sectionRef: string;
  heading: string;
  categoryLabel: string;
  posture: ProvisionPosture;
  restriction: string | null;
  permissions: string[];
  coveredEntities: string[];
  exceptions: string[];
  conditions: string[];
  baskets: string[];
  definitions: Array<{ term: string; resolved: boolean }>;
  dependencies: string[];
  unresolved: string[];
}): string {
  const parts: string[] = [];
  const entity =
    params.coveredEntities.length > 0
      ? params.coveredEntities.join(", ")
      : "entities not clearly identified in the excerpt";

  switch (params.posture) {
    case "GENERAL_PROHIBITION":
      parts.push(
        `Section ${params.sectionRef} (“${clip(params.heading, 100)}”) is a general ${params.categoryLabel.toLowerCase()} prohibition covering ${entity}.`,
      );
      if (params.restriction) parts.push(params.restriction);
      if (params.permissions.length > 0) {
        parts.push(
          `It is subject to enumerated exceptions/permissions, including: ${params.permissions
            .slice(0, 4)
            .join("; ")}.`,
        );
      } else if (params.exceptions.length > 0) {
        parts.push(`Exception language is present (${params.exceptions.length} signal(s)), but individual baskets were not fully segmented from this excerpt.`);
      } else {
        parts.push("No enumerated exception list was segmented from this excerpt — exception set may be unresolved.");
      }
      break;
    case "ENUMERATED_PERMISSION":
    case "CONDITIONAL_PERMISSION":
      parts.push(
        `Section ${params.sectionRef} (“${clip(params.heading, 100)}”) operates as a ${
          params.posture === "CONDITIONAL_PERMISSION" ? "conditional" : "enumerated"
        } permission within the ${params.categoryLabel.toLowerCase()} regime for ${entity}.`,
      );
      if (params.permissions[0]) parts.push(`Permission substance: ${params.permissions[0]}`);
      else if (params.restriction) parts.push(params.restriction);
      break;
    case "MAINTENANCE_TEST":
      parts.push(
        `Section ${params.sectionRef} (“${clip(params.heading, 100)}”) is a financial maintenance covenant applying to ${entity}.`,
      );
      if (params.restriction) parts.push(params.restriction);
      parts.push("Pass/fail and remaining headroom are unresolved without approved financial inputs.");
      break;
    case "OBLIGATION":
      parts.push(
        `Section ${params.sectionRef} (“${clip(params.heading, 100)}”) imposes an affirmative or ongoing obligation related to ${params.categoryLabel.toLowerCase()} for ${entity}.`,
      );
      break;
    default:
      parts.push(
        `Section ${params.sectionRef} (“${clip(params.heading, 100)}”) relates to ${params.categoryLabel.toLowerCase()}, but its prohibition/permission posture could not be determined from the excerpt.`,
      );
  }

  if (params.baskets.length > 0) {
    parts.push(`Material baskets/thresholds identified: ${params.baskets.slice(0, 4).join("; ")}.`);
  }
  if (params.conditions.length > 0) {
    parts.push(`Conditions/provisos signaled: ${params.conditions.slice(0, 3).join("; ")}.`);
  }
  const unresolvedDefs = params.definitions.filter((d) => !d.resolved).map((d) => d.term);
  const resolvedDefs = params.definitions.filter((d) => d.resolved).map((d) => d.term);
  if (resolvedDefs.length > 0) {
    parts.push(`Controlling defined terms (excerpt-matched): ${resolvedDefs.slice(0, 5).join(", ")}.`);
  }
  if (unresolvedDefs.length > 0) {
    parts.push(`Defined terms referenced but not resolved in-package: ${unresolvedDefs.slice(0, 4).join(", ")}.`);
  }
  if (params.dependencies.length > 0) {
    parts.push(`Cross-provision dependencies: ${params.dependencies.slice(0, 3).join("; ")}.`);
  }
  parts.push(
    "This explains discovered operative text; it is not a determination of current capacity, utilization, or amendment-operative status.",
  );
  if (params.unresolved.length > 0) {
    parts.push(`Unresolved: ${params.unresolved.slice(0, 3).join("; ")}.`);
  }
  return parts.join(" ");
}

export function analyzeProvision(params: {
  sourceId: string;
  documentTitle: string;
  candidate: CovenantCandidateRecord;
  definitions: DefinitionRecord[];
  structuralNodes: StructuralNodeRecord[];
  crossReferences?: CrossReferenceRecord[];
}): ProvisionAnalysis {
  const { sectionRef, heading } = sectionForNode(params.candidate.nodeId, params.structuralNodes);
  const excerpt = params.candidate.excerpt || "";
  const primary = params.candidate.families[0] ?? "UNKNOWN";
  const category = FAMILY_TO_CATEGORY[primary] ?? "OTHER";
  const categoryLabel = CATEGORY_LABELS[category];
  const posture = detectPosture(excerpt, heading, params.candidate.families);
  const { coveredEntities, entityScopeNotes } = extractEntities(excerpt, heading);
  const basketsAndThresholds = extractBaskets(excerpt);
  const restriction = extractRestriction(excerpt, heading, posture, categoryLabel);
  const permissions = extractPermissions(excerpt, posture);

  const condRecords = extractConditionsAndExceptions(params.sourceId, excerpt, params.structuralNodes, 40);
  const conditions = condRecords
    .filter((c) => c.kind === "CONDITION" || c.kind === "PROVISO")
    .map((c) => `${c.signals.join(",")}: ${clip(c.excerpt, 160)}`);
  const exceptions = condRecords
    .filter((c) => c.kind === "EXCEPTION")
    .map((c) => `${c.signals.join(",")}: ${clip(c.excerpt, 160)}`);

  const patternIds = detectPatternsInText(`${heading}\n${excerpt}`);
  const draftingPatterns = patternIds.map((id) => getPattern(id)?.name ?? id);

  const applicableDefinitions = relatedDefinitions(excerpt, params.definitions);
  const crossReferences = crossRefsFor(
    params.candidate.nodeId,
    excerpt,
    params.crossReferences ?? [],
  );
  const dependencies: string[] = [];
  for (const ref of crossReferences.slice(0, 6)) {
    dependencies.push(`Depends on / references ${ref}`);
  }
  for (const d of applicableDefinitions.slice(0, 4)) {
    dependencies.push(
      d.resolved
        ? `Meaning controlled by definition of “${d.term}”`
        : `References “${d.term}” but definition text was not resolved in-package`,
    );
  }
  // Cross-covenant / capacity relationships beyond bare section cites.
  if (/\btaken together with\b|\bin reliance on this (?:clause|Section)\b/i.test(excerpt)) {
    dependencies.push("Capacity aggregates with another clause (taken-together / reliance language).");
  }
  if (/\bsubject to Section\b|\bin accordance with Section\b|\bas permitted by Section\b/i.test(excerpt)) {
    const m = excerpt.match(/\b(?:subject to|in accordance with|as permitted by)\s+Section\s+[\dA-Za-z.()-]+/gi) ?? [];
    for (const hit of m.slice(0, 3)) dependencies.push(`Cross-covenant gate: ${normalizeWs(hit)}`);
  }
  if (/\bAvailable Amount\b/i.test(excerpt) && !/definition of “Available Amount”/i.test(dependencies.join(" "))) {
    dependencies.push("Uses Available Amount / builder capacity (see definition and RP/Investment gates).");
  }
  if (/\bNot Otherwise Applied\b/i.test(excerpt)) {
    dependencies.push("Builder capacity limited to amounts Not Otherwise Applied (cross-basket netting).");
  }
  if (
    /\b(?:Fixed Incremental Amount|Ratio Incremental Amount|Cash-Capped Incremental|Ratio-Based Incremental|Prepayment-Based Incremental|Incremental Cap)\b/i.test(
      excerpt,
    )
  ) {
    dependencies.push("Incremental capacity depends on alternative Fixed/Ratio/Prepayment paths and elections.");
  }
  if (/\bNo Default\b|\bno Event of Default\b/i.test(excerpt)) {
    dependencies.push("Conditioned on absence of Default / Event of Default.");
  }
  if (/\bsubject to\b|\bin accordance with\b|\bas defined in\b/i.test(excerpt) && dependencies.length === 0) {
    dependencies.push("Operative effect appears contingent on another provision or definition.");
  }

  const unresolved: string[] = [...entityScopeNotes.filter((n) => /unresolved/i.test(n))];
  if (!restriction && posture === "UNRESOLVED") {
    unresolved.push("Could not determine whether the provision is a prohibition, permission, or maintenance test");
  }
  if (posture === "GENERAL_PROHIBITION" && permissions.length === 0 && exceptions.length === 0) {
    unresolved.push("Exception/basket list not segmented from excerpt — full section review required");
  }
  if (applicableDefinitions.some((d) => !d.resolved)) {
    unresolved.push("One or more controlling definitions lack resolved definition text");
  }
  if (basketsAndThresholds.length === 0 && (posture === "ENUMERATED_PERMISSION" || posture === "CONDITIONAL_PERMISSION")) {
    unresolved.push("No dollar/ratio basket ceiling identified in the excerpt");
  }
  unresolved.push("Whether this provision is currently operative after amendments is unresolved");
  unresolved.push("Numerical capacity/utilization is unresolved without approved financial inputs and ledger");

  const plainEnglish = buildPlainEnglish({
    sectionRef,
    heading,
    categoryLabel,
    posture,
    restriction,
    permissions,
    coveredEntities,
    exceptions,
    conditions,
    baskets: basketsAndThresholds,
    definitions: applicableDefinitions,
    dependencies,
    unresolved,
  });

  return {
    sectionRef,
    heading,
    category,
    categoryLabel,
    families: params.candidate.families,
    posture,
    plainEnglish,
    restriction,
    permissions,
    coveredEntities,
    entityScopeNotes,
    exceptions,
    conditions,
    basketsAndThresholds,
    draftingPatterns,
    applicableDefinitions,
    crossReferences,
    dependencies,
    operativeLanguageExcerpt: excerpt.slice(0, 700),
    sourceCitation: `${params.sourceId} · ${sectionRef}`,
    unresolved,
    epistemicStatus: "DISCOVERED_CANDIDATE",
    interpretationNote:
      "Source-backed discovery analysis using structural classification, condition/exception signals, drafting patterns, and definition matching. Not legal advice; not executable capacity.",
  };
}
