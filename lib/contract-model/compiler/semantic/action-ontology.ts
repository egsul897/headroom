/**
 * CANONICAL ACTION ONTOLOGY (Phase 3 - action semantics closure).
 *
 * `ContractAction` (lib/contract-model/types.ts) is a COMPACT set of canonical semantic categories (INCUR_DEBT,
 * CREATE_LIEN, MAKE_INVESTMENT, ...), not a quotation of every drafting verb. A source clause typically states a verb
 * CLUSTER ("create, incur, assume or suffer to exist any Indebtedness") whose members all fall inside ONE canonical
 * category; the IR must carry the canonical action AND preserve the literal source breadth as evidence (see
 * IRInheritedAttribute.attribute "action"). This module is the one deterministic contract between the two:
 *
 *   - each category documents the verb lemmas and object nouns it is intended to cover;
 *   - `classifySourceAction` reads a governing lead-in and returns the exact source phrase, its verbs and object, and
 *     the single canonical category they fall in - or an honest MIXED_CATEGORIES / ONTOLOGY_GAP when they do not;
 *   - `assessActionCompatibility` says whether a proposed canonical action is compatible with that source act.
 *
 * A genuinely different act never collapses into a neighbour: guaranteeing Indebtedness is GUARANTEE_DEBT, prepaying
 * or redeeming it is PREPAY_DEBT, granting a Lien securing it is CREATE_LIEN - none of them is INCUR_DEBT.
 * Nothing here references any agreement, section or figure.
 */
import type { ContractAction } from "../../types";

// v2 (§7.5(j) live-exposed closure, defect C): object-family regexes carry the case-insensitive flag and every regex this
// module reconstructs from another regex's `source` preserves that regex's own flags (`withFlags`). v1 rebuilt the object
// regexes flag-less, so a capitalised object noun as drafted ("Dispose of any of its Property") was not an ASSET object,
// the scan skipped the first verb cluster and recorded a LATER cluster as the governing act - a false source act.
export const CANONICAL_ACTION_ONTOLOGY_VERSION = "canonical-action-ontology.v2";

export type ActionCoverage = "COVERED" | "MIXED_CATEGORIES" | "ONTOLOGY_GAP" | "NO_ACTION_FOUND";
export type ActionCompatibility = "COMPATIBLE" | "INCOMPATIBLE" | "UNDETERMINED";

export interface SourceActionClassification {
  version: typeof CANONICAL_ACTION_ONTOLOGY_VERSION;
  /** The exact source phrase (verb cluster through its object), or "" when none was found. */
  phrase: string;
  verbs: string[];
  object: string | null;
  /** The object family the ontology recognized (DEBT, LIEN, ...), or null. */
  objectFamily: string | null;
  canonicalAction: ContractAction | null;
  /** Every category some verb of the cluster fell in (one entry when COVERED). */
  categories: ContractAction[];
  coverage: ActionCoverage;
  detail: string;
}

interface ObjectFamily { family: string; re: RegExp; byVerbGroup: { group: string; action: ContractAction }[]; defaultAction: ContractAction | null }

