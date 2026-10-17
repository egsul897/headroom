/**
 * NextAuth session → VerifiedServerPrincipal bridge.
 *
 * The CFO pages gate on a VerifiedServerPrincipal; nothing minted
 * one from the NextAuth session, so every signed-in CUSTOMER company
 * got a 404. This test proves the bridge mints a MINIMAL principal
 * (REVIEW_EVIDENCE only, companyScope from the session) that the
 * gate accepts for the session's own company and refuses
 * cross-tenant — and that no session / a broken session means no
 * principal at all (fail-closed).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetServerSession = vi.fn();
vi.mock("next-auth", () => ({ getServerSession: (...args: unknown[]) => mockGetServerSession(...args) }));
// Break the prisma import chain (options.ts imports prisma; the test
// never touches the DB).
vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import { gateWorkspaceAccess } from "@/lib/customer-workflow/workspace-access";
import { verifyAndMintPrincipal } from "@/lib/capacity/identity/provider-contract";
// Side-effect import: registers the NextAuth session provider.
import "@/lib/auth/nextauth-identity-provider";

const SESSION = {
  user: { id: "user-1", email: "cfo@co.test", companyId: "co-session", role: "USER" as const },
  expires: new Date(Date.now() + 3600_000).toISOString(),
};

beforeEach(() => {
  mockGetServerSession.mockReset();
});

describe("nextauth-identity-provider", () => {
  it("mints a minimal REVIEW_EVIDENCE-only principal from a verified session", async () => {
    mockGetServerSession.mockResolvedValue(SESSION);
    const { principal, blockers } = await verifyAndMintPrincipal({
      kind: "SESSION",
      sessionHandle: "nextauth:current-request",
    });
    expect(blockers).toEqual([]);
    expect(principal).not.toBeNull();
    expect(principal?.principalId).toBe("user-1");
    expect([...(principal?.companyScope ?? [])]).toEqual(["co-session"]);
    expect([...(principal?.permissions ?? [])]).toEqual(["REVIEW_EVIDENCE"]);
    expect([...(principal?.completenessRoles ?? [])]).toEqual([]);
    expect(principal?.identityAssurance).toBe("SESSION_AUTHENTICATED");
    expect(principal?.authorizationBasis).toBe("session:verified");
  });

  it("mints no principal when there is no session (fail-closed)", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const { principal } = await verifyAndMintPrincipal({
      kind: "SESSION",
      sessionHandle: "nextauth:current-request",
    });
    expect(principal).toBeNull();
  });

  it("mints no principal when session verification throws (fail-closed)", async () => {
    mockGetServerSession.mockRejectedValue(new Error("headers() outside a request"));
    const { principal } = await verifyAndMintPrincipal({
      kind: "SESSION",
      sessionHandle: "nextauth:current-request",
    });
    expect(principal).toBeNull();
  });

  it("the minted principal gates the session's own CUSTOMER company in", async () => {
    mockGetServerSession.mockResolvedValue(SESSION);
    const { principal } = await verifyAndMintPrincipal({
      kind: "SESSION",
      sessionHandle: "nextauth:current-request",
    });
    expect(principal).not.toBeNull();
    const access = await gateWorkspaceAccess({
      companyId: "co-session",
      principal,
      companyIdentity: { id: "co-session", tenantKind: "CUSTOMER" },
    });
    expect(access.allowed).toBe(true);
  });

  it("the minted principal does NOT gate another company in (cross-tenant refused)", async () => {
    mockGetServerSession.mockResolvedValue(SESSION);
    const { principal } = await verifyAndMintPrincipal({
      kind: "SESSION",
      sessionHandle: "nextauth:current-request",
    });
    expect(principal).not.toBeNull();
    const access = await gateWorkspaceAccess({
      companyId: "co-other",
      principal,
      companyIdentity: { id: "co-other", tenantKind: "CUSTOMER" },
    });
    expect(access.allowed).toBe(false);
  });
});
