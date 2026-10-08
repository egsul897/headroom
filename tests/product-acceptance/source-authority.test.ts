/**
 * Independent challenge of operative-source authentication (PR #136, lib/contract-model/compiler/operative-authority.ts).
 *
 * Expected outcomes below were fixed BEFORE reading the implementation's test file and are stated per case; they are
 * independent legal/evidentiary expectations, not a restatement of the module's behaviour. Where the module disagrees
 * the test records the disagreement as a FINDING (it.fails / explicit expectation) rather than adopting the module's
 * answer. The file skips itself when the module is absent (e.g. on main before PR #136 merges), so it can live on the
 * validation branch and be executed inside an integration checkout of the PR head.
 *
 * Run inside a PR #136 checkout:  npx vitest run tests/product-acceptance/source-authority.test.ts
 */
import { describe, expect, it } from "vitest";
import { parseDocumentStructure } from "../../lib/contract-model/compiler/stage-structure";
import { detectStructuralDefinitions } from "../../lib/contract-model/compiler/structural-definitions";
import { buildStructuralIndex, type StructuralIndex } from "../../lib/contract-model/compiler/structural-index";
import { loadPackage } from "../../scripts/product-acceptance/corpus";
import { buildIndex, runDeterministicStages } from "../../scripts/product-acceptance/stages";
import { candidateFor } from "../../scripts/product-acceptance/auditor";

type Authority = typeof import("../../lib/contract-model/compiler/operative-authority");
const AUTHORITY_MODULE = "../../lib/contract-model/compiler/operative-authority";
const authority: Authority | null = await import(/* @vite-ignore */ AUTHORITY_MODULE).then((m) => m as Authority).catch(() => null);

const docId = "challenge-doc";
function indexOf(text: string): StructuralIndex {
  const nodes = parseDocumentStructure({ documentId: docId, label: "challenge", text });
  return buildStructuralIndex(new Map([[docId, { text, nodes }]]), detectStructuralDefinitions(docId, text, nodes), []);
}
const only = (index: StructuralIndex, ref: string) => { const n = index.findNodesByRef(docId, ref); if (n.length !== 1) throw new Error(`${ref}: ${n.length} nodes`); return n[0]!; };

