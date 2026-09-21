import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import {
  buildCorpus,
  buildRepairs,
  buildFinalResults,
  buildAffectedManifest,
  ALL_ADJUDICATIONS,
  FROZEN_FILES,
  BENCHMARK_VERSION,
} from "../../scripts/v3-1-1/build-artifacts";
import { locateOperativeSection } from "../../scripts/v3-1-1/source-locator";
import { toBinarySurfacing } from "../../scripts/v3-1-1/adjudication-types";
import { CASE_ROOT_CAUSES } from "../../scripts/v3-1-1/defect-backlog";

const ROOT = process.cwd();
const readJson = (p: string) => JSON.parse(fs.readFileSync(path.join(ROOT, p), "utf8"));
const sha256 = (s: string | Buffer) => crypto.createHash("sha256").update(s).digest("hex");

const FROZEN_PACKET = readJson("docs/phase-3-final-closure-resolution/review-packets/R1.json");

/**
 * §15 — the sixteen deterministic assertions the mission requires, plus the §4 check that
 * a source resolver must not treat the first occurrence of "Section X" as Section X.
 */
describe("V3.1.1 corrected benchmark reconciliation", () => {
  it("1. contains exactly 47 corrected cases", () => {
    const { cases } = buildCorpus();
    expect(cases).toHaveLength(47);
    expect(new Set(cases.map((c: any) => c.caseId)).size).toBe(47);
  });

  it("2. keeps every case ID stable against the frozen benchmark", () => {
    const { cases } = buildCorpus();
    const corrected = cases.map((c: any) => c.caseId).sort();
    const frozen = FROZEN_PACKET.cases.map((c: any) => c.caseId).sort();
    expect(corrected).toEqual(frozen);
    expect(cases.every((c: any) => c.benchmarkVersion === BENCHMARK_VERSION)).toBe(true);
  });

  it("3. carries the four known benchmark corrections", () => {
    const { cases } = buildCorpus();
    const corrected = cases.filter((c: any) => c.benchmarkIntegrityStatus === "CORRECTED_FROM_PRIMARY_SOURCE");
    const ids = corrected.map((c: any) => c.caseId).sort();
    for (const id of ["CASE-e3520246bd", "CASE-9001417020", "CASE-a898053843", "CASE-1284ab8e71"]) {
      expect(ids).toContain(id);
    }
    // every correction preserves the superseded text rather than overwriting it
    for (const c of corrected) {
      expect(typeof c.correctionProvenance.supersededClaimText).toBe("string");
      expect(c.correctionProvenance.supersededClaimText.length).toBeGreaterThan(0);
    }
  });

  it("4. CASE-e3520246bd now requires that no Event of Default exists", () => {
    const c = buildCorpus().cases.find((x: any) => x.caseId === "CASE-e3520246bd")!;
    expect(c.correctedGroundTruthClaim).toMatch(/no Event of Default exists/);
    expect(c.correctedGroundTruthClaim).not.toMatch(/no default condition attached/);
    expect(c.propositions.some((p: any) => /no Event of Default exists/.test(p.proposition))).toBe(true);
    // the superseded error is preserved, not deleted
    expect(c.correctionProvenance.supersededClaimText).toMatch(/no default condition attached/);
  });

  it("5. CASE-9001417020 now requires that no Event of Default exists", () => {
    const c = buildCorpus().cases.find((x: any) => x.caseId === "CASE-9001417020")!;
    expect(c.correctedGroundTruthClaim).toMatch(/so long as no Event of Default exists/);
    expect(c.propositions.some((p: any) => /no Event of Default exists/.test(p.proposition))).toBe(true);
  });

  it("6. CASE-a898053843 no longer narrows the whole basket to ABL Priority Collateral", () => {
    const c = buildCorpus().cases.find((x: any) => x.caseId === "CASE-a898053843")!;
    expect(c.correctedGroundTruthClaim).toMatch(/dispose of any of its other assets/i);
    expect(c.correctedGroundTruthClaim).toMatch(/to the extent the disposition involves ABL Priority Collateral/i);
    expect(c.correctedGroundTruthClaim).not.toMatch(/permitted only if .{0,40}ABL Priority Collateral/i);
    // the conditional branch is its own proposition and is not promoted to basket scope
    const branch = c.propositions.find((p: any) => /to the extent the disposition involves ABL Priority Collateral/i.test(p.proposition));
    expect(branch).toBeDefined();
    expect(branch.proposition).toMatch(/conditional branch, not the scope of the basket/i);
    // the five separately-represented elements §3 requires
    expect(c.propositions).toHaveLength(5);
  });

  it("7. CASE-1284ab8e71 carries the omitted carve-out and the anti-stacking proviso", () => {
    const c = buildCorpus().cases.find((x: any) => x.caseId === "CASE-1284ab8e71")!;
    expect(c.correctedGroundTruthClaim).toMatch(/payments in respect of the Secured Obligations/);
    expect(c.correctedGroundTruthClaim).toMatch(/available only where no other clause of Section 6\.08\(a\) would permit/);
    const antiStacking = c.propositions.find((p: any) => /Anti-stacking proviso/i.test(p.proposition));
    expect(antiStacking).toBeDefined();
    expect(antiStacking.sourceQuotation).toMatch(/would not, at the time thereof, be permitted/);
    // six carve-outs plus the chapeau, the proviso and the 6.08(b) amendment restriction
    expect(c.propositions).toHaveLength(9);
  });

  it("8. every repaired excerpt comes from the operative provision, and the first textual match does not", () => {
    const repairs = buildRepairs();
    expect(repairs.length).toBeGreaterThanOrEqual(9);
    for (const r of repairs) {
      expect(r.repairedExcerpt.insideOperativeSpan).toBe(true);
      expect(r.repairedExcerpt.length).toBeGreaterThan(0);

      if (r.caseId === "CASE-4a1c6a48a0") {
        // The one repair of a different shape: the frozen excerpt WAS inside the operative
        // span, at its very start, and still failed to carry the claimed provision because
        // the claim is about a flush paragraph thousands of characters further in. Span
        // containment alone would have passed this case; claim support is what catches it.
        expect(r.frozenExcerpt.insideOperativeSpan).toBe(true);
        expect(r.firstOccurrenceIsNotTheOperativeSection.distinct).toBe(false);
        expect(r.repairedExcerpt.offsetInSource - r.operativeSpan.start).toBeGreaterThan(6_000);
        expect(r.frozenExcerpt.offsetInSource + r.frozenExcerpt.length).toBeLessThan(r.repairedExcerpt.offsetInSource);
        expect(r.repairedExcerpt.text).toMatch(/shall be deemed\s*\n?to continue to have a permanent/);
      } else {
        // The other ten: the frozen excerpt sat outside the operative provision entirely.
        expect(r.frozenExcerpt.insideOperativeSpan).toBe(false);
        expect(r.firstOccurrenceIsNotTheOperativeSection.distinct).toBe(true);
        expect(r.firstOccurrenceIsNotTheOperativeSection.distanceChars).toBeGreaterThan(1_000);
      }
    }
    // the nine the audit named, plus the two this mission added
    const ids = repairs.map((r) => r.caseId);
    for (const id of [
      "CASE-2aa00d5566", "CASE-5a66cad386", "CASE-3e2b123d74", "CASE-393f8732d2", "CASE-b9ca777174",
      "CASE-4a1c6a48a0", "CASE-e555117f4c", "CASE-88cfbb3bb8", "CASE-8c29f13dc0",
      "CASE-5c33066800", "CASE-768547a920",
    ]) {
      expect(ids).toContain(id);
    }
  });

  it("8b. a source resolver must not treat the first occurrence of a section number as that section", () => {
    const text = fs.readFileSync(
      path.join(ROOT, "tests/fixtures/unseen-packages/dsgr-2022-2025-credit-facility/extracted-text/doc-a-2022-amended-restated-credit-agreement.txt"),
      "utf8",
    );
    const firstTextualMatch = text.indexOf("Section 6.01");
    const operative = locateOperativeSection(text, "6.01")!;
    expect(firstTextualMatch).toBeGreaterThan(-1);
    expect(operative.start).not.toBe(firstTextualMatch);
    // the first match sits inside Article I, hundreds of thousands of characters away
    expect(operative.start - firstTextualMatch).toBeGreaterThan(100_000);
    // and the operative span really does carry the provision's own words
    expect(text.slice(operative.start, operative.end)).toMatch(/No Loan Party\s+will, nor will it permit any Restricted Subsidiary to, create, incur, assume or suffer to exist any Indebtedness/);
    // every table-of-contents candidate was rejected on extent, not on position
    expect(operative.candidates.some((c) => c.disposition === "TABLE_OF_CONTENTS_OR_STUB")).toBe(true);
  });

  it("9. leaves the frozen benchmark artifacts byte-identical", () => {
    const expected = readJson("docs/phase-3-v3.1-final-reconciliation/01-starting-state.json").frozenFileHashes;
    for (const f of FROZEN_FILES) {
      expect(sha256(fs.readFileSync(path.join(ROOT, f)))).toBe(expected[f]);
    }
  });

  it("10. leaves the frozen reviewer-side artifacts byte-identical", () => {
    const expected = readJson("docs/phase-3-v3.1-final-reconciliation/01-starting-state.json").frozenFileHashes;
    const reviewerArtifacts = FROZEN_FILES.filter((f) => /review-packets|adjudicator|validation-packets|consensus|historical-adjudication/.test(f));
    expect(reviewerArtifacts.length).toBeGreaterThanOrEqual(8);
    for (const f of reviewerArtifacts) {
      expect(sha256(fs.readFileSync(path.join(ROOT, f)))).toBe(expected[f]);
    }
  });

  it("11. every CREDIT cites a qualifying SUBSTANTIVE_REPRESENTATION for each material proposition", () => {
    const packet = FROZEN_PACKET;
    const roleOf = (caseId: string, candidateId: string) =>
      packet.cases.find((c: any) => c.caseId === caseId)?.systemOutput.find((s: any) => s.candidateId === candidateId)?.accountingRole;

    const credits = ALL_ADJUDICATIONS.filter((a) => a.credit === "CREDIT");
    expect(credits.length).toBeGreaterThan(0);
    for (const a of credits) {
      const material = a.propositions.filter((p) => p.independence === "MATERIAL_INDEPENDENT");
      expect(material.length).toBeGreaterThan(0);
      for (const p of material) {
        expect(p.representedBy, `${a.caseId} ${p.id}`).not.toBeNull();
        expect(roleOf(a.caseId, p.representedBy!), `${a.caseId} ${p.id}`).toBe("SUBSTANTIVE_REPRESENTATION");
      }
    }
  });

  it("12. no INVENTORY_ONLY or HONEST_UNRESOLVED candidate ever supplies a represented atom", () => {
    const packet = FROZEN_PACKET;
    const roleOf = (caseId: string, candidateId: string) =>
      packet.cases.find((c: any) => c.caseId === caseId)?.systemOutput.find((s: any) => s.candidateId === candidateId)?.accountingRole;

    for (const a of ALL_ADJUDICATIONS) {
      for (const p of a.propositions) {
        if (!p.representedBy) continue;
        const role = roleOf(a.caseId, p.representedBy);
        expect(role, `${a.caseId} ${p.id} representedBy ${p.representedBy}`).toBe("SUBSTANTIVE_REPRESENTATION");
        expect(role).not.toBe("INVENTORY_ONLY");
        expect(role).not.toBe("HONEST_UNRESOLVED");
      }
    }
  });

  it("13. every PARTIALLY_SURFACED case has at least one surfaced and one unsurfaced material gap atom", () => {
    const partial = ALL_ADJUDICATIONS.filter((a) => a.compositeSurfacing === "PARTIALLY_SURFACED");
    expect(partial.length).toBeGreaterThan(0);
    for (const a of partial) {
      const gap = a.propositions.filter((p) => p.independence === "MATERIAL_INDEPENDENT" && p.representedBy === null);
      const surfaced = gap.filter((p) => p.surfacedBy.length > 0);
      const unsurfaced = gap.filter((p) => p.surfacedBy.length === 0);
      expect(surfaced.length, `${a.caseId} surfaced gap atoms`).toBeGreaterThanOrEqual(1);
      expect(unsurfaced.length, `${a.caseId} unsurfaced gap atoms`).toBeGreaterThanOrEqual(1);
    }

    // and the converse holds for the other two states
    for (const a of ALL_ADJUDICATIONS.filter((x) => x.compositeSurfacing === "FULLY_SURFACED")) {
      const gap = a.propositions.filter((p) => p.independence === "MATERIAL_INDEPENDENT" && p.representedBy === null);
      expect(gap.every((p) => p.surfacedBy.length > 0), `${a.caseId} all gap atoms surfaced`).toBe(true);
    }
    for (const a of ALL_ADJUDICATIONS.filter((x) => x.compositeSurfacing === "NOT_SPECIFICALLY_SURFACED")) {
      const gap = a.propositions.filter((p) => p.independence === "MATERIAL_INDEPENDENT" && p.representedBy === null);
      expect(gap.every((p) => p.surfacedBy.length === 0), `${a.caseId} no gap atom surfaced`).toBe(true);
    }
  });

  it("14. contains no vague synthetic atoms and every atom carries a source quotation", () => {
    // §8's prohibition, plus the placeholder forms that make a proposition unreadable on
    // its own: a proposition must not point at another case, another proposition, or a
    // continuation of the sentence before it.
    const banned = [
      /remaining material component/i,
      /rest of (the )?claim/i,
      /other elements/i,
      /etc\.?$/i,
      /and so on/i,
      /^same\b/i,
      /^and\b/i,
      /^likewise\b/i,
      /\blikewise$/i,
      /^distinct from\b/i,
    ];
    const { cases } = buildCorpus();
    for (const c of cases) {
      for (const p of c.propositions) {
        for (const re of banned) {
          expect(re.test(p.proposition), `${c.caseId} ${p.id}: ${p.proposition}`).toBe(false);
        }
        // A proposition must be a self-contained statement. Six authoring shorthands in
        // the frozen audit ("same lead-in", "likewise", "and the Payment Conditions are
        // satisfied", ...) are restated from the same source in
        // scripts/v3-1-1/proposition-restatements.ts without changing their meaning.
        expect(p.proposition.length, `${c.caseId} ${p.id}: ${p.proposition}`).toBeGreaterThan(25);
        expect(String(p.sourceQuotation ?? "").length, `${c.caseId} ${p.id}`).toBeGreaterThan(0);
      }
    }
  });

  it("15. every aggregate count reproduces from the case-level decisions", () => {
    const { rows, counts } = buildFinalResults();
    expect(rows).toHaveLength(47);

    const credit = rows.filter((r: any) => r.credit === "CREDIT").length;
    const noCredit = rows.filter((r: any) => r.credit === "NO_CREDIT").length;
    const abstain = rows.filter((r: any) => r.credit === "ABSTAIN").length;
    expect(credit + noCredit + abstain).toBe(47);
    expect(counts.credit.CREDIT).toBe(credit);
    expect(counts.credit.NO_CREDIT).toBe(noCredit);
    expect(counts.surfacingDenominator).toBe(noCredit);

    expect(counts.fullySurfacedNoCredit + counts.partiallySurfacedNoCredit + counts.notSpecificallySurfacedNoCredit).toBe(noCredit);
    expect(counts.dangerousSilentOmissions).toBe(
      rows.filter((r: any) => r.credit === "NO_CREDIT" && r.binarySurfacing === "NOT_SPECIFICALLY_SURFACED").length,
    );
    expect(counts.readjudicated + counts.carriedForward).toBe(47);
    expect(counts.readjudicated).toBe(ALL_ADJUDICATIONS.length);

    // the binary projection is the contract's mapping, not an independent judgement
    for (const r of rows) {
      if (r.source !== "READJUDICATED") continue;
      expect(r.binarySurfacing).toBe(toBinarySurfacing(r.compositeSurfacing));
    }

    // every NO_CREDIT case is root-caused exactly once
    const rootCaused = CASE_ROOT_CAUSES.map((rc) => rc.caseId).sort();
    const noCreditIds = rows.filter((r: any) => r.credit === "NO_CREDIT").map((r: any) => r.caseId).sort();
    expect(rootCaused).toEqual(noCreditIds);

    // the affected-case manifest partitions all 47
    const manifest = buildAffectedManifest();
    expect(manifest).toHaveLength(47);
    const affected = manifest.filter((m: any) => m.classification !== "PRIOR_ADJUDICATION_STILL_VALID");
    expect(affected).toHaveLength(ALL_ADJUDICATIONS.length);
  });

  it("16. regenerates byte-identically across two runs", () => {
    const a = buildCorpus();
    const b = buildCorpus();
    expect(a.benchmarkContentHash).toBe(b.benchmarkContentHash);
    expect(sha256(JSON.stringify(a.cases))).toBe(sha256(JSON.stringify(b.cases)));
    expect(sha256(JSON.stringify(buildRepairs()))).toBe(sha256(JSON.stringify(buildRepairs())));
    expect(sha256(JSON.stringify(buildFinalResults()))).toBe(sha256(JSON.stringify(buildFinalResults())));

    // and the on-disk artifact matches what the generator produces now
    const onDisk = readJson("docs/phase-3-v3.1-final-reconciliation/05-v3.1.1-corrected-47-case-corpus.json");
    expect(onDisk.benchmarkContentHash).toBe(a.benchmarkContentHash);
  });
});
