/**
 * Pure restatement-title test. Kept free of prisma imports so it
 * is unit-testable in isolation.
 */

/**
 * True when a document title indicates THIS document is a
 * restatement (its own text replaces the base agreement), not
 * merely an amendment TO a restated agreement.
 *
 * "Amendment No. 1 to the Amended and Restated Credit
 * Agreement" describes the BASE ("Amended and Restated ..."),
 * not the document — it is an amendment. The old bare
 * /\brestate|\bamended and restated\b/ test matched that title
 * and, in the operative resolver, treated the amendment as a
 * full restatement superseding the entire base agreement.
 * "Amendment and Restatement" (no "to") IS a restatement.
 */
export function isRestatementTitle(title: string): boolean {
  const t = title.toLowerCase();
  const amendmentToSomething =
    /^\s*(?:\w+\s+)?amendment\s+(?:no\.?\s*|number\s*|#\s*)?\d|^\s*(?:\w+\s+)?amendment\s+to\b/.test(t);
  return !amendmentToSomething && (/\brestate|\bamended and restated\b/.test(t));
}
