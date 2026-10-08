/**
 * Fleet SEC fair-access gate for WS-CCA.
 *
 * WS-EHB owns live SEC acquisition. Process-local limiters are NOT fleet-wide.
 * When cross-process coordination is unavailable, all live fetches must go
 * through the designated owner (HEADROOM_SEC_FETCH_OWNER=WS-EHB) with an
 * authorized User-Agent.
 *
 * Soft gate. IMPLEMENTED ≠ CERTIFIED.
 */
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

export interface FleetSecGateReport {
  role: "WS-CCA";
  designatedOwner: string;
  sharedBudgetPath: string | null;
  sharedBudgetConfigured: boolean;
  liveNetworkAllowedForCca: boolean;
  authorizedUserAgentConfigured: boolean;
  userAgentPreview: string | null;
  processLocalLimiterOnly: true;
  recommendation: string;
  policyReason: string;
  ehbContractPath: string | null;
}

function looksPlaceholder(ua: string): boolean {
  return /@(?:example\.(?:com|org|net)|test\.|invalid|localhost)|engineering@headroom-app\.example|noreply@|no-?reply@/i.test(
    ua,
  );
}

export function resolveAuthorizedUserAgent(env: NodeJS.ProcessEnv = process.env): string | null {
  const full = env.SEC_EDGAR_USER_AGENT?.trim();
  if (full) {
    if (!/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(full) || looksPlaceholder(full)) {
      throw new Error(
        "SEC_EDGAR_USER_AGENT is missing a real contact or looks like a placeholder. Do not invent one.",
      );
    }
    return full;
  }
  const email = env.SEC_EDGAR_CONTACT_EMAIL?.trim();
  if (!email) return null;
  if (looksPlaceholder(email) || !/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(email)) {
    throw new Error("SEC_EDGAR_CONTACT_EMAIL looks like a placeholder. Supply an authorized operator email.");
  }
  const name = (env.SEC_EDGAR_USER_AGENT_NAME ?? "HeadroomCursorCloudCompute/1.0").trim();
  return `${name} (contact: ${email}; research; respectful fair-access; WS-CCA via WS-EHB)`;
}