/** Verb lemma groups. Each regex matches an inflected verb or verb phrase; `group` names the semantic group the ontology maps per object family. */
const VERB_GROUPS: readonly { group: string; re: RegExp }[] = [
  { group: "GUARANTEE", re: /\bguarant(?:y|ee|ees|eed|eeing|ies)\b/i },
  { group: "PREPAY", re: /\b(?:prepay(?:s|ment)?|redeem(?:s)?|repurchase(?:s)?|defease(?:s)?|retire(?:s)?|repay(?:s)?|purchase(?:s)?|make (?:any )?(?:optional |voluntary )?(?:prepayment|payment of principal))\b/i },
  { group: "INCUR", re: /\b(?:create(?:s)?|incur(?:s)?|assume(?:s)?|suffer(?:s)? to exist|permit(?:s)? to exist|become(?:s)? liable|issue(?:s)?|exist(?:s)?)\b/i },
  { group: "GRANT_SECURITY", re: /\b(?:grant(?:s)?|pledge(?:s)?|mortgage(?:s)?|encumber(?:s)?)\b/i },
  { group: "MAKE", re: /\b(?:make(?:s)?|hold(?:s)?|acquire(?:s)?|own(?:s)?)\b/i },
  { group: "PAY", re: /\b(?:declare(?:s)?|pay(?:s)?|make(?:s)? (?:any )?(?:Restricted Payment|distribution))\b/i },
  { group: "DISPOSE", re: /\b(?:sell(?:s)?|transfer(?:s)?|lease(?:s)?|convey(?:s)?|dispose(?:s)? of|otherwise dispose of|license(?:s)?|exchange(?:s)?)\b/i },
  { group: "MERGE", re: /\b(?:merge(?:s)?|consolidate(?:s)?|amalgamate(?:s)?|liquidate(?:s)?|dissolve(?:s)?|wind up)\b/i },
  { group: "ENTER", re: /\b(?:enter(?:s)? into|engage(?:s)? in)\b/i },
  { group: "DESIGNATE", re: /\b(?:designate(?:s)?|redesignate(?:s)?)\b/i },
  { group: "AMEND", re: /\b(?:amend(?:s)?|modify|modifies|waive(?:s)?|supplement(?:s)?)\b/i },
];

const OBJECT_FAMILIES: readonly ObjectFamily[] = [
  { family: "LIEN", re: /\b(?:Liens?|security interests?|mortgages?|pledges?|charges?|encumbrances?)\b/i, byVerbGroup: [{ group: "INCUR", action: "CREATE_LIEN" }, { group: "GRANT_SECURITY", action: "CREATE_LIEN" }], defaultAction: "CREATE_LIEN" },
  // IPV-18: junior / subordinated / restricted debt prepayments are PAY_JUNIOR_DEBT, not generic PREPAY_DEBT.
  // Prefer this family when the object noun carries the junior/subordinated qualifier (earlier match than bare Indebtedness).
  { family: "JUNIOR_DEBT", re: /\b(?:Junior|Subordinated|Restricted)\s+Indebtedness\b/i, byVerbGroup: [{ group: "PREPAY", action: "PAY_JUNIOR_DEBT" }, { group: "PAY", action: "PAY_JUNIOR_DEBT" }], defaultAction: "PAY_JUNIOR_DEBT" },
  { family: "DEBT", re: /\b(?:Indebtedness|Debt|Guarantee Obligations?|obligations? for borrowed money|borrowed money)\b/i, byVerbGroup: [{ group: "GUARANTEE", action: "GUARANTEE_DEBT" }, { group: "PREPAY", action: "PREPAY_DEBT" }, { group: "INCUR", action: "INCUR_DEBT" }], defaultAction: null },
  { family: "INVESTMENT", re: /\b(?:Investments?|loans? or advances?|Acquisitions?)\b/i, byVerbGroup: [{ group: "MAKE", action: "MAKE_INVESTMENT" }, { group: "INCUR", action: "MAKE_INVESTMENT" }], defaultAction: "MAKE_INVESTMENT" },
  { family: "RESTRICTED_PAYMENT", re: /\b(?:dividends?|Restricted Payments?|distributions?)\b/i, byVerbGroup: [{ group: "PAY", action: "PAY_DIVIDEND" }, { group: "MAKE", action: "PAY_DIVIDEND" }], defaultAction: "PAY_DIVIDEND" },
  { family: "EQUITY_REPURCHASE", re: /\b(?:Capital Stock|Equity Interests?|shares)\b/i, byVerbGroup: [{ group: "PREPAY", action: "REPURCHASE_EQUITY" }], defaultAction: null },
  { family: "ASSET", re: /\b(?:assets?|propert(?:y|ies)|Dispositions?)\b/i, byVerbGroup: [{ group: "DISPOSE", action: "SELL_ASSET" }], defaultAction: null },
  { family: "AFFILIATE_TRANSACTION", re: /\b(?:transactions? (?:with|involving) (?:any )?(?:of its )?Affiliates?)\b/i, byVerbGroup: [{ group: "ENTER", action: "ENTER_AFFILIATE_TRANSACTION" }], defaultAction: "ENTER_AFFILIATE_TRANSACTION" },
  { family: "UNRESTRICTED_DESIGNATION", re: /\b(?:as an? Unrestricted Subsidiary|Unrestricted Subsidiar(?:y|ies))\b/i, byVerbGroup: [{ group: "DESIGNATE", action: "DESIGNATE_UNRESTRICTED_SUBSIDIARY" }], defaultAction: null },
  { family: "DOCUMENT", re: /\b(?:agreements?|documents?|certificate of incorporation|organizational documents?)\b/i, byVerbGroup: [{ group: "AMEND", action: "AMEND_DOCUMENT" }], defaultAction: null },
];

