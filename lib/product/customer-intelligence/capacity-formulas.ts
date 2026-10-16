/**
 * Pure capacity-formula construction for counsel-compiled baskets.
 * Kept free of prisma imports so it is unit-testable in isolation.
 */

export interface CapacityFormulasBuilt {
  secured?: {
    op: "MIN" | "SUM";
    label: string;
    items: Array<
      | { op: "REF"; code: string }
      | { op: "SUM"; items: Array<{ op: "REF"; code: string }>; label: string }
    >;
  };
  unsecured?: {
    op: "SUM";
    label: string;
    items: Array<{ op: "REF"; code: string }>;
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
): CapacityFormulasBuilt {
  const ref = (code: string) => ({ op: "REF" as const, code });
  const out: CapacityFormulasBuilt = {};

  if (debtCodes.length && lienCodes.length) {
    out.secured = {
      op: "MIN",
      label: "Secured capacity (counsel-compiled debt ∩ lien)",
      items: [
        { op: "SUM", items: debtCodes.map(ref), label: "Debt baskets" },
        { op: "SUM", items: lienCodes.map(ref), label: "Lien baskets" },
      ],
    };
  }

  if (debtCodes.length) {
    out.unsecured = {
      op: "SUM",
      label: "Unsecured debt baskets (counsel-compiled)",
      items: debtCodes.map(ref),
    };
  }

  return out;
}
