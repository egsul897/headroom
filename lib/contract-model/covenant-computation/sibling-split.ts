/**
 * Basket clauses whose operative text runs on into the next sibling clauses ("(iv) unsecured Indebtedness; (v)
 * [Reserved]; (vi) Capitalized Lease Obligations … not to exceed $50,000,000"). The section tree sometimes fails to
 * split short enumerated clauses, so one span carries several siblings. Evaluated as one clause, the first sibling
 * would take a later sibling's figure (an uncapped clause reported with another clause's cap). This splits the span at
 * every following sibling enumerator of the same style and sequence that starts a new clause (after ";" or "." at
 * parenthesis depth 0), so each clause is evaluated on its own words only. General rule; no per-document logic.
 */
const ROMAN = ["i", "ii", "iii", "iv", "v", "vi", "vii", "viii", "ix", "x", "xi", "xii", "xiii", "xiv", "xv", "xvi", "xvii", "xviii", "xix", "xx", "xxi", "xxii", "xxiii", "xxiv", "xxv", "xxvi", "xxvii", "xxviii", "xxix", "xxx", "xxxi", "xxxii", "xxxiii", "xxxiv", "xxxv", "xxxvi", "xxxvii", "xxxviii", "xxxix", "xl"];

/** Labels that can follow `label` as the next sibling (both readings for "(i)", "(v)", "(x)" …). */
export function nextSiblingLabels(label: string): string[] {
  const x = label.slice(1, -1);
  if (/^\d{1,3}$/.test(x)) return [`(${+x + 1})`];
  const out: string[] = [];
  const up = x !== x.toLowerCase();
  const r = ROMAN.indexOf(x.toLowerCase());
  if (r >= 0 && ROMAN[r + 1]) out.push(`(${up ? ROMAN[r + 1]!.toUpperCase() : ROMAN[r + 1]})`);
  if (/^([a-z])\1?$/i.test(x)) {
    const c = x[0]!.toLowerCase();
    const next = c === "z" ? "a".repeat(x.length + 1) : String.fromCharCode(c.charCodeAt(0) + 1).repeat(x.length);
    out.push(`(${up ? next.toUpperCase() : next})`);
  }
  return [...new Set(out)];
}

function depthAt(text: string, idx: number): number {
  let d = 0;
  for (let k = 0; k < idx; k++) { const ch = text[k]; if (ch === "(") d++; else if (ch === ")") d = Math.max(0, d - 1); }
  return d;
}

/** The sibling clauses inside one span, or null when the span is a single clause. */
export function splitSiblingClauses(text: string): Array<{ label: string; text: string }> | null {
  const head = /^\s*(\((?:[ivxl]{1,6}|[a-z]{1,2}|[A-Z]{1,2}|\d{1,3})\))\s+/.exec(text);
  if (!head) return null;
  const out: Array<{ label: string; text: string }> = [];
  let label = head[1]!;
  let start = text.indexOf(label);
  let pos = start + label.length;
  for (let guard = 0; guard < 60; guard++) {
    let best: { at: number; label: string } | null = null;
    for (const c of nextSiblingLabels(label)) {
      const re = new RegExp(`[;.]\\s*(?:and\\s+|or\\s+)?(${c.replace(/[()]/g, "\\$&")})\\s`, "g");
      re.lastIndex = pos;
      for (let m = re.exec(text); m; m = re.exec(text)) {
        const at = m.index + m[0].indexOf(m[1]!);
        if (depthAt(text, at) !== 0) continue;
        if (!best || at < best.at) best = { at, label: c };
        break;
      }
    }
    if (!best) break;
    out.push({ label, text: text.slice(start, best.at).trim() });
    label = best.label; start = best.at; pos = best.at + best.label.length;
  }
  if (!out.length) return null;
  out.push({ label, text: text.slice(start).trim() });
  return out;
}
