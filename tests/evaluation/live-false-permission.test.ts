import { describe, expect, it } from "vitest";
import { probeLiveFalsePermission } from "../../lib/evaluation/ckg-benchmark/live-false-permission";

describe("live false-permission production path", () => {
  it("reports exact adversarial control denominator separately from live path", () => {
    const live = probeLiveFalsePermission();
    expect(live.incidence.evaluated).toBe(2);
    expect(live.adversarialControlNote).toMatch(/1\/2/);
  });

  it("does not emit unsafe false permissions on the live Ask/bridge path for the no-exception prohibition", () => {
    const live = probeLiveFalsePermission();
    const deny = live.outcomes.find((o) => o.caseId === "syn-false-perm-general-prohibition")!;
    expect(deny.shouldDeny).toBe(true);
    expect(deny.falsePermission).toBe(false);
    expect(deny.gateBlocksCustomerExecutable).toBe(true);
    expect(deny.usableByPhase4A).toBe(false);
    expect(deny.permissionAuthority).toBe("DISCOVERY_NON_AUTHORITATIVE");
  });

  it("keeps live false-permission incidence at 0/2 on production path", () => {
    const live = probeLiveFalsePermission();
    expect(live.incidence.failures).toBe(0);
    expect(live.incidence.rate).toBe(0);
  });
});
