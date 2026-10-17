/**
 * NextAuth session → VerifiedServerPrincipal bridge.
 *
 * THE MISSING LINK: the CFO workflow pages (Position, Simulate,
 * Analyze, Review, Audit, Documents, Evidence) gate on a
 * VerifiedServerPrincipal, but nothing ever minted one from the
 * NextAuth session — so every signed-in CUSTOMER company got a 404
 * from the anonymous path. This provider closes that gap by
 * verifying the server-side session and minting a principal from
 * it. It does NOT weaken the gate; it supplies the input the gate
 * was designed to receive.
 *
 * Fail-closed properties (do not relax them):
 * - The session is read SERVER-SIDE via getServerSession (never
 *   client input). No session → null → gate denies as before.
 * - companyScope comes from the SESSION, never the request. A
 *   session for company A never authorizes company B (the gate
 *   checks companyScope includes the requested companyId).
 * - Permissions are MINIMAL: EVIDENCE_REVIEWER = ["REVIEW_EVIDENCE"]
 *   only — exactly what the page gate needs for read/review
 *   access. No metric approval, no completeness certification,
 *   no production capacity authority.
 * - Production capacity stays BLOCKED: TRUSTED_IDENTITY_PRODUCTION_ACTIVATION
 *   is const BLOCKED and the gate's requireProductionPublication path
 *   always denies, regardless of principal.
 * - The principal is minted and gated within the SAME request
 *   (15-minute expiry bounds replay); it is never cached across
 *   requests and never survives logout.
 * - Any error (including getServerSession outside a request
 *   context) → null → deny. There is NO test/synthetic fallback
 *   here: a principal is never minted from nothing.
 */
import { getSessionUser } from "./guard";
import {
  PERMISSION_BUNDLES,
  registerServerIdentityProvider,
  type IdpVerificationResult,
  type ServerIdentityProvider,
} from "@/lib/capacity/identity";

/** Short principal lifetime: minted and gated in the same request. */
const PRINCIPAL_TTL_MS = 15 * 60 * 1000;

export const nextAuthIdentityProvider: ServerIdentityProvider = {
  providerId: "nextauth-session",
  providerClass: "PRODUCTION_IDP",
  async verifyCredentials(): Promise<IdpVerificationResult | null> {
    try {
      // The credential handle is an opaque server-side marker; the
      // session itself is verified from the current request's
      // cookies via getServerSession — never from client input.
      const user = await getSessionUser();
      if (!user?.id || !user.companyId) return null;
      return {
        principalId: user.id,
        companyScope: [user.companyId],
        permissions: [...PERMISSION_BUNDLES.EVIDENCE_REVIEWER],
        completenessRoles: [],
        identityAssurance: "SESSION_AUTHENTICATED",
        expiresAtMs: Date.now() + PRINCIPAL_TTL_MS,
        authorizationBasis: "session:verified",
      };
    } catch {
      // No request context, no session store, any failure → no
      // principal. Fail closed; the gate denies as before.
      return null;
    }
  },
};

// Register on import: the page-access helpers import this module,
// so the provider is registered before any gate call in the request.
registerServerIdentityProvider(nextAuthIdentityProvider);
