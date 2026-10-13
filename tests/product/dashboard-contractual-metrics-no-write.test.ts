/**
 * P0 — Dashboard GET/render must never mutate calculation, approval,
 * certificate, or financial records (no Neon / customer DB writes).
 */

import { readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  computeContractualMetricsForCompany,
  loadContractualMetricsForDashboard,
} from "@/lib/product/contractual-metrics/service";
import * as persistMod from "@/lib/product/contractual-metrics/persist";
import { toContractualMetricsView } from "@/lib/product/contractual-metrics/serialize";
import { resolveEffectiveEvidenceAuthority } from "@/lib/product/financial-metric-resolver";

const DASHBOARD_PAGE = join(process.cwd(), "app/[companyId]/dashboard/page.tsx");

describe("Dashboard contractual metrics — no-write GET path", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("dashboard page source uses read-only loader and never persist:true", () => {
    const src = readFileSync(DASHBOARD_PAGE, "utf8");
    expect(src).toMatch(/loadContractualMetricsForDashboard/);
    expect(src).not.toMatch(/persist:\s*true/);
    expect(src).not.toMatch(/allowNeonWrite:\s*true/);
    expect(src).not.toMatch(/from \"@\/lib\/prisma\"/);
  });

  it("loadContractualMetricsForDashboard never calls persist helpers", async () => {
    const defSpy = vi.spyOn(persistMod, "persistContractualDefinition").mockResolvedValue({
      persisted: true,
      note: "should-not-run",
    });
    const calcSpy = vi.spyOn(persistMod, "persistCalculationResult").mockResolvedValue({
      persisted: true,
      note: "should-not-run",
    });

    const bundle = await loadContractualMetricsForDashboard("matthews");
    expect(bundle.consolidatedEbitda?.status).toBe("CALCULATED");
    expect(defSpy).not.toHaveBeenCalled();
    expect(calcSpy).not.toHaveBeenCalled();
    expect(bundle.metrics.every((m) => m.persisted === false || m.persistNote.includes("not requested") || m.persistNote === "n/a" || !m.persisted)).toBe(
      true,
    );
  });

  it("persist:true without allowNeonWrite throws (blocks accidental GET writes)", async () => {
    await expect(
      computeContractualMetricsForCompany({} as never, "matthews", { persist: true }),
    ).rejects.toThrow(/allowNeonWrite/);
    await expect(
      computeContractualMetricsForCompany({} as never, "matthews", {
        persist: true,
        allowNeonWrite: false,
      }),
    ).rejects.toThrow(/allowNeonWrite/);
  });

  it("provisional contractual views are labeled provisional for headline/panel", async () => {
    const bundle = await loadContractualMetricsForDashboard("matthews");
    const view = toContractualMetricsView(bundle);
    expect(view.metrics.length).toBeGreaterThan(0);
    expect(view.metrics.every((m) => m.isProvisional)).toBe(true);
    expect(
      view.metrics.every(
        (m) => m.authorityLabel === "DEFINITION_EXECUTED_PROVISIONAL" || m.authorityLabel === "NOT_CALCULATED",
      ),
    ).toBe(true);
  });
});

describe("forceEvidenceAuthority cannot promote", () => {
  it("refuses APPROVED over provisional or synthetic package authority", () => {
    expect(
      resolveEffectiveEvidenceAuthority("PROVISIONAL_RECONSTRUCTION", "APPROVED_SNAPSHOT"),
    ).toEqual({ authority: "PROVISIONAL_RECONSTRUCTION", refusedPromotion: true });
    expect(resolveEffectiveEvidenceAuthority("SYNTHETIC_LABELED", "APPROVED_SNAPSHOT")).toEqual({
      authority: "SYNTHETIC_LABELED",
      refusedPromotion: true,
    });
    expect(resolveEffectiveEvidenceAuthority("SYNTHETIC_LABELED", "PROVISIONAL_RECONSTRUCTION")).toEqual({
      authority: "SYNTHETIC_LABELED",
      refusedPromotion: true,
    });
    // Demotion allowed
    expect(resolveEffectiveEvidenceAuthority("PROVISIONAL_RECONSTRUCTION", "NONE")).toEqual({
      authority: "NONE",
      refusedPromotion: false,
    });
  });
});
