import { describe, expect, it } from "vitest";
import { parseDocumentTree } from "@/lib/contract-model/section-tree/parse";
import { covenantChecklist } from "@/lib/contract-model/section-tree/semantics";

const scopes = (text: string) => { const t = parseDocumentTree(text); return covenantChecklist(t, t.text).filter((c) => c.status === "ABSENT_VERIFIED").map((c) => c.absentScope ?? null); };
const body = "\nSection 1.01 Definitions . Capitalized terms used herein have the meanings given in the Original Agreement.\nSection 1.02 Notices . All notices shall be in writing and delivered to the addresses set forth on the signature pages.\n";

describe("document-only absence caveat", () => {
  it("a supplement to a master indenture is a partial document", () => {
    const s = scopes(`FIRST SUPPLEMENTAL MASTER INDENTURE\nAmong the Members of the Obligated Group and the Master Trustee${body}`);
    expect(s.length).toBeGreaterThan(0);
    expect(s.every((x) => x === "DOCUMENT_ONLY_INCORPORATED_BY_REFERENCE")).toBe(true);
  });
  it("the document's own exhibits 'attached hereto ... incorporated herein by reference' are not another instrument", () => {
    const s = scopes(`AMENDED AND RESTATED LIMITED LIABILITY COMPANY AGREEMENT\nThis Agreement (including the appendices, exhibits and schedules attached hereto, which are hereby incorporated herein by reference) is entered into by the Members.${body}`);
    expect(s.length).toBeGreaterThan(0);
    expect(s.every((x) => x === null)).toBe(true);
  });
});
