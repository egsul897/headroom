/**
 * One shared page-furniture normalizer. A line that is only a page number ("12", "- 12 -", "104 105" dual numbering,
 * "Page 3 of 90") is blanked when it breaks body text: the nearest non-empty line before it is body prose (> 60 chars).
 * Table-of-contents entries ("Indebtedness\n\n53") keep their page numbers, which TOC detection relies on.
 * Applied symmetrically: section-tree text, compute-path text (build-package), the scoreboard matcher's norm() (both
 * candidate excerpt and citation) and the tree locator's key (both sides). Deterministic; removes only page numbers.
 */
const PAGE_LINE = /^[^\S\n]*(?:[-–—][^\S\n]*)?(?:page[^\S\n]+)?\d{1,3}(?:[^\S\n]+\d{1,3})?(?:[^\S\n]+of[^\S\n]+\d{1,3})?(?:[^\S\n]*[-–—])?[^\S\n]*$/i;
export function stripPageNumberLines(t: string): string {
  if (!t.includes("\n")) return t;
  const lines = t.split("\n");
  let prev = "";
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]!;
    if (PAGE_LINE.test(l) && l.trim()) {
      if (prev.length > 60) lines[i] = "";
      continue;
    }
    if (l.trim()) prev = l.trim();
  }
  return lines.join("\n");
}
