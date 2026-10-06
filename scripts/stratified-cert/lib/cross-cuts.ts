/**
 * Derive stratum + cross-cuts from sealed discovery families/role (+ optional text heuristics).
 * Soft-gate offline pin helper — no provider calls.
 */

export type StratumId =
  | "DEBT"
  | "LIENS"
  | "RESTRICTED_PAYMENTS"
  | "INVESTMENTS"
  | "ASSET_SALES"
  | "FINANCIAL_COVENANTS"
  | "OTHER";

export type CrossCutId =
  | "WITH_SHARED_CAPS"
  | "WITHOUT_SHARED_CAPS"
  | "WITH_BUILDERS"
  | "WITHOUT_BUILDERS"
  | "WITH_RECLASSIFICATION"
  | "WITHOUT_RECLASSIFICATION";

const FAMILY_TO_STRATUM: Record<string, StratumId> = {
  INDEBTEDNESS: "DEBT",
  LIENS: "LIENS",
  RESTRICTED_PAYMENTS: "RESTRICTED_PAYMENTS",
  INVESTMENTS: "INVESTMENTS",
  ASSET_SALES: "ASSET_SALES",
  DISPOSITIONS: "ASSET_SALES",
  FINANCIAL_COVENANTS: "FINANCIAL_COVENANTS",
  FINANCIAL_TEST: "FINANCIAL_COVENANTS",
};

const BUILDER_RE = /\b(builder|grower|build[\s-]?up|accumulated\s+(?:amount|restricted\s+payments?)\s+capacity)\b/i;
const RECLASS_RE = /\b(reclassif(?:y|ication)|re[- ]characterize|anti[- ]duplication)\b/i;

export function stratumFromFamilies(families: readonly string[]): StratumId {
  for (const f of families) {
    const s = FAMILY_TO_STRATUM[f];
    if (s) return s;
  }
  return "OTHER";
}

export function deriveCrossCuts(args: {
  role: string;
  operativeText: string;
  overrides?: readonly CrossCutId[];
}): CrossCutId[] {
  if (args.overrides && args.overrides.length > 0) return [...args.overrides];
  const cuts: CrossCutId[] = [];
  if (args.role === "SHARED_CAP") cuts.push("WITH_SHARED_CAPS");
  else cuts.push("WITHOUT_SHARED_CAPS");
  if (BUILDER_RE.test(args.operativeText)) cuts.push("WITH_BUILDERS");
  else cuts.push("WITHOUT_BUILDERS");
  if (RECLASS_RE.test(args.operativeText)) cuts.push("WITH_RECLASSIFICATION");
  else cuts.push("WITHOUT_RECLASSIFICATION");
  return cuts;
}

export function crossCutClaims(args: {
  crossCuts: readonly CrossCutId[];
  role: string;
  discoveryId: string;
  operativeText: string;
}): Record<string, { claimed: boolean; basis: string }> {
  const out: Record<string, { claimed: boolean; basis: string }> = {};
  for (const id of args.crossCuts) {
    if (id === "WITH_SHARED_CAPS") {
      out[id] = {
        claimed: true,
        basis: `Sealed discovery role ${args.role} === SHARED_CAP on ${args.discoveryId}; WITH_SHARED_CAPS derived from role only (not operative-text heuristics).`,
      };
    } else if (id === "WITHOUT_SHARED_CAPS") {
      out[id] = { claimed: true, basis: `Sealed discovery role ${args.role} is not SHARED_CAP; treated as standalone for this pin.` };
    } else if (id === "WITH_BUILDERS") {
      out[id] = { claimed: true, basis: "Operative window matches builder/grower heuristic." };
    } else if (id === "WITHOUT_BUILDERS") {
      out[id] = { claimed: true, basis: "No builder/grower formula detected in this operative window." };
    } else if (id === "WITH_RECLASSIFICATION") {
      out[id] = { claimed: true, basis: "Operative window matches reclassification/anti-duplication heuristic." };
    } else if (id === "WITHOUT_RECLASSIFICATION") {
      out[id] = { claimed: true, basis: "No classification/reclassification mechanic detected in this operative window." };
    }
  }
  return out;
}
