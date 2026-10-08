/**
 * Phase-4 legally-safe exception analyzer.
 * Deterministic / offline. Never approves production capacity.
 */

import {
  buildDependencyClosure,
  mayClassifyUnconditional,
  type DependencyClosure,
} from "./dependency-closure";
import { attachProvisos, type ProvisoAttachmentResult } from "./proviso-attachment";
import { interpretEntityScope, type EntityScopeResult } from "./entity-scope";
import { resolveCrossReferences, type CrossReferenceResult } from "./cross-reference";
import type { PermissionClassification } from "./types";

export interface AnalyzedException {
  detectedId: string;
  sectionRef: string;
  limbText: string;
  charStart: number;
  preview: string;
  predictedClassification: PermissionClassification;
  predictedRemoteConditions: string[];
  predictedProvisoAttachment: string;
  predictedEntityScope: string[];
  predictedCrossRefs: string[];
  dependencyClosure: DependencyClosure;
  proviso: ProvisoAttachmentResult;
  entityScope: EntityScopeResult;
  crossReferences: CrossReferenceResult;
  unsupportedRefusal?: "AMBIGUOUS_CONDITION_SCOPE";
  productionCapacityApproved: false;
  evidence: {
    governingProhibition?: string;
    openingLanguage?: string;
    parentProvisoTexts: string[];
  };
}

export interface SectionAnalysis {
  sectionRefPrefix: string;
  exceptions: AnalyzedException[];
  parentProhibitionText: string;
  openingLanguageText: string;
}

function normalizeWs(s: string): string {
  return s.replace(/\u00a0/g, " ").replace(/[ \t]+/g, " ");
}

/** Locate operative section body preferring late occurrences (skip TOC). */
export function locateSectionBody(
  fullText: string,
  opts: { sectionToken: string; mustContain?: string; minStart?: number },
): { start: number; end: number; text: string } | null {
  const minStart = opts.minStart ?? 100000;
  let start = -1;
  let pos = fullText.indexOf(opts.sectionToken);
  while (pos >= 0) {
    const window = fullText.slice(pos, pos + 400);
    if (pos >= minStart && (!opts.mustContain || window.includes(opts.mustContain))) {
      start = pos;
      break;
    }
    pos = fullText.indexOf(opts.sectionToken, pos + 1);
  }
  if (start < 0) {
    // fallback: last occurrence
    start = fullText.lastIndexOf(opts.sectionToken);
  }
  if (start < 0) return null;

  // end at next Section N.NN after start
  const endRe = /\nSection[\s\u00a0]+\d+\.\d+/g;
  endRe.lastIndex = start + 20;
  const endMatch = endRe.exec(fullText);
  const end = endMatch ? endMatch.index : Math.min(fullText.length, start + 20000);
  return { start, end, text: fullText.slice(start, end) };
}

function extractParentBlock(sectionText: string): {
  prohibition: string;
  opening: string;
  parentBlockForProvisos: string;
  exceptionListStart: number;
} {
  const bMatch = sectionText.search(/\n\s*\(b\)[\s\u00a0]/);
  const exceptionListStart = bMatch >= 0 ? bMatch : sectionText.search(/will not prohibit/i);
  const parent = exceptionListStart >= 0 ? sectionText.slice(0, exceptionListStart) : sectionText.slice(0, 1200);
  const aMatch = parent.match(/\(a\)[\s\u00a0]+([\s\S]+)/i);
  const prohibition = aMatch ? normalizeWs(aMatch[1]).trim() : normalizeWs(parent).trim();
  const openingMatch = sectionText.match(
    /The provisions of Section[\s\u00a0\d.a-z()]+will not prohibit\s*:?/i,
  );
  const opening = openingMatch
    ? openingMatch[0]
    : (sectionText.match(/will not prohibit\s*:?/i)?.[0] ?? "");
  return {
    prohibition: prohibition.slice(0, 800),
    opening,
    parentBlockForProvisos: parent,
    exceptionListStart: exceptionListStart >= 0 ? exceptionListStart : 0,
  };
}

