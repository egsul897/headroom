import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ActionMenu } from "../../components/ActionMenu";
import { Select } from "../../components/Select";
import { StatusBadge } from "../../components/StatusBadge";
import { presentUiStatus } from "../../components/status-presentation";
import { presentCustomerStatus } from "../../lib/customer-workflow/status-contract";

describe("status presentation", () => {
  it("uses the customer-workflow label for NEEDS_INPUT and does not upgrade it", () => {
    const view = presentUiStatus("NEEDS_INPUT");
    expect(view.code).toBe("NEEDS_INPUT");
    expect(view.label).toBe(presentCustomerStatus("NEEDS_INPUT").label);
    expect(view.tone).toBe("attention");
    expect(view.label).not.toMatch(/available/i);
  });

  it("keeps REVIEW_REQUIRED as review, not a pass", () => {
    const view = presentUiStatus("REVIEW_REQUIRED");
    expect(view.code).toBe("REVIEW_REQUIRED");
    expect(view.tone).toBe("attention");
    expect(view.label).toBe("Review required");
  });

  it("does not invent a meaning for an unknown code", () => {
    const view = presentUiStatus("NOT_A_REAL_STATUS_CODE");
    expect(view.code).toBe("NOT_A_REAL_STATUS_CODE");
    expect(view.tone).toBe("unknown");
    expect(view.hint).toMatch(/Unmapped/);
    expect(view.label).toBe("Not a real status code");
  });

  it("renders the plain label and preserves the raw code on the badge", () => {
    const html = renderToStaticMarkup(<StatusBadge status="NEEDS_FINANCIAL_INPUTS" />);
    expect(html).toContain('data-status="NEEDS_FINANCIAL_INPUTS"');
    expect(html).toContain("Needs financial inputs");
    expect(html).toContain("status-badge-attention");
    expect(html).not.toContain(">$0<");
  });
});

describe("select and action menu", () => {
  it("renders a closed listbox trigger and the form value", () => {
    const html = renderToStaticMarkup(
      <Select
        name="declaredType"
        ariaLabel="Declared type"
        defaultValue="CREDIT_AGREEMENT"
        options={[
          { value: "CREDIT_AGREEMENT", label: "Credit Agreement" },
          { value: "INDENTURE", label: "Indenture" },
        ]}
      />,
    );
    expect(html).toContain('aria-haspopup="listbox"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('name="declaredType"');
    expect(html).toContain('value="CREDIT_AGREEMENT"');
    expect(html).toContain("Credit Agreement");
    expect(html).not.toContain("Indenture");
  });

  it("keeps secondary actions behind one menu button", () => {
    const html = renderToStaticMarkup(
      <ActionMenu label="More actions" items={[{ href: "/co/ask", label: "Ask Headroom" }]} />,
    );
    expect(html).toContain('aria-haspopup="menu"');
    expect(html).toContain("More actions");
    expect(html).not.toContain("Ask Headroom");
  });
});
