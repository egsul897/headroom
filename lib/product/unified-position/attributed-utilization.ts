/**
 * Phase 4C attributed utilization → Position capacity rows (client-safe).
 *
 * Aggregates active ContractLedgerUsage by capacityPath.ruleId / sharedCapacityId.
 * TRACKED only when an overview row's Permission.code (or exact action) matches —
 * never fuzzy. Unmatched / unresolved → UNKNOWN (null), never zero.
 *
 * Server I/O lives in attributed-utilization-server.ts so DashboardClient can
 * import this module without pulling Prisma / node:crypto into the webpack graph.
 */

/** Minimal ledger shape — avoids importing north-star-bridge (node:crypto). */
export interface AttributedLedgerUsageInput {
  usageId: string;
  status: string;
  amount: { amount: string; currency?: string | null };
  capacityPath:
    | { kind: "RULE"; ruleId: string }
    | { kind: "SHARED_CAPACITY"; sharedCapacityId: string }
    | { kind: string; [k: string]: unknown };
}

export interface AttributedUsageBucket {
  key: string;
  kind: "RULE" | "SHARED_CAPACITY";
  used: number;
  currency: string;
  usageCount: number;
  usageIds: string[];
}

export interface AttributedUtilizationIndex {
  companyId: string;
  byKey: Map<string, AttributedUsageBucket>;
  unresolvedCount: number;
  activeUsageCount: number;
  /** Serializable for client reflow */
  entries: AttributedUsageBucket[];
}

function pathKey(
  path: AttributedLedgerUsageInput["capacityPath"],
): { key: string; kind: "RULE" | "SHARED_CAPACITY" } | null {
  if (path.kind === "RULE" && typeof (path as { ruleId?: string }).ruleId === "string") {
    return { key: (path as { ruleId: string }).ruleId, kind: "RULE" };
  }
  if (
    path.kind === "SHARED_CAPACITY" &&
    typeof (path as { sharedCapacityId?: string }).sharedCapacityId === "string"
  ) {
    return { key: (path as { sharedCapacityId: string }).sharedCapacityId, kind: "SHARED_CAPACITY" };
  }
  return null;
}

function moneyAmount(u: AttributedLedgerUsageInput): number | null {
  const a = u.amount;
  if (!a || typeof a.amount !== "string") return null;
  const n = Number(a.amount);
  return Number.isFinite(n) ? n : null;
}

/** Aggregate active (non-SUPERSEDED) 4C usages. Currency mismatch → skip that usage (fail closed). */
export function indexAttributedUsages(
  companyId: string,
  usages: AttributedLedgerUsageInput[],
): AttributedUtilizationIndex {
  const byKey = new Map<string, AttributedUsageBucket>();
  let unresolvedCount = 0;
  let activeUsageCount = 0;

  for (const u of usages) {
    if (u.status === "SUPERSEDED") continue;
    activeUsageCount++;
    const pk = pathKey(u.capacityPath);
    if (!pk) {
      unresolvedCount++;
      continue;
    }
    const amt = moneyAmount(u);
    if (amt == null) {
      unresolvedCount++;
      continue;
    }
    const currency = u.amount.currency ?? "USD";
    const existing = byKey.get(pk.key);
    if (!existing) {
      byKey.set(pk.key, {
        key: pk.key,
        kind: pk.kind,
        used: amt,
        currency,
        usageCount: 1,
        usageIds: [u.usageId],
      });
      continue;
    }
    if (existing.currency !== currency) {
      // Do not invent FX conversion — leave prior aggregate; count as unresolved.
      unresolvedCount++;
      continue;
    }
    existing.used += amt;
    existing.usageCount += 1;
    existing.usageIds.push(u.usageId);
  }

  return {
    companyId,
    byKey,
    unresolvedCount,
    activeUsageCount,
    entries: [...byKey.values()].sort((a, b) => a.key.localeCompare(b.key)),
  };
}

/**
 * Resolve attribution for an overview capacity row.
 * Exact match on Permission.code, then Permission.action — never substring.
 */
export function resolveRowAttribution(
  index: AttributedUtilizationIndex | null | undefined,
  keys: Array<string | null | undefined>,
): AttributedUsageBucket | null {
  if (!index) return null;
  for (const k of keys) {
    if (!k) continue;
    const hit = index.byKey.get(k);
    if (hit) return hit;
  }
  return null;
}

/**
 * Serializable form for client reflow (Map cannot cross the RSC boundary).
 */
export type AttributedUtilizationSerialized = {
  companyId: string;
  unresolvedCount: number;
  activeUsageCount: number;
  entries: AttributedUsageBucket[];
};

export function serializeAttributedUtilization(
  index: AttributedUtilizationIndex,
): AttributedUtilizationSerialized {
  return {
    companyId: index.companyId,
    unresolvedCount: index.unresolvedCount,
    activeUsageCount: index.activeUsageCount,
    entries: index.entries,
  };
}

export function deserializeAttributedUtilization(
  raw: AttributedUtilizationSerialized | null | undefined,
): AttributedUtilizationIndex | null {
  if (!raw) return null;
  return {
    companyId: raw.companyId,
    unresolvedCount: raw.unresolvedCount,
    activeUsageCount: raw.activeUsageCount,
    entries: raw.entries,
    byKey: new Map(raw.entries.map((e) => [e.key, e])),
  };
}

/**
 * Apply Phase 4C attributed usage onto an overview capacity row.
 * Ledger amounts are USD dollars; overview `currentCapacity` is $M — convert so
 * remaining / utilization stay in millions. Never invent zero for UNKNOWN.
 */
export function applyAttributedUsageToCapacity(args: {
  currentCapacity: number | null;
  capacityUnlimited: boolean;
  attributed: AttributedUsageBucket | null;
}): {
  usageState: "TRACKED" | "NOT_TRACKED";
  used: number | null;
  remaining: number | null;
  utilizationPct: number | null;
} {
  if (!args.attributed) {
    return { usageState: "NOT_TRACKED", used: null, remaining: null, utilizationPct: null };
  }
  // Ledger MONEY → overview $M
  const used = args.attributed.used / 1_000_000;
  if (args.capacityUnlimited || args.currentCapacity == null || !Number.isFinite(args.currentCapacity)) {
    return { usageState: "TRACKED", used, remaining: null, utilizationPct: null };
  }
  const remaining = args.currentCapacity - used;
  const utilizationPct = args.currentCapacity > 0 ? (used / args.currentCapacity) * 100 : null;
  return {
    usageState: "TRACKED",
    used,
    remaining: Number.isFinite(remaining) ? remaining : null,
    utilizationPct: utilizationPct != null && Number.isFinite(utilizationPct) ? utilizationPct : null,
  };
}
