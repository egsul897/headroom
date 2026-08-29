/**
 * Evaluation Methodology V2 — raw-source excerpt resolver.
 *
 * Phase 3F.1.5. Architecture invariant #18 says mechanical independence at the
 * algorithm level is necessary but NOT sufficient: a shared upstream substrate
 * can defeat two "independent" systems simultaneously (the real Phase 2A →
 * 2B/2E precedent). This evaluator's ground-truth side therefore resolves its
 * own source excerpts DIRECTLY FROM THE RAW EXTRACTED TEXT, never from the
 * production structural index, so a structural-parser gap cannot silently
 * blind the evaluator and the system it is evaluating at the same time.
 *
 * The resolver is deliberately simple and conservative: when it cannot locate
 * a span with confidence it says so (`UNRESOLVED_DESCRIPTION_ONLY`) rather than
 * returning a plausible-looking wrong span.
 */

export interface ResolvedExcerpt {
  text: string;
  resolution: "RESOLVED_FROM_RAW_SOURCE" | "UNRESOLVED_DESCRIPTION_ONLY";
  charStart: number | null;
  charEnd: number | null;
  method: string;
}

const UNRESOLVED: ResolvedExcerpt = { text: "", resolution: "UNRESOLVED_DESCRIPTION_ONLY", charStart: null, charEnd: null, method: "none" };

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Body occurrence of a section heading, distinguished from its table-of-contents
 * entry WITHOUT any document-specific knowledge: TOC entries are packed a few
 * dozen characters apart, body occurrences are separated by the section's own
 * text. The occurrence with the largest distance to the next section heading is
 * the body one.
 */
function findBodyOccurrence(text: string, sectionNumber: string): number | null {
  const headingRe = new RegExp(`\\bSECTION\\s*${escapeRegExp(sectionNumber)}[.\\s]`, "gi");
  const anySectionRe = /\bSECTION\s*[0-9]+\.[0-9]+/gi;
  const occurrences = [...text.matchAll(headingRe)].map((m) => m.index ?? 0);
  if (occurrences.length === 0) return null;
  if (occurrences.length === 1) return occurrences[0] ?? null;
  const allSections = [...text.matchAll(anySectionRe)].map((m) => m.index ?? 0);
  let best = occurrences[0] ?? 0;
  let bestGap = -1;
  for (const o of occurrences) {
    const next = allSections.find((i) => i > o) ?? text.length;
    const gap = next - o;
    if (gap > bestGap) {
      bestGap = gap;
      best = o;
    }
  }
  return best;
}

function sectionEnd(text: string, from: number): number {
  const nextSection = text.slice(from + 10).search(/\bSECTION\s*[0-9]+\.[0-9]+/i);
  const nextArticle = text.slice(from + 10).search(/\bARTICLE\s+[IVXLC]+\b/);
  const candidates = [nextSection, nextArticle].filter((i) => i >= 0).map((i) => from + 10 + i);
  return candidates.length > 0 ? Math.min(...candidates) : Math.min(text.length, from + 20000);
}

/** Splits "6.01(b)(i)" into ["6.01", "(b)", "(i)"]. */
export function splitSectionRef(ref: string): { base: string; parts: string[] } {
  const cleaned = ref.replace(/^§/, "").replace(/^Sections?\s+/i, "").replace(/\s+/g, "").trim();
  const groups = cleaned.match(/\([^)]+\)/g) ?? [];
  const first = groups[0];
  const base = first ? cleaned.slice(0, cleaned.indexOf(first)) : cleaned;
  return { base, parts: groups };
}

/** Narrows a section body to one enumerated sub-item, e.g. "(b)" then "(i)". */
function narrowToPart(body: string, part: string): { text: string; start: number } | null {
  const label = part.slice(1, -1);
  const re = new RegExp(`(^|[\\n\\r]\\s*|;\\s*|\\.\\s+)\\(${escapeRegExp(label)}\\)\\s`, "g");
  const m = re.exec(body);
  if (!m) return null;
  const start = (m.index ?? 0) + (m[1]?.length ?? 0);
  // End at the next same-level enumerator, if one can be identified.
  const nextRe = /(^|[\n\r]\s*|;\s*|\.\s+)\([a-z0-9ivx]{1,4}\)\s/g;
  nextRe.lastIndex = start + 4;
  let end = body.length;
  let next: RegExpExecArray | null;
  while ((next = nextRe.exec(body)) !== null) {
    const idx = (next.index ?? 0) + (next[1]?.length ?? 0);
    if (idx > start) {
      end = idx;
      break;
    }
  }
  return { text: body.slice(start, end), start };
}

export interface ResolveOptions {
  maxChars: number;
  /** For DEFINITION units: locate the quoted defined term inside the definitions section instead of returning the whole section. */
  definedTermHints?: string[];
}

export function resolveSourceExcerpt(sourceText: string, sectionRef: string, options: ResolveOptions): ResolvedExcerpt {
  if (!sourceText || !sectionRef) return UNRESOLVED;
  const { base, parts } = splitSectionRef(sectionRef);
  if (!base) return UNRESOLVED;

  // Amendment documents number their operative provisions "Section 2(a)" style;
  // credit agreements use "SECTION 6.01." Try the dotted form first, then the
  // bare-integer form.
  let start = findBodyOccurrence(sourceText, base);
  let method = "section-heading";
  if (start === null && /^[0-9]+$/.test(base)) {
    const re = new RegExp(`\\bSection\\s*${escapeRegExp(base)}[.\\s]`, "gi");
    const occ = [...sourceText.matchAll(re)].map((m) => m.index ?? 0);
    start = occ.length > 0 ? (occ[occ.length - 1] ?? null) : null;
    method = "bare-section-heading";
  }
  if (start === null) {
    // Article-level ground-truth units ("VI") have no section heading of their own.
    if (/^[IVXLC]+$/.test(base)) {
      const re = new RegExp(`\\bARTICLE\\s+${escapeRegExp(base)}\\b`, "g");
      const occ = [...sourceText.matchAll(re)].map((m) => m.index ?? 0);
      if (occ.length > 0) {
        const chosen = occ[occ.length - 1] ?? 0;
        return {
          text: sourceText.slice(chosen, Math.min(sourceText.length, chosen + options.maxChars)),
          resolution: "RESOLVED_FROM_RAW_SOURCE",
          charStart: chosen,
          charEnd: Math.min(sourceText.length, chosen + options.maxChars),
          method: "article-heading",
        };
      }
    }
    return UNRESOLVED;
  }

  const end = sectionEnd(sourceText, start);
  let body = sourceText.slice(start, end);
  let absStart = start;

  for (const part of parts) {
    const narrowed = narrowToPart(body, part);
    if (!narrowed) break;
    absStart += narrowed.start;
    body = narrowed.text;
    method = `${method}+sub-item${part}`;
  }

  // Definition units: locate the quoted term inside the definitions section.
  if ((options.definedTermHints ?? []).length > 0 && parts.length === 0) {
    for (const term of options.definedTermHints ?? []) {
      const re = new RegExp(`["“]\\s*${escapeRegExp(term)}\\s*["”]`, "i");
      const m = re.exec(body);
      if (m) {
        const s = m.index ?? 0;
        absStart += s;
        body = body.slice(s);
        method = `${method}+defined-term`;
        break;
      }
    }
  }

  const text = body.slice(0, options.maxChars).trim();
  if (text.length < 20) return UNRESOLVED;
  return { text, resolution: "RESOLVED_FROM_RAW_SOURCE", charStart: absStart, charEnd: absStart + text.length, method };
}
