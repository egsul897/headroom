import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SAMPLE_ADD_BACKS, SAMPLE_EBITDA_BASE } from "@/app/dev/sample/ebitda";
import { EbitdaTile } from "@/components/home/EbitdaTile";

describe("EBITDA panel grid", () => {
  it("lines summary boxes and add-back cards on one grid", () => {
    const html = renderToStaticMarkup(<EbitdaTile base={SAMPLE_EBITDA_BASE} items={SAMPLE_ADD_BACKS} sample />);
    for (const label of ["Base EBITDA", "Confirmed add-backs", "Pro forma EBITDA", "Additional available", "Items needing you"]) {
      expect(html).toContain(label);
    }
    expect(html).toContain("ebitda-summary");
    expect(html).toContain("ebitda-cards");
    expect(html).toContain("Restructuring charges");
    expect(html).toContain("ebitda-card-amount");
    expect(html).toContain("$150,000,000");
    expect(html).toContain("RestructuringCharges");
  });

  it("shows a calm Couldn't compute state with the reason and Retry", () => {
    const html = renderToStaticMarkup(
      <EbitdaTile base={SAMPLE_EBITDA_BASE} items={SAMPLE_ADD_BACKS} sample failedReason="SEC companyfacts 503" />,
    );
    expect(html).toMatch(/Couldn(?:'|&#x27;)t compute/);
    expect(html).toContain("SEC companyfacts 503");
    expect(html).toContain("Retry");
    expect(html).not.toContain("ebitda-cards");
    expect(html).not.toContain("$150,000,000");
  });
});

describe("sign in to confirm", () => {
  it("keeps the figure readable and disables confirm when no session handle is present", () => {
    const html = renderToStaticMarkup(
      <EbitdaTile base={SAMPLE_EBITDA_BASE} items={SAMPLE_ADD_BACKS} sample initialView="a" />,
    );
    expect(html).toContain("$18,000,000");
    expect(html).toContain("Sign in to confirm");
    expect(html).toContain("ebitda-signin-button");
    expect(html).toContain("disabled");
    expect(html).not.toContain("ebitda-inline-error");
    expect(html).not.toContain(">Confirm<");
  });
});