describe.skipIf(!authority)("PR #136 operative-source authentication — independent adversarial cases", () => {
  const A = () => authority!;

  describe("1. missing structural index / 2. missing anchor (bypass paths)", () => {
    it("S1 — no index with a supplied anchor: expected = cannot authenticate (refuse or mark unauthenticated); actual = gate returns null (no block)", () => {
      // Independent expectation: an anchor id that cannot be checked is not evidence. The module deliberately returns
      // null ("raw-text fixtures"). This is recorded as a CONTRACT DISAGREEMENT, not adopted.
      const block = A().operativeModelDispatchBlock({ index: null, anchorNodeId: "structural-node:anything", supersessionStatus: "CURRENT_OPERATIVE" });
      expect(block).toBeNull(); // documents the bypass; see 07-pr136 write-up (finding PR136-F1)
    });
    it("S2 — index present, anchor list empty: expected = unauthenticated dispatch is visible; actual = null (silent pass-through)", () => {
      const index = indexOf("SECTION 7.01 Indebtedness . The Borrower shall not incur any Indebtedness.\n");
      expect(A().operativeModelDispatchBlock({ index, anchorNodeId: null, supersessionStatus: "CURRENT_OPERATIVE" })).toBeNull();
      expect(A().operativeModelDispatchBlock({ index, anchorNodeId: "", supersessionStatus: "CURRENT_OPERATIVE" })).toBeNull();
    });
  });

  describe("3. invalid anchor", () => {
    it("S3 — anchor id not in the index is refused with MISSING_OPERATIVE_AUTHORITY", () => {
      const index = indexOf("SECTION 7.01 Indebtedness . The Borrower shall not incur any Indebtedness.\n");
      const d = A().operativeModelDispatchBlock({ index, anchorNodeId: "structural-node:deadbeef", supersessionStatus: "CURRENT_OPERATIVE" });
      expect(d?.refuseModelDispatch).toBe(true);
      expect(d?.authoritativeCurrent).toBe(false);
      expect(d?.reason).toMatch(/^MISSING_OPERATIVE_AUTHORITY/);
    });
  });

  describe("4. table-of-contents text masquerading as an operative covenant", () => {
    const tocVariants: Array<[string, string]> = [
      ["dot leaders + page", "SECTION 7.01 Indebtedness ..... 62\n"],
      ["spaces + page", "SECTION 7.01 Indebtedness 62\n"],
      ["two columns on one line", "SECTION 7.01 Indebtedness .......... 62   SECTION 7.02 Liens .......... 66\n"],
      ["amount in title", "SECTION 7.01 Indebtedness in Excess of $50,000,000 ..... 62\n"],
      ["lower-case 'section'", "section 7.01 Indebtedness ..... 62\n"],
    ];
    for (const [label, text] of tocVariants) it(`S4 — ${label}: CONTENTS_LISTING, refused, never authoritative`, () => {
      const index = indexOf(`TABLE OF CONTENTS\n\n${text}`);
      const node = only(index, "7.01");
      const d = A().authenticateStructuralOccurrence({ node, index, supersessionStatus: "CURRENT_OPERATIVE" });
      expect(d.structuralKind).toBe("CONTENTS_LISTING");
      expect(d.refuseModelDispatch).toBe(true);
      expect(d.authoritativeCurrent).toBe(false);
    });
    it("S4b — a contents row with no page number (heading-only contents) is still not operative", () => {
      const index = indexOf("TABLE OF CONTENTS\n\nSECTION 7.01 Indebtedness\n");
      const d = A().authenticateStructuralOccurrence({ node: only(index, "7.01"), index, supersessionStatus: "CURRENT_OPERATIVE" });
      expect(d.refuseModelDispatch).toBe(true);
      expect(["CONTENTS_LISTING", "NO_OPERATIVE_EVIDENCE"]).toContain(d.structuralKind);
    });
    it("S4c — a contents row whose title contains a modal verb ('Will', 'Must') is still a contents row (independent expectation); records actual", () => {
      // Independent expectation: "SECTION 7.09 Lenders Will Not Be Liable ..... 80" is a contents row; a modal in a title is
      // not drafting. The module's predicate test runs BEFORE the contents test, so this is expected to be misclassified.
      const index = indexOf("TABLE OF CONTENTS\n\nSECTION 7.09 Lenders Will Not Be Liable ..... 80\n");
      const d = A().authenticateStructuralOccurrence({ node: only(index, "7.09"), index, supersessionStatus: "CURRENT_OPERATIVE" });
      // Record, do not adopt: if the module calls this OPERATIVE it is a false acceptance of a contents line (PR136-F2).
      expect(d.structuralKind === "CONTENTS_LISTING" ? "contents" : `MISCLASSIFIED:${d.structuralKind}:${d.authoritativeCurrent}`).toBe("contents");
    });
    it("S4d — the real package-E TOC lines and operative bodies are separated correctly on the parsed index", async () => {
      const pkg = loadPackage("pkg-e-structural-ambiguity");
      const index = buildIndex(pkg);
      for (const ref of ["7.01", "7.02", "7.06"]) {
        const nodes = index.findNodesByRef("credit-agreement", ref);
        expect(nodes).toHaveLength(2);
        const kinds = nodes.map((n) => A().classifyStructuralOccurrence(n, index));
        expect(kinds.filter((k) => k === "CONTENTS_LISTING")).toHaveLength(1);
        expect(kinds.filter((k) => k === "OPERATIVE_OCCURRENCE")).toHaveLength(1);
        const rows = nodes.map((n, i) => ({ normalizedSourceRef: ref, structuralKind: kinds[i]!, supersessionStatus: "CURRENT_OPERATIVE" as const, sourceHashOk: true, occurrenceId: n.nodeId }));
        expect(A().selectAuthenticatedSectionBodies(rows, [ref])).toHaveLength(1);
      }
    });
  });

  describe("5. genuine operative covenants (must not be refused)", () => {
    const genuine: Array<[string, string, string]> = [
      ["modal prohibition", "SECTION 7.03 Fundamental Changes . The Borrower shall not merge or consolidate with any other Person.\n", "7.03"],
      ["enumerated basket with amount", "SECTION 7.01 Indebtedness . The Borrower shall not incur any Indebtedness, except:\n\n(a) Indebtedness under the Loan Documents;\n\n(b) other Indebtedness in an aggregate principal amount not to exceed $30,000,000 at any time outstanding.\n", "7.01(b)"],
      ["qualitative permission without amount", "SECTION 7.01 Indebtedness . The Borrower shall not incur any Indebtedness, except:\n\n(a) Indebtedness under the Loan Documents;\n\n(b) Indebtedness owed to the Borrower by any Subsidiary.\n", "7.01(a)"],
      ["passive-voice prohibition, no modal (independent expectation: operative)", "SECTION 7.09 Negative Pledge . No Lien on any property of the Borrower is permitted other than Permitted Liens, and no Indebtedness is permitted to be secured by any such Lien.\n", "7.09"],
      ["declarative covenant without modal (independent expectation: operative)", "SECTION 7.10 Lines of Business . The Borrower engages only in the business conducted on the Closing Date and businesses reasonably related thereto.\n", "7.10"],
      ["section whose own text is only a heading, children carry the drafting", "SECTION 7.05 Dispositions .\n\n(a) The Borrower may sell inventory in the ordinary course of business.\n", "7.05"],
    ];
    for (const [label, text, ref] of genuine) it(`S5 — ${label} (${ref})`, () => {
      const index = indexOf(`ARTICLE VII NEGATIVE COVENANTS\n\n${text}`);
      const d = A().authenticateStructuralOccurrence({ node: only(index, ref), index, supersessionStatus: "CURRENT_OPERATIVE" });
      expect(`${d.structuralKind}/${d.refuseModelDispatch}`).toBe("OPERATIVE_OCCURRENCE/false");
      expect(d.authoritativeCurrent).toBe(true);
    });
  });

  describe("6. definitions required for interpretation", () => {
    it("S6 — a definitions section is operative evidence and is not refused", () => {
      const index = indexOf("ARTICLE I DEFINITIONS\n\nSECTION 1.01 Defined Terms . As used in this Agreement, the following terms have the meanings specified below:\n\n\"Consolidated EBITDA\" means, for any period, Consolidated Net Income for such period plus Interest Expense.\n\n\"Indebtedness\" means, as to any Person, all obligations of such Person for borrowed money.\n");
      const d = A().authenticateStructuralOccurrence({ node: only(index, "1.01"), index, supersessionStatus: "CURRENT_OPERATIVE" });
      expect(d.structuralKind).toBe("OPERATIVE_OCCURRENCE");
      expect(d.refuseModelDispatch).toBe(false);
    });
    it("S6b — an exhibit 'Term: …' summary is NOT a definitions span (independent expectation); records actual", () => {
      // The exhibit disclaims operative effect. The module's definition grammar admits unquoted colon declarations, so
      // this is expected to be admitted as OPERATIVE — recorded as PR136-F3 if so.
      const text = "EXHIBIT A — SUMMARY OF PRINCIPAL TERMS\n\nSECTION 1. Summary . This summary is for convenience of reference only and is not an operative provision.\n\nIndebtedness: the Borrower may incur Indebtedness in an aggregate principal amount of up to $100,000,000 at any time outstanding.\n";
      const index = indexOf(text);
      const d = A().authenticateStructuralOccurrence({ node: only(index, "1"), index, supersessionStatus: "CURRENT_OPERATIVE" });
      expect(d.structuralKind === "OPERATIVE_OCCURRENCE" ? "ADMITTED_AS_OPERATIVE" : d.structuralKind).toBe("NO_OPERATIVE_EVIDENCE");
    });
  });

  describe("7. cross-reference-only context", () => {
    it("S7 — a pure pointer clause ('the foregoing clause (b)') is not operative", () => {
      const index = indexOf("SECTION 7.02 Liens . The Borrower shall not create any Lien, except:\n\n(a) Liens for taxes not yet due;\n\n(b) the foregoing clause (a) as applied to Subsidiaries.\n");
      const d = A().authenticateStructuralOccurrence({ node: only(index, "7.02(b)"), index, supersessionStatus: "CURRENT_OPERATIVE" });
      expect(d.structuralKind).toBe("NO_OPERATIVE_EVIDENCE");
      expect(d.refuseModelDispatch).toBe(true);
    });
    it("S7b — a clause that incorporates a schedule ('as set forth on Schedule 7.02') is operative with a missing dependency, not 'no evidence' (independent expectation); records actual", () => {
      const index = indexOf("SECTION 7.02 Liens . The Borrower shall not create any Lien, except:\n\n(a) Liens for taxes not yet due;\n\n(b) as set forth on Schedule 7.02.\n");
      const d = A().authenticateStructuralOccurrence({ node: only(index, "7.02(b)"), index, supersessionStatus: "CURRENT_OPERATIVE" });
      expect(d.structuralKind === "NO_OPERATIVE_EVIDENCE" ? "REFUSED_AS_NO_EVIDENCE" : d.structuralKind).toBe("OPERATIVE_OCCURRENCE");
    });
    it("S7c — a clause that only cross-references another permission ('Liens securing Indebtedness permitted under Section 7.01(b)') is operative", () => {
      const index = indexOf("SECTION 7.02 Liens . The Borrower shall not create any Lien, except:\n\n(a) Liens for taxes not yet due;\n\n(b) Liens securing Indebtedness permitted under Section 7.01(b).\n");
      const d = A().authenticateStructuralOccurrence({ node: only(index, "7.02(b)"), index, supersessionStatus: "CURRENT_OPERATIVE" });
      expect(d.structuralKind).toBe("OPERATIVE_OCCURRENCE");
    });
  });

  describe("8. ambiguous source authority (duplicate operative bodies)", () => {
    it("S8 — two operative SECTION 7.01 bodies: selection refuses both; per-anchor dispatch still admits each (recorded)", () => {
      const pkg = loadPackage("pkg-g-adversarial-evidence");
      const index = buildIndex(pkg);
      const nodes = index.findNodesByRef("credit-agreement", "7.01");
      expect(nodes).toHaveLength(2);
      const decisions = nodes.map((n) => A().authenticateStructuralOccurrence({ node: n, index, supersessionStatus: "CURRENT_OPERATIVE" }));
      expect(decisions.every((d) => d.structuralKind === "OPERATIVE_OCCURRENCE")).toBe(true);
      expect(A().selectAuthenticatedSectionBodies(decisions.map((d, i) => ({ normalizedSourceRef: "7.01", structuralKind: d.structuralKind, supersessionStatus: d.supersessionStatus, sourceHashOk: true, occurrenceId: nodes[i]!.nodeId })), ["7.01"])).toEqual([]);
      // the production compile gate authenticates ONE anchor; it has no view of the sibling occurrence
      for (const n of nodes) expect(A().operativeModelDispatchBlock({ index, anchorNodeId: n.nodeId, supersessionStatus: "CURRENT_OPERATIVE" })?.refuseModelDispatch).toBe(false);
    });
  });

  describe("9. superseded amendment language (package C, real operative state)", () => {
    it("S9 — the superseded base 7.01(b) node is refused as a base span and admitted only as operative-state current text; the deleted 7.01(e) is refused; the PARENT 7.01 (stale descendants) is still admitted as CURRENT (recorded, = IPV-04)", async () => {
      const pkg = loadPackage("pkg-c-amendment-supersession");
      const s = await runDeterministicStages(pkg);
      const asOf = "2026-06-30";
      const sup = s.supersessionIndexes.get(asOf)!;
      const { getNodeSupersessionStatus } = await import("../../lib/contract-model/compiler/amendment/operative-state");
      const status = (ref: string) => { const n = s.index.findNodesByRef("credit-agreement", ref)[0]!; return { node: n, status: getNodeSupersessionStatus(sup, "credit-agreement", n.nodeId).status }; };
      const b = status("7.01(b)"), e = status("7.01(e)"), parent = status("7.01");
      expect(b.status).toBe("KNOWN_SUPERSEDED");
      expect(e.status).toBe("KNOWN_SUPERSEDED");
      const bBase = A().authenticateStructuralOccurrence({ node: b.node, index: s.index, supersessionStatus: b.status });
      expect(bBase.refuseModelDispatch).toBe(true);
      const bCurrent = A().authenticateStructuralOccurrence({ node: b.node, index: s.index, supersessionStatus: b.status, resolvedCurrentText: true });
      expect(bCurrent.refuseModelDispatch).toBe(false);
      expect(bCurrent.authoritativeCurrent).toBe(false); // amended text is current, but the gate cannot call a KNOWN_SUPERSEDED node "authoritative current"
      const eBase = A().authenticateStructuralOccurrence({ node: e.node, index: s.index, supersessionStatus: e.status });
      expect(eBase.refuseModelDispatch).toBe(true);
      // the parent section: its own node is CURRENT while its DESCENDANTS span (what gets hashed and dispatched) contains the superseded $25m and the deleted $15m
      expect(parent.status).toBe("CURRENT_OPERATIVE");
      const p = A().authenticateStructuralOccurrence({ node: parent.node, index: s.index, supersessionStatus: parent.status });
      expect(s.index.getNodeText(parent.node.nodeId, "DESCENDANTS")).toContain("$25,000,000");
      expect(p.authoritativeCurrent === true ? "STALE_DESCENDANTS_ADMITTED_AS_CURRENT" : "refused").toBe("refused"); // PR136-F4 (= IPV-04)
    });
  });

  describe("10. nested and duplicated structural nodes", () => {
    it("S10 — a synthetic clause minted from an inline definition enumeration (package H 1.01(ii)(B)) is admitted as operative (recorded: it is a definitions fragment, not a covenant)", () => {
      const pkg = loadPackage("pkg-h-unseen-composition");
      const index = buildIndex(pkg);
      const n = index.findNodesByRef("abl-credit-agreement", "1.01(ii)(B)");
      expect(n).toHaveLength(1);
      const d = A().authenticateStructuralOccurrence({ node: n[0]!, index, supersessionStatus: "CURRENT_OPERATIVE" });
      expect(d.structuralKind).toBe("OPERATIVE_OCCURRENCE"); // admitted; the harm is upstream (IPV-06), the gate cannot know
    });
    it("S10b — four-level nesting (package E 7.01(b)(ii)(A)) is operative and unique", () => {
      const pkg = loadPackage("pkg-e-structural-ambiguity");
      const index = buildIndex(pkg);
      const n = index.findNodesByRef("credit-agreement", "7.01(b)(ii)(A)");
      expect(n).toHaveLength(1);
      expect(A().classifyStructuralOccurrence(n[0]!, index)).toBe("OPERATIVE_OCCURRENCE");
    });
    it("S10c — the hash check refuses a dispatch whose caller-authenticated hash differs, and no production caller supplies a hash (recorded)", () => {
      const index = indexOf("SECTION 7.03 Fundamental Changes . The Borrower shall not merge.\n");
      const node = only(index, "7.03");
      const good = A().sha256Utf8(index.getNodeText(node.nodeId, "DESCENDANTS"));
      expect(A().authenticateStructuralOccurrence({ node, index, supersessionStatus: "CURRENT_OPERATIVE", expectedSha256: good }).refuseModelDispatch).toBe(false);
      expect(A().authenticateStructuralOccurrence({ node, index, supersessionStatus: "CURRENT_OPERATIVE", expectedSha256: "f".repeat(64) }).reason).toMatch(/^SOURCE_HASH_MISMATCH/);
    });
  });

  describe("integration: the certified compile gate over the acceptance corpus (mocked model, PR #136 lib)", () => {
    it("S11 — package E TOC occurrences are refused by the gate before any model call; operative occurrences are not", async () => {
      const { runSemanticStage } = await import("../../scripts/product-acceptance/semantic-stage");
      const pkg = loadPackage("pkg-e-structural-ambiguity");
      const s = await runDeterministicStages(pkg);
      const r = await runSemanticStage(pkg, s);
      const byKey = new Map(r.faithful!.results.map((x) => [String(x.candidate.description), x]));
      for (const key of ["credit-agreement::7.01#1", "credit-agreement::7.02#1", "credit-agreement::7.06#1"]) {
        const res = byKey.get(key)!;
        expect(res.compilation?.failureReasons, key).toContain("OPERATIVE_AUTHORITY_REFUSED");
      }
      for (const key of ["credit-agreement::7.01#2", "credit-agreement::7.02#2", "credit-agreement::7.06#2"]) {
        const res = byKey.get(key)!;
        expect(res.compilation?.failureReasons ?? [], key).not.toContain("OPERATIVE_AUTHORITY_REFUSED");
      }
    });
  });
});
