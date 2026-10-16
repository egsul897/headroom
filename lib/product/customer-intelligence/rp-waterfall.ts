/**
 * Pure RP-waterfall construction for counsel-compiled permissions.
 * Kept free of prisma imports so it is unit-testable in isolation.
 */

export interface RpWaterfallPerm {
  code: string | null;
  grantType: string;
  formulaType: string;
  sectionRef: string;
}

export interface RpWaterfallBuilt {
  steps: Array<{ code: string }>;
  ratioGateCodeByKind: { dividend: string | null; investment: string | null };
}

/**
 * Build Document.rpWaterfall from counsel-compiled
 * RESTRICTED_PAYMENT / INVESTMENT Permissions. Steps are ordered
 * builder → flat → other; ratio gates attached when present.
 *
 * A kind's ratio gate is ONLY a RATIO_GATE compiled for that same
 * grantType. The old code fell back to the other kind's gate and
 * then to the last waterfall step's code — inventing a ratio gate
 * when none was compiled (contradicting its own "does not invent
 * ratio-gate codes" docstring) and letting the engine/overview
 * treat an ordinary flat basket as a ratio gate. No gate → null.
 */
export function buildRpWaterfall(perms: RpWaterfallPerm[]): RpWaterfallBuilt | null {
  if (!perms.length) return null;

  const rank = (p: RpWaterfallPerm): number => {
    if (p.formulaType === "BUILDER_BASKET") return 0;
    if (p.formulaType === "FLAT_AMOUNT" || String(p.formulaType).includes("GREATER_OF")) return 1;
    if (p.formulaType === "RATIO_GATE" || p.formulaType === "LEVERAGE_RATIO_ROOM") return 9;
    return 5;
  };

  const stepPerms = perms
    .filter((p) => p.formulaType !== "RATIO_GATE" && p.code)
    .sort((a, b) => rank(a) - rank(b) || a.sectionRef.localeCompare(b.sectionRef));
  const steps = stepPerms.map((p) => ({ code: p.code! }));
  if (!steps.length) return null;

  const ratioGates = perms.filter((p) => p.formulaType === "RATIO_GATE" && p.code);
  return {
    steps,
    ratioGateCodeByKind: {
      dividend: ratioGates.find((p) => p.grantType === "RESTRICTED_PAYMENT")?.code ?? null,
      investment: ratioGates.find((p) => p.grantType === "INVESTMENT")?.code ?? null,
    },
  };
}
