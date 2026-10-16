/**
 * Pure capacity-formula construction for counsel-compiled baskets.
 * Kept free of prisma imports so it is unit-testable in isolation.
 */

export interface SharedCapGroup {
  /** Shared aggregate cap, $M — the proviso's "shall not exceed $Z". */
  capMillions: number;
  /** Member basket codes (REFs) sharing this one cap. */
  memberCodes: string[];
  /** Human-readable group label for the formula. */
  label: string;
}

type RefNode = { op: "REF"; code: string };
type ConstNode = { op: "CONST"; value: number; label?: string };
type SumNode = { op: "SUM"; items: FormulaItem[]; label: string };
type MinNode = { op: "MIN"; items: FormulaItem[]; label: string };
export type FormulaItem = RefNode | ConstNode | SumNode | MinNode;

export interface CapacityFormulasBuilt {
  secured?: {
    op: "MIN" | "SUM";
    label: string;
    items: FormulaItem[];
  };
  unsecured?: {
    op: "SUM";
    label: string;
    items: FormulaItem[];
  };
}

/**
 * Build Document.capacityFormulas from counsel-compiled basket codes.
 *
 * Secured = MIN(SUM(debt), SUM(lien)) — secured debt needs BOTH a
 * debt-incurrence permission AND a lien permission. When only one
 * leg is compiled, NO secured formula is minted: the missing leg
 * is unknown, and minting SUM(one leg) silently assumes the other
 * leg is unconstrained. The engine treats any present formula as
 * authoritative and never reads the old "lien regime not yet
 * counsel-compiled" label, so the label did not protect the
 * number. Unsecured = SUM(debt) is unaffected — unsecured debt
 * needs only the debt leg.
 */
export function buildCapacityFormulas(
  debtCodes: string[],
  lienCodes: string[],
  sharedGroups: SharedCapGroup[] = [],
): CapacityFormulasBuilt {
  const ref = (code: string) => ({ op: "REF" as const, code });
  // Rule 179: members of a shared aggregate basket are emitted as
  // ONE group node MIN(CONST(cap), SUM(member REFs)) instead of N
  // independent REFs — counting the basket once. A code in several
  // groups is assigned to its first group (tightest cap first —
  // callers sort ascending); overlapping groups are a heuristic in
  // the legacy formula (the solver-native path enforces them
  // exactly). Group capacity = min(cap, sum of member thresholds):
  // the aggregate proviso caps the SUM, so neither the bare cap
  // nor the bare sum alone is right.
  const grouped = new Set<string>();
  const debtItems: FormulaItem[] = [];
  for (const g of [...sharedGroups].sort((a, b) => a.capMillions - b.capMillions)) {
    const members = g.memberCodes.filter((c) => debtCodes.includes(c) && !grouped.has(c));
    if (members.length < 2) continue; // a 1-member "group" is just that basket
    for (const c of members) grouped.add(c);
    debtItems.push({
      op: "MIN",
      label: g.label,
      items: [
        { op: "CONST", value: g.capMillions, label: g.label },
        { op: "SUM", items: members.map(ref), label: `${g.label} (member baskets)` },
      ],
    });
  }
  for (const c of debtCodes) if (!grouped.has(c)) debtItems.push(ref(c));

  const out: CapacityFormulasBuilt = {};

  if (debtCodes.length && lienCodes.length) {
    out.secured = {
      op: "MIN",
      label: "Secured capacity (counsel-compiled debt ∩ lien)",
      items: [
        { op: "SUM", items: debtItems, label: "Debt baskets" },
        { op: "SUM", items: lienCodes.map(ref), label: "Lien baskets" },
      ],
    };
  }

  if (debtCodes.length) {
    out.unsecured = {
      op: "SUM",
      label: "Unsecured debt baskets (counsel-compiled)",
      items: debtItems,
    };
  }

  return out;
}
