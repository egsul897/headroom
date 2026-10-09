import { describe, expect, it } from "vitest";
import {
  findDashboardMetric,
  type DebtIntelligenceDashboard,
} from "../../lib/product/customer-intelligence/debt-intelligence";

describe("debt intelligence dashboard model", () => {
  it("findDashboardMetric resolves nested drilldowns", () => {
    const stub = {
      capitalStructure: {
        instruments: [
          {
            metricId: "capital:facility:1",
            drilldown: { metricId: "capital:facility:1", title: "RCF", module: "CAPITAL" },
          },
        ],
      },
      ratios: [{ metricId: "ratio:0:total-leverage", drilldown: { metricId: "ratio:0:total-leverage", title: "Total leverage", module: "RATIOS" } }],
      baskets: [],
      monitoring: [],
      transactions: [],
    } as unknown as DebtIntelligenceDashboard;

    expect(findDashboardMetric(stub, "capital:facility:1")?.title).toBe("RCF");
    expect(findDashboardMetric(stub, "ratio:0:total-leverage")?.module).toBe("RATIOS");
    expect(findDashboardMetric(stub, "missing")).toBeNull();
  });
});
