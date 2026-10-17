import { describe, expect, it } from "vitest";
import { companyNavItems } from "../../lib/home/nav";
import {
  activePrimaryKey,
  commandPaletteLinks,
  contextTabs,
  primarySidebarLinks,
  setupPrompt,
} from "../../components/shell/nav-model";

describe("workspace shell navigation", () => {
  it("shows five primary destinations and keeps every existing route in the palette", () => {
    expect(primarySidebarLinks("co", "ACTIVE").map((link) => link.label)).toEqual([
      "Overview",
      "Covenants",
      "Capacity",
      "Simulate",
      "Ask",
    ]);
    const paletteHrefs = commandPaletteLinks("co", "ACTIVE").map((link) => link.href);
    for (const item of companyNavItems("co", "ACTIVE")) {
      expect(paletteHrefs).toContain(item.href);
    }
    expect(paletteHrefs).toContain("/co/capacity");
    expect(paletteHrefs).toContain("/co/tools");
    expect(paletteHrefs).toContain("/");
    expect(setupPrompt("co", "ACTIVE")).toBeNull();
  });

  it("keeps onboarding reachable while setup remains, outside the primary five", () => {
    const primary = primarySidebarLinks("co", "ONBOARDING").map((link) => link.label);
    expect(primary).not.toContain("Onboarding");
    expect(primary).not.toContain("Finish setup");
    expect(setupPrompt("co", "ONBOARDING")).toEqual({
      key: "onboarding",
      href: "/co/onboarding",
      label: "Finish setup",
      group: "Set up",
    });
    expect(commandPaletteLinks("co", "ONBOARDING").some((link) => link.href === "/co/onboarding" && link.label === "Onboarding")).toBe(true);
  });

  it("highlights the parent section and offers only the tabs for that section", () => {
    expect(activePrimaryKey("/co", "co")).toBe("home");
    expect(activePrimaryKey("/co/rulebook", "co")).toBe("covenants");
    expect(activePrimaryKey("/co/ledger", "co")).toBe("capacity");
    expect(activePrimaryKey("/co/documents", "co")).toBeNull();
    expect(contextTabs("/co", "co")).toBeNull();
    expect(contextTabs("/co/intelligence", "co")?.map((tab) => tab.label)).toEqual(["Covenants", "Rulebook", "Intelligence"]);
    expect(contextTabs("/co/capacity", "co")?.map((tab) => tab.href)).toEqual([
      "/co/capacity",
      "/co/ledger",
      "/co/certificates",
    ]);
  });
});