export async function evaluateFleetSecGate(options?: {
  ehbRoot?: string | null;
  env?: NodeJS.ProcessEnv;
}): Promise<FleetSecGateReport> {
  const env = options?.env ?? process.env;
  const ehbRoot = options?.ehbRoot ?? env.HEADROOM_EHB_ROOT ?? null;
  const owner = (env.HEADROOM_SEC_FETCH_OWNER?.trim() || "NONE").toUpperCase() === "NONE"
    ? env.HEADROOM_SEC_FETCH_OWNER?.trim() || "NONE"
    : env.HEADROOM_SEC_FETCH_OWNER!.trim();
  const sharedBudgetPath = env.HEADROOM_SEC_SHARED_BUDGET_PATH?.trim() || null;
  let ua: string | null = null;
  let uaOk = false;
  try {
    ua = resolveAuthorizedUserAgent(env);
    uaOk = !!ua;
  } catch {
    uaOk = false;
  }

  let policyReason =
    "WS-CCA does not live-fetch except through WS-EHB SecAccessCoordinator under designated-owner or shared-budget policy.";
  let liveAllowed = false;
  let ehbContractPath: string | null = null;

  if (ehbRoot) {
    const contract = path.join(ehbRoot, "docs/edgar-historical-backfill/03-fleet-sec-access-contract.md");
    if (fs.existsSync(contract)) ehbContractPath = contract;
    const budgetMod = path.join(ehbRoot, "lib/edgar-historical-backfill/fleet-sec-budget.ts");
    if (fs.existsSync(budgetMod) && ua) {
      try {
        const mod = (await import(pathToFileURL(budgetMod).href)) as {
          evaluateSecAccessPolicy?: (p: {
            role: string;
            userAgent: string;
            env?: NodeJS.ProcessEnv;
          }) => {
            liveNetworkAllowed: boolean;
            reason: string;
            sharedBudgetConfigured: boolean;
          };
        };
        // CCA never claims owner role WS-EHB; we evaluate whether EHB role would be allowed,
        // and separately whether CCA itself may live-fetch (only when owner is WS-EHB and we
        // route through EHB client — CCA role itself stays denied for direct parallel flood).
        const ehbPolicy = mod.evaluateSecAccessPolicy?.({
          role: "WS-EHB",
          userAgent: ua,
          env,
        });
        const ccaPolicy = mod.evaluateSecAccessPolicy?.({
          role: "WS-CCA",
          userAgent: ua,
          env,
        });
        if (ehbPolicy) {
          policyReason = `EHB-owner policy: ${ehbPolicy.reason}; CCA-direct policy: ${ccaPolicy?.reason ?? "n/a"}`;
          // Live allowed for CCA only when EHB is designated owner (or shared budget) AND UA ok —
          // fetches must still go through EHB SecAccessCoordinator, not a CCA-native flooder.
          liveAllowed = !!ehbPolicy.liveNetworkAllowed && uaOk;
        }
      } catch (err) {
        policyReason = `Failed to load EHB fleet-sec-budget: ${err instanceof Error ? err.message : String(err)}`;
      }
    }
  }

  if (!sharedBudgetPath && owner === "NONE") {
    liveAllowed = false;
    policyReason =
      "No HEADROOM_SEC_SHARED_BUDGET_PATH and HEADROOM_SEC_FETCH_OWNER=NONE — refuse live SEC to prevent uncontrolled parallel acquisition.";
  }

  let recommendation: string;
  if (!uaOk) {
    recommendation =
      "Set SEC_EDGAR_CONTACT_EMAIL or SEC_EDGAR_USER_AGENT to an authorized operator contact before any live SEC fetch.";
  } else if (sharedBudgetPath) {
    recommendation =
      "Shared budget configured — acquire lease via WS-EHB before bursts; do not bypass EHB transport.";
  } else if (owner === "WS-EHB") {
    recommendation =
      "Serial ownership: WS-EHB is designated live-fetch owner. WS-CCA routes exhibit GETs only through EHB SecAccessCoordinator; other agents must stay cache-only.";
  } else {
    recommendation =
      "Set HEADROOM_SEC_FETCH_OWNER=WS-EHB (recommended for this mission) or provide HEADROOM_SEC_SHARED_BUDGET_PATH on a shared volume.";
  }

  return {
    role: "WS-CCA",
    designatedOwner: owner,
    sharedBudgetPath,
    sharedBudgetConfigured: !!sharedBudgetPath,
    liveNetworkAllowedForCca: liveAllowed,
    authorizedUserAgentConfigured: uaOk,
    userAgentPreview: ua ? ua.replace(/[A-Z0-9._%+-]+@/gi, "***@") : null,
    processLocalLimiterOnly: true,
    recommendation,
    policyReason,
    ehbContractPath,
  };
}

/** Ensure a shared budget file exists when a path is configured (cooperative empty start). */
export function ensureSharedBudgetFile(budgetPath: string): void {
  fs.mkdirSync(path.dirname(budgetPath), { recursive: true });
  if (fs.existsSync(budgetPath)) return;
  const initial = {
    version: 1,
    leaseHolder: "WS-EHB",
    leaseExpiresAtMs: Date.now() + 60_000,
    maxRequestsPerSecond: 5,
    tokens: 5,
    windowStartedAtMs: Date.now(),
    liveRequestCount: 0,
    updatedAt: new Date().toISOString(),
    notes: [
      "Initialized by WS-CCA for cooperative fleet fair-access. Process-local limiters remain non-fleet.",
    ],
  };
  fs.writeFileSync(budgetPath, JSON.stringify(initial, null, 2));
}
