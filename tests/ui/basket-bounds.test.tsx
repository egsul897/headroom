import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SAMPLE_COVENANT_DATA } from "@/app/dev/sample/simulate-fixture";
import { boundText, DebtBasketBoard } from "@/components/simulate/DebtBasketBoard";
import { computeCovenantPosition } from "@/lib/covenant-engine";

describe("basket bound and invalid allocations", () => {
  it("shows at least for a missing dollar floor and blocks the result on a negative allocation", () => {
    const html = renderToStaticMarkup(
      <DebtBasketBoard
        data={SAMPLE_COVENANT_DATA}
        position={computeCovenantPosition(SAMPLE_COVENANT_DATA)}
        initial={{
          mode: "combined",
          INCREMENTAL: { secured: -10, unsecured: 50 },
          GENERAL: { secured: 80, unsecured: 40 },
          RATIO_DEBT: { secured: 60, unsecured: 25 },
        }}
      />,
    );
    expect(html).toContain("at least $");
    expect(html).toContain("INCREMENTAL amount is negative");
    expect(html).not.toContain("Total net leverage");
    expect(html).toContain("$645M");
  });

  it("renders each capacity bound in the words the screen uses", () => {
    expect(boundText("EXACT", 645)).toBe("$645M");
    expect(boundText("AT_LEAST", 130)).toBe("at least $130M");
    expect(boundText("UNLIMITED", undefined)).toBe("No cap");
  });
});
