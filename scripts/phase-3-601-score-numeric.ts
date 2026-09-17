/**
 * PHASE 3 / 6.01 remediation §19 - HD-5 fix: the ONE numeric-correspondence module every 6.01 reference scorer uses.
 *
 * HD-5 (docs/phase-3-final-601/88): the pinned scorer parsed a source percent "50%" as value 50 (unit "%") while Pass A
 * normalizes the same verbatim "50%" to the fraction 0.5, so near(0.5, 50) was false and every percent became a
 * "contradiction"; and a frozen reference span ending at "$360.0" (the word "million" one character past the span)
 * made the scorer compare 360 against the IR's 360,000,000. Both are scoring-harness defects, never production ones.
 *
 * Contract:
 *  - unit-aware: a value is only ever compared against source numbers of the SAME unit;
 *  - percents are fractions on both sides (50% -> 0.5), money is fully scaled (million/billion), ratios are plain;
 *  - raw text is preserved on every parsed number for provenance;
 *  - span truncation cannot manufacture a contradiction: when a source number's raw text is a prefix of the IR value's
 *    own verbatim raw text (the span cut the phrase), or the IR raw text is present verbatim in the FULL source text
 *    around the span, the value is corroborated by the source, not contradicted by it.
 * No model calls. Zero package/section/term special cases.
 */

export interface ParsedNumber { raw: string; value: number; unit: "USD" | "%" | "x" }

/** Numbers a reader would have to get right: money (fully scaled), percents (as fractions), leverage-style ratios. */
export function numbersIn(text: string): ParsedNumber[] {
  const out: ParsedNumber[] = [];
  for (const m of text.matchAll(/\$\s?([\d,]+(?:\.\d+)?)\s*(million|billion|thousand)?/gi)) {
    const scale = /million/i.test(m[2] ?? "") ? 1e6 : /billion/i.test(m[2] ?? "") ? 1e9 : /thousand/i.test(m[2] ?? "") ? 1e3 : 1;
    out.push({ raw: m[0]!.trim(), value: Number(m[1]!.replace(/,/g, "")) * scale, unit: "USD" });
  }
  for (const m of text.matchAll(/(\d+(?:\.\d+)?)\s*%/g)) out.push({ raw: m[0]!.trim(), value: Number(m[1]) / 100, unit: "%" });
  for (const m of text.matchAll(/(\d+\.\d+)\s*(?:x\b|to\s*1(?:\.00)?)/gi)) out.push({ raw: m[0]!.trim(), value: Number(m[1]), unit: "x" });
  return out;
}

export const near = (a: number, b: number): boolean => Math.abs(a - b) < 1e-6 || (b !== 0 && Math.abs(a - b) / Math.abs(b) < 1e-9);

/** The IR-side value as Pass A / Pass C record it: normalized number, its unit and the verbatim raw text it came from. */
export interface IrSideValue { normalizedValue: number | null; unit: string | null; rawText: string }

/** Maps an IR-side unit label onto the scorer's unit vocabulary; null when the unit is not one the scorer compares (dates, days, plain numbers). */
export function scorerUnitOf(unit: string | null): ParsedNumber["unit"] | null {
  if (!unit) return null;
  const u = unit.trim().toUpperCase();
  if (u === "USD" || u === "$") return "USD";
  if (u === "%" || u === "PERCENT") return "%";
  if (u === "X" || u === "RATIO" || u === "MULTIPLE") return "x";
  return null;
}

/**
 * True when `ir` contradicts the source span: same-unit source numbers exist, none matches numerically, AND the IR's
 * own verbatim raw text is not corroborated by the source (neither a prefix relation with a span-cut source number nor
 * a verbatim occurrence in the surrounding full source text). `fullSourceText`/`spanEnd` let the scorer look past a
 * truncated span boundary without editing the frozen reference.
 */
export function contradictsSource(ir: IrSideValue, sourceNumbers: ParsedNumber[], opts: { fullSourceText?: string; spanStart?: number; spanEnd?: number } = {}): { contradiction: boolean; reason: string } {
  if (ir.normalizedValue === null) return { contradiction: false, reason: "no normalized IR value" };
  const unit = scorerUnitOf(ir.unit);
  if (!unit) return { contradiction: false, reason: `unit ${ir.unit ?? "(none)"} is not compared` };
  const sameUnit = sourceNumbers.filter((s) => s.unit === unit);
  if (sameUnit.length === 0) return { contradiction: false, reason: "no same-unit source number in span" };
  if (sameUnit.some((s) => near(ir.normalizedValue!, s.value))) return { contradiction: false, reason: "matches a same-unit source number" };
  const irRaw = ir.rawText.replace(/\s+/g, " ").trim();
  const norm = (t: string) => t.replace(/\s+/g, " ").trim().toLowerCase();
  // span truncation guard: a source number cut by the span boundary is a prefix of the IR's own raw text
  if (irRaw && sameUnit.some((s) => norm(irRaw).startsWith(norm(s.raw)) && norm(irRaw) !== norm(s.raw))) return { contradiction: false, reason: `source number "${sameUnit.find((s) => norm(irRaw).startsWith(norm(s.raw)))!.raw}" is a span-cut prefix of the IR raw text "${irRaw}"` };
  // verbatim corroboration just outside the span (bounded window), never a widened oracle: the frozen span is untouched
  if (opts.fullSourceText && opts.spanStart !== undefined && opts.spanEnd !== undefined && irRaw) {
    const window = opts.fullSourceText.slice(Math.max(0, opts.spanStart - 40), Math.min(opts.fullSourceText.length, opts.spanEnd + 40));
    if (norm(window).includes(norm(irRaw))) {
      const parsed = numbersIn(irRaw).find((n) => n.unit === unit);
      if (parsed && near(ir.normalizedValue, parsed.value)) return { contradiction: false, reason: `IR raw text "${irRaw}" occurs verbatim at the span boundary and parses to the IR value (span truncation)` };
    }
  }
  return { contradiction: true, reason: `IR ${unit} value ${ir.normalizedValue} ("${irRaw}") matches none of the same-unit source numbers ${sameUnit.map((s) => `${s.raw}=${s.value}`).join(", ")}` };
}