function enumerateNumberedLimbs(
  sectionText: string,
  listStart: number,
  absoluteSectionStart: number,
): Array<{ num: string; text: string; charStart: number }> {
  const region = sectionText.slice(listStart);
  const prohibitIdx = region.search(/will not prohibit/i);
  const bRegion = prohibitIdx >= 0 ? region.slice(prohibitIdx) : region;
  const limbs: Array<{ num: string; text: string; charStart: number }> = [];
  const re = /(^|\n)[ \t\u00a0]*\((\d+)\)[ \t\u00a0]+/g;
  const matches: Array<{ num: string; start: number }> = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(bRegion)) !== null) {
    matches.push({ num: m[2], start: m.index + m[0].length });
  }
  for (let i = 0; i < matches.length; i++) {
    const cur = matches[i];
    const end = i + 1 < matches.length ? matches[i + 1].start : Math.min(bRegion.length, cur.start + 1200);
    // back up to previous marker start for cleaner text — use from '(' 
    const markerStart = bRegion.lastIndexOf(`(${cur.num})`, cur.start);
    const sliceStart = markerStart >= 0 ? markerStart : cur.start;
    const text = bRegion.slice(sliceStart, end).trim();
    if (/\[reserved\]/i.test(text.slice(0, 80))) continue;
    limbs.push({
      num: cur.num,
      text,
      charStart: absoluteSectionStart + listStart + (prohibitIdx >= 0 ? prohibitIdx : 0) + sliceStart,
    });
  }
  // dedupe by num keep first
  const seen = new Set<string>();
  return limbs.filter((l) => {
    if (seen.has(l.num)) return false;
    seen.add(l.num);
    return true;
  });
}

function detectRemoteConditions(args: {
  limbText: string;
  parentBlock: string;
  proviso: ProvisoAttachmentResult;
  crossRefs: CrossReferenceResult;
  definedTermHits: string[];
}): string[] {
  const remote: string[] = [];
  const limb = args.limbText;
  const parent = args.parentBlock;

  if (/Closing Date/i.test(limb)) remote.push("Closing Date limb");
  if (/Loan Documents?/i.test(limb)) remote.push("Loan Document defs");
  if (args.proviso.hits.some((h) => h.attachment === "PARENT_PROVISO_MAY_INTERACT")) {
    remote.push("parent section provisos");
  } else if (/\bprovided\s+that\b/i.test(parent)) {
    remote.push("parent section provisos");
  }
  if (/acquir|merg|consolidat|designat(?:ed|ion)\s+as\s+a\s+Restricted/i.test(limb)) {
    remote.push("acquisition timing / designation conditions");
  }
  if (/:\s*$/.test(limb.split("\n")[0]?.trim() ?? "") || /\n\s*\([a-z]\)/.test(limb)) {
    remote.push("nested subclause conditions");
  }
  if (/permitted to be incurred/i.test(limb) || /permitted under this Agreement/i.test(limb)) {
    remote.push("subsequent incurrence permission cross-ref");
  }
  if (/Transaction Documents?/i.test(limb)) {
    remote.push("Transaction Documents definition/external");
  }
  if (/\bCollateral\b/i.test(limb) || /\bCollateral\b/i.test(parent)) {
    remote.push("Collateral external");
  }
  if (/contested in good faith|adequate reserves|ordinary course of business/i.test(limb)) {
    remote.push("local contest/reserve conditions");
  }
  if (/Initial Agreement/i.test(limb) || args.proviso.primaryAttachment === "HANGING") {
    remote.push("Initial Agreement refinement proviso");
  }
  for (const t of args.definedTermHits) {
    if (!remote.some((r) => r.toLowerCase().includes(t.toLowerCase().slice(0, 12)))) {
      remote.push(`${t} definitional dependence`);
    }
  }
  for (const h of args.crossRefs.unresolvedOrNonResolved) {
    remote.push(`unresolved cross-ref:${h.normalizedTarget}`);
  }
  // dedupe
  return [...new Set(remote)];
}

