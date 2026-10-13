import { describe, expect, it } from "vitest";
import {
  findDashboardMetric,
  type DebtIntelligenceDashboard,
} from "../../lib/product/customer-intelligence/debt-intelligence";
import { computeContractualCovenantMetrics } from "../../lib/product/contractual-computation";
import { COHERENT_DATA } from "../../prisma/seed-data";
import type { CovenantProvisionInput, FinancialSnapshotInput } from "../../lib/covenant-engine";

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
      baskets: [
        {
          metricId: "basket:ratio-capacity:ca_leverage_cap",
          drilldown: {
            metricId: "basket:ratio-capacity:ca_leverage_cap",
            title: "ratio debt capacity",
            module: "BASKETS",
          },
        },
      ],
      monitoring: [],
      transactions: [],
      contractualComputation: null,
      crossDomainScenarios: [],
    } as unknown as DebtIntelligenceDashboard;

    expect(findDashboardMetric(stub, "capital:facility:1")?.title).toBe("RCF");
    expect(findDashboardMetric(stub, "ratio:0:total-leverage")?.module).toBe("RATIOS");
    expect(findDashboardMetric(stub, "basket:ratio-capacity:ca_leverage_cap")?.module).toBe("BASKETS");
    expect(findDashboardMetric(stub, "missing")).toBeNull();
  });

  it("Coherent contractual computation produces dashboard-ready ratio capacity figures", () => {
    const result = computeContractualCovenantMetrics({
      financials: COHERENT_DATA.financials as FinancialSnapshotInput,
      provisions: COHERENT_DATA.provisions as CovenantProvisionInput[],
    });
    expect(result.contractualEbitda).toBe(1700);
    const room = result.ratioTests.find((r) => r.provisionCode === "ca_leverage_cap");
    expect(room?.ratioDebtCapacityMillions).toBeCloseTo(5129, 6);
  });
});
