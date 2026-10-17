import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SAMPLE_ADD_BACKS, SAMPLE_EBITDA_BASE } from "@/app/dev/sample/ebitda";
import { EbitdaTile } from "@/components/home/EbitdaTile";

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