const MERGE_ONLY = /\b(?:merge|consolidate|amalgamate)\b/i;

/**
 * Rebuilds a regex from another regex's source WITHOUT dropping its flags (defect C). `extra` adds flags the call site
 * needs (e.g. "g" for a scan); the original's own flags (notably "i") are always kept, and a fresh object is returned so
 * no `lastIndex` state leaks between global scans. `source` may be wrapped (anchored / alternated) by the caller.
 */
function withFlags(source: string, like: RegExp | readonly RegExp[], extra = ""): RegExp {
  const flags = new Set<string>(extra.split(""));
  for (const r of Array.isArray(like) ? like : [like as RegExp]) for (const f of r.flags) if (f !== "g" && f !== "y") flags.add(f);
  return new RegExp(source, [...flags].sort().join(""));
}
const VERB_UNION = withFlags(VERB_GROUPS.map((g) => `(?:${g.re.source})`).join("|"), VERB_GROUPS.map((g) => g.re), "g");
const CONNECTOR = /^(?:\s*(?:,|and|or|and\/or|nor|,\s*or|,\s*and)\s*)+$/;
const DETERMINERS = /^\s*(?:,\s*)?(?:any|all|other|additional|such|the|its|their|an?|of|to|in|on)\s+/i;

function groupOf(verb: string): string | null {
  for (const g of VERB_GROUPS) if (withFlags(`^(?:${g.re.source})$`, g.re).test(verb)) return g.group;
  return null;
}

const none = (detail: string): SourceActionClassification => ({ version: CANONICAL_ACTION_ONTOLOGY_VERSION, phrase: "", verbs: [], object: null, objectFamily: null, canonicalAction: null, categories: [], coverage: "NO_ACTION_FOUND", detail });

/**
 * Finds the governing verb cluster + object in `text` (a lead-in / excerpt) and classifies it. Deterministic: the first
 * verb cluster that is followed (within a short window) by a recognized object noun wins; a cluster with no recognized
 * object is reported as NO_ACTION_FOUND unless it is a merge/consolidation (objectless act).
 */
