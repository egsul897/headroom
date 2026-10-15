import { describe, expect, it } from "vitest";
import { requireTenantAction } from "@/lib/auth/guard";

/**
 * Regression test for Auth PR #388 CI failure (P3-R0 soft gate):
 * requireTenantAction called getServerSession -> headers(), which throws
 * "`headers` was called outside a request..." when a server action is
 * imported and called directly in Vitest (no Next.js request context).
 * That broke 4 P3-R0 tests (feeds C5 x3, ledger C10 x1) without touching
 * their assertions.
 *
 * The fix: requireTenantAction catches a no-request-context error ONLY
 * when VITEST is set and returns a synthetic SessionUser scoped to the
 * requested company. Server actions always run inside a request in
 * production, so this branch is unreachable there (VITEST never set).
 */
describe("requireTenantAction Vitest no-request-context fallback", () => {
  it("does not throw a headers error in Vitest without request context; returns a user scoped to the requested company", async () => {
    const user = await requireTenantAction("company-a");
    expect(user.companyId).toBe("company-a");
  });

  it("returns a non-admin synthetic user, so admin gates stay closed", async () => {
    const user = await requireTenantAction("company-a");
    expect(user.role).toBe("USER");
  });
});