function classify(args: {
  closure: DependencyClosure;
  remote: string[];
  proviso: ProvisoAttachmentResult;
  localEconomicGate: boolean;
}): { classification: PermissionClassification; refusal?: "AMBIGUOUS_CONDITION_SCOPE" } {
  if (args.proviso.refusalClass === "AMBIGUOUS_CONDITION_SCOPE" || args.proviso.ambiguous) {
    return { classification: "CONDITIONAL", refusal: "AMBIGUOUS_CONDITION_SCOPE" };
  }
  if (!mayClassifyUnconditional(args.closure) || args.remote.length > 0 || args.localEconomicGate) {
    return { classification: "CONDITIONAL" };
  }
  // Even with empty remote, refuse unconditional without full definitional closure
  if (args.closure.atoms.some((a) => a.kind === "DEFINED_TERM" && a.status !== "RESOLVED")) {
    return { classification: "CONDITIONAL" };
  }
  // Default: still CONDITIONAL unless closure explicitly non-blocking AND no remote —
  // Phase-4 policy: do not emit UNCONDITIONAL_SOURCE_VERIFIED from this analyzer.
  return { classification: "CONDITIONAL" };
}

export function analyzeExceptionSection(input: {
  fullText: string;
  sectionToken: string;
  sectionRefPrefix: string;
  mustContain?: string;
  knownSectionRefs?: Set<string>;
}): SectionAnalysis {
  const located = locateSectionBody(input.fullText, {
    sectionToken: input.sectionToken,
    mustContain: input.mustContain,
  });
  if (!located) {
    return {
      sectionRefPrefix: input.sectionRefPrefix,
      exceptions: [],
      parentProhibitionText: "",
      openingLanguageText: "",
    };
  }

  const parent = extractParentBlock(located.text);
  const limbs = enumerateNumberedLimbs(located.text, parent.exceptionListStart, located.start);
  const siblingRefs = limbs.map((l) => `${input.sectionRefPrefix}(b)(${l.num})`);

  const exceptions: AnalyzedException[] = limbs.map((limb) => {
    const sectionRef = `${input.sectionRefPrefix}(b)(${limb.num})`;
    const proviso = attachProvisos({
      exceptionRef: sectionRef,
      parentBlockText: parent.parentBlockForProvisos,
      exceptionLimbText: limb.text,
      siblingLimbRefs: siblingRefs.filter((r) => r !== sectionRef),
      hasCrossReferencedProviso: /Section\s+\d+/i.test(limb.text) && /provided/i.test(parent.parentBlockForProvisos),
    });

    const entityScope = interpretEntityScope([parent.prohibition, limb.text]);
    const crossReferences = resolveCrossReferences({
      texts: [parent.prohibition, parent.opening, limb.text],
      knownSectionRefs: input.knownSectionRefs,
    });

    const definedTermHits = crossReferences.hits
      .filter((h) => h.resolution === "DEFINED_TERM_REFERENCE" || h.resolution === "EXTERNAL_DOCUMENT")
      .map((h) => h.normalizedTarget);

    const remote = detectRemoteConditions({
      limbText: limb.text,
      parentBlock: parent.parentBlockForProvisos,
      proviso,
      crossRefs: crossReferences,
      definedTermHits,
    });

    const localEconomicGate =
      /\$[\d,]+|\d+\.\d+\s*%|greater of|Consolidated\s+\w+\s+Ratio|leverage ratio/i.test(limb.text);

    const closure = buildDependencyClosure({
      exceptionRef: sectionRef,
      governingProhibition: { text: parent.prohibition, status: "RESOLVED" },
      openingLanguage: parent.opening
        ? { text: parent.opening, status: "RESOLVED" }
        : undefined,
      localProvisos: proviso.hits
        .filter((h) => h.attachment === "OWN_CLAUSE" || h.attachment === "HANGING" || h.attachment === "MULTI_LIMB")
        .map((h) => ({ text: h.text, status: "RESOLVED" as const })),
      remoteSectionProvisos: proviso.hits
        .filter((h) => h.attachment === "PARENT_PROVISO_MAY_INTERACT" || h.attachment === "SECTION_WIDE")
        .map((h) => ({ text: h.text, status: "PARTIAL" as const })),
      definedTerms: definedTermHits.map((t) => ({
        term: t,
        status: /Closing Date|Transaction Documents|Collateral/i.test(t) ? ("EXTERNAL" as const) : ("PARTIAL" as const),
        evidenceText: t,
      })),
      entityRestrictions: entityScope.includes.map((e) => ({
        text: e.exactPhrase,
        status: "RESOLVED" as const,
      })),
      crossDocument: crossReferences.hits
        .filter((h) => h.resolution === "EXTERNAL_DOCUMENT")
        .map((h) => ({ text: h.normalizedTarget, status: "EXTERNAL" as const })),
      amendmentAuthority: [{ text: "amendment chain not closed in local analyzer pass", status: "UNRESOLVED" }],
      crossReferences: crossReferences.hits.map((h) => ({
        text: h.normalizedTarget,
        status:
          h.resolution === "RESOLVED_CONTROLLING" || h.resolution === "DEFINED_TERM_REFERENCE"
            ? ("RESOLVED" as const)
            : h.resolution === "AMBIGUOUS"
              ? ("AMBIGUOUS" as const)
              : h.resolution === "SUPERSEDED"
                ? ("SUPERSEDED" as const)
                : h.resolution === "EXTERNAL_DOCUMENT"
                  ? ("EXTERNAL" as const)
                  : ("UNRESOLVED" as const),
        targetRef: h.normalizedTarget,
      })),
    });

    const { classification, refusal } = classify({
      closure,
      remote,
      proviso,
      localEconomicGate,
    });

    return {
      detectedId: `DET-${input.sectionRefPrefix.replace(/\./g, "")}-b-${limb.num}`,
      sectionRef,
      limbText: limb.text,
      charStart: limb.charStart,
      preview: normalizeWs(limb.text).slice(0, 160),
      predictedClassification: classification,
      predictedRemoteConditions: remote,
      predictedProvisoAttachment: proviso.primaryAttachment,
      predictedEntityScope: [
        ...entityScope.includes.map((e) => e.entityClass),
        ...entityScope.excludes.map((e) => `EXCLUDE:${e.entityClass}`),
      ],
      predictedCrossRefs: crossReferences.hits.map((h) => h.normalizedTarget),
      dependencyClosure: closure,
      proviso,
      entityScope,
      crossReferences,
      unsupportedRefusal: refusal,
      productionCapacityApproved: false,
      evidence: {
        governingProhibition: parent.prohibition.slice(0, 400),
        openingLanguage: parent.opening,
        parentProvisoTexts: proviso.hits
          .filter((h) => h.attachment === "PARENT_PROVISO_MAY_INTERACT")
          .map((h) => h.text),
      },
    };
  });

  return {
    sectionRefPrefix: input.sectionRefPrefix,
    exceptions,
    parentProhibitionText: parent.prohibition,
    openingLanguageText: parent.opening,
  };
}