export function classifySourceAction(text: string): SourceActionClassification {
  const re = withFlags(VERB_UNION.source, VERB_UNION, "g");
  let m: RegExpExecArray | null;
  const consumed = new Set<number>();
  while ((m = re.exec(text)) !== null) {
    if (consumed.has(m.index)) continue;
    const verbs: string[] = [m[0]];
    let cursor = m.index + m[0].length;
    const clusterStart = m.index;
    // extend the cluster over connectors
    for (;;) {
      const rest = text.slice(cursor, cursor + 24);
      const conn = rest.match(/^(?:\s*(?:,|and|or|and\/or|nor)\s*)+/);
      if (!conn || !CONNECTOR.test(conn[0])) break;
      const next = withFlags(`^(?:${VERB_GROUPS.map((g) => g.re.source).join("|")})`, VERB_GROUPS.map((g) => g.re)).exec(text.slice(cursor + conn[0].length, cursor + conn[0].length + 40));
      if (!next) break;
      verbs.push(next[0]);
      consumed.add(cursor + conn[0].length);
      cursor = cursor + conn[0].length + next[0].length;
    }
    // object: skip determiners / short qualifiers, then look for a recognized object noun within a window
    let window = text.slice(cursor, cursor + 90);
    const lead = window.match(DETERMINERS);
    const objOffset = lead ? lead[0].length : 0;
    window = window.slice(objOffset);
    let best: { fam: ObjectFamily; m: RegExpExecArray } | null = null;
    for (const fam of OBJECT_FAMILIES) {
      const om = withFlags(fam.re.source, fam.re).exec(window);
      if (om && om.index <= 45 && (!best || om.index < best.m.index)) best = { fam, m: om };
    }
    if (!best) {
      if (verbs.every((v) => MERGE_ONLY.test(v))) {
        const phrase = text.slice(clusterStart, cursor);
        return { version: CANONICAL_ACTION_ONTOLOGY_VERSION, phrase, verbs, object: null, objectFamily: "ENTITY", canonicalAction: "MERGE", categories: ["MERGE"], coverage: "COVERED", detail: "merger/consolidation act (objectless)" };
      }
      continue; // a verb with no recognized object (e.g. "shall", "permit") - keep scanning
    }
    const objectEnd = cursor + objOffset + best.m.index + best.m[0].length;
    const phrase = text.slice(clusterStart, objectEnd);
    const categories: ContractAction[] = [];
    const uncovered: string[] = [];
    for (const v of verbs) {
      const g = groupOf(v);
      const mapped = g ? best.fam.byVerbGroup.find((x) => x.group === g)?.action ?? null : null;
      const action = mapped ?? (g === null ? null : best.fam.defaultAction);
      if (!action) { uncovered.push(v); continue; }
      if (!categories.includes(action)) categories.push(action);
    }
    if (uncovered.length > 0 && categories.length === 0) return { version: CANONICAL_ACTION_ONTOLOGY_VERSION, phrase, verbs, object: best.m[0], objectFamily: best.fam.family, canonicalAction: null, categories, coverage: "ONTOLOGY_GAP", detail: `verb(s) ${uncovered.map((v) => `"${v}"`).join(", ")} on ${best.fam.family} are covered by no canonical category` };
    if (categories.length > 1) return { version: CANONICAL_ACTION_ONTOLOGY_VERSION, phrase, verbs, object: best.m[0], objectFamily: best.fam.family, canonicalAction: null, categories, coverage: "MIXED_CATEGORIES", detail: `the verb cluster spans ${categories.join(" + ")}; one canonical action cannot represent it` };
    if (uncovered.length > 0) return { version: CANONICAL_ACTION_ONTOLOGY_VERSION, phrase, verbs, object: best.m[0], objectFamily: best.fam.family, canonicalAction: null, categories, coverage: "ONTOLOGY_GAP", detail: `verb(s) ${uncovered.map((v) => `"${v}"`).join(", ")} on ${best.fam.family} are covered by no canonical category (others fall in ${categories[0]})` };
    return { version: CANONICAL_ACTION_ONTOLOGY_VERSION, phrase, verbs, object: best.m[0], objectFamily: best.fam.family, canonicalAction: categories[0]!, categories, coverage: "COVERED", detail: `${verbs.length} source verb(s) on ${best.fam.family} fall in the canonical category ${categories[0]}` };
  }
  return none("no governing verb cluster with a recognized object noun");
}

/** Whether a proposed canonical action is compatible with the classified source act. UNDETERMINED when the source states no covered act. */
export function assessActionCompatibility(proposed: ContractAction | null, source: SourceActionClassification | null): { compatibility: ActionCompatibility; detail: string } {
  if (!proposed || !source || source.coverage === "NO_ACTION_FOUND") return { compatibility: "UNDETERMINED", detail: "no proposed action or no covered source act to compare" };
  if (source.coverage === "COVERED") {
    if (source.canonicalAction === proposed) return { compatibility: "COMPATIBLE", detail: `the source act "${source.phrase}" falls in ${proposed}` };
    return { compatibility: "INCOMPATIBLE", detail: `the source act "${source.phrase}" is ${source.canonicalAction}, not ${proposed}` };
  }
  if (source.categories.includes(proposed)) return { compatibility: "UNDETERMINED", detail: `the source act "${source.phrase}" is ${source.coverage} (${source.categories.join(" + ")}); ${proposed} covers only part of it` };
  return { compatibility: "INCOMPATIBLE", detail: `the source act "${source.phrase}" (${source.coverage}: ${source.categories.join(" + ") || "uncovered"}) does not fall in ${proposed}` };
}