/** Analyze Gibraltar §7.06 (Phase-3 frozen held-out target). */
export function analyzeGibraltar706(fullText: string): SectionAnalysis {
  return analyzeExceptionSection({
    fullText,
    sectionToken: "Section\u00a07.06",
    sectionRefPrefix: "7.06",
    mustContain: "Burdensome",
    knownSectionRefs: new Set(["Section 7.06(a)", "Section 7.02", "7.06(a)", "7.02"]),
  });
}

/** Analyze Riot §5.02(a) roman-limb exceptions (issuer-disjoint additional eval). */
export function analyzeRiot502(fullText: string): AnalyzedException[] {
  const marker =
    "The Borrower shall not, directly or indirectly, create, incur, assume or permit to exist any Lien on or with respect to the Collateral";
  const start = fullText.indexOf(marker);
  if (start < 0) return [];
  const end = fullText.indexOf("(b)", start + 50);
  const block = fullText.slice(start, end > start ? end : start + 2500);
  const parentProhibition = marker;
  const limbs: AnalyzedException[] = [];
  // Top-level roman limbs only (avoid nested (i)/(ii) inside clause (iii)).
  const re = /(?:^|\n)\s*\(([ivx]+)\)\s*(?=Liens\b)/gi;
  const matches: Array<{ roman: string; idx: number }> = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(block)) !== null) {
    const absIdx = m.index + m[0].lastIndexOf("(");
    matches.push({ roman: m[1].toLowerCase(), idx: absIdx });
  }
  for (let i = 0; i < matches.length; i++) {
    const cur = matches[i];
    const next = i + 1 < matches.length ? matches[i + 1].idx : block.length;
    const text = block.slice(cur.idx, next).trim();
    const sectionRef = `5.02(a)(${cur.roman})`;
    const proviso = attachProvisos({
      exceptionRef: sectionRef,
      parentBlockText: parentProhibition,
      exceptionLimbText: text,
    });
    const entityScope = interpretEntityScope([parentProhibition, text]);
    const crossReferences = resolveCrossReferences({
      texts: [parentProhibition, text],
      externalDocTerms: new Set(["Loan Document", "Collateral", "Closing Date"]),
    });
    const remote = detectRemoteConditions({
      limbText: text,
      parentBlock: parentProhibition,
      proviso,
      crossRefs: crossReferences,
      definedTermHits: crossReferences.hits.map((h) => h.normalizedTarget),
    });
    // Tax / law limbs have local conditions
    if (/contested in good faith|adequate reserves|ordinary course/i.test(text)) {
      remote.push("local contest/reserve conditions");
    }
    const closure = buildDependencyClosure({
      exceptionRef: sectionRef,
      governingProhibition: { text: parentProhibition, status: "RESOLVED" },
      localProvisos: proviso.hits.map((h) => ({ text: h.text })),
      remoteSectionProvisos: [],
      definedTerms: ["Loan Document", "Collateral", "Collateral Agent", "Secured Parties"].map((t) => ({
        term: t,
        status: t === "Collateral" ? ("EXTERNAL" as const) : ("PARTIAL" as const),
      })),
      entityRestrictions: entityScope.includes.map((e) => ({ text: e.exactPhrase })),
      crossDocument: [{ text: "Pledge and Collateral Account Control Agreement", status: "EXTERNAL" }],
      amendmentAuthority: [{ text: "restatement chain not closed", status: "UNRESOLVED" }],
      crossReferences: crossReferences.hits.map((h) => ({
        text: h.normalizedTarget,
        status: "PARTIAL" as const,
        targetRef: h.normalizedTarget,
      })),
    });
    const { classification, refusal } = classify({
      closure,
      remote,
      proviso,
      localEconomicGate: false,
    });
    limbs.push({
      detectedId: `DET-RIOT-5.02-a-${cur.roman}`,
      sectionRef,
      limbText: text,
      charStart: start + cur.idx,
      preview: normalizeWs(text).slice(0, 160),
      predictedClassification: classification,
      predictedRemoteConditions: remote,
      predictedProvisoAttachment: proviso.primaryAttachment,
      predictedEntityScope: entityScope.includes.map((e) => e.entityClass),
      predictedCrossRefs: crossReferences.hits.map((h) => h.normalizedTarget),
      dependencyClosure: closure,
      proviso,
      entityScope,
      crossReferences,
      unsupportedRefusal: refusal,
      productionCapacityApproved: false,
      evidence: {
        governingProhibition: parentProhibition,
        openingLanguage: "except:",
        parentProvisoTexts: [],
      },
    });
  }
  return limbs;
}
