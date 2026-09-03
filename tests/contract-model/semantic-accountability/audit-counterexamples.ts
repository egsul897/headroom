/**
 * IMMUTABLE AUDIT COUNTEREXAMPLES (source-coverage repair mission §1).
 *
 * These six fixtures are the exact silent-omission cases the third
 * independent audit constructed against the frozen v2 detector
 * (1957105c58be77465745566167f1a05708d4d3b5). Each one ended
 * INVENTORY_OK / semanticallyComplete=true / no failure reason while
 * material source semantics were dropped.
 *
 * THE WORDING IS FROZEN. Do not soften, lengthen, add vocabulary to, or
 * re-punctuate any `text` below to make detection easier - that would make
 * the regression meaningless. The detector changes; the fixtures do not.
 *
 * Wholly synthetic: invented parties, amounts, section numbers.
 */
import type { SourceContextRegion, SourceContextResult } from "../../../lib/contract-model/compiler/semantic-accountability/types";
import type { WireInventoryItem } from "../../../lib/contract-model/compiler/semantic-accountability/wire-schema";

export const AUDIT_DOC_ID = "audit-counterexample-doc";

export interface AuditCounterexample {
  id: "A" | "B" | "C" | "D" | "E" | "F";
  title: string;
  /** What the old detector did, and why it was silent. */
  oldBehaviour: string;
  /** The material source semantics that must never be dropped silently. */
  omittedSemantics: string;
  operativeText: string;
  /** Optional dependency-expanded region (audit finding 3). */
  expansion?: { regionId: string; text: string; referenceText: string };
  /** The excerpts the scripted model returns as its inventory, with materiality. */
  modelItems: { excerpt: string; role: string; materiality: "CRITICAL" | "MATERIAL" | "INFORMATIONAL" | "REVIEW_UNCERTAIN"; regionId?: string }[];
  /** Verbatim source substring that must end up unaccounted. */
  mustBeUnaccounted: { regionId: string; needle: string }[];
}

export const AUDIT_COUNTEREXAMPLES: AuditCounterexample[] = [
  {
    id: "A",
    title: "material springing guarantee + all-assets lien grant",
    oldBehaviour: "silent: the sentence matches none of OPERATIVE_SEGMENT_RE's connective vocabulary, so it was never eligible to be a gap at any coverage or length",
    omittedSemantics: "a springing guarantee obligation and a first-priority all-assets security interest",
    operativeText: `Section 7.11. The Borrower shall deliver to the Administrative Agent a compliance certificate signed by a Responsible Officer. The Borrower will cause each Subsidiary formed after the Closing Date to become a Guarantor and to grant a first-priority security interest in substantially all of its assets.`,
    modelItems: [{ excerpt: "The Borrower shall deliver to the Administrative Agent a compliance certificate signed by a Responsible Officer", role: "REQUIREMENT", materiality: "MATERIAL" }],
    mustBeUnaccounted: [{ regionId: "operative", needle: "The Borrower will cause each Subsidiary formed after the Closing Date to become a Guarantor and to grant a first-priority security interest in substantially all of its assets." }],
  },
  {
    id: "B",
    title: "29-character absolute debt prohibition",
    oldBehaviour: "silent: 29 non-whitespace characters, below the 40-character eligibility floor",
    omittedSemantics: "an absolute prohibition on incurring Debt",
    operativeText: `The Borrower shall not incur Debt. The Borrower shall maintain insurance with financially sound and reputable insurers in such amounts as are customary for similar businesses.`,
    modelItems: [{ excerpt: "The Borrower shall maintain insurance with financially sound and reputable insurers in such amounts as are customary for similar businesses", role: "REQUIREMENT", materiality: "MATERIAL" }],
    mustBeUnaccounted: [{ regionId: "operative", needle: "The Borrower shall not incur Debt." }],
  },
  {
    id: "C",
    title: "four 26-35 character Lien carve-outs",
    oldBehaviour: "silent: each enumerated carve-out is 26-35 non-whitespace characters, all four below the floor; an item covering only the lead-in left them uncovered",
    omittedSemantics: "four permitted-Lien carve-outs that define the entire exception set of the negative pledge",
    operativeText: `The Borrower shall not create or suffer to exist any Lien upon any of its property, other than the following: (i) Liens for taxes not yet due; (ii) statutory Liens of landlords; (iii) Liens securing Priority Debt; (iv) Liens on Foreign Subsidiary equity.`,
    modelItems: [{ excerpt: "The Borrower shall not create or suffer to exist any Lien upon any of its property, other than the following:", role: "PROHIBITION", materiality: "CRITICAL" }],
    mustBeUnaccounted: [
      { regionId: "operative", needle: "(i) Liens for taxes not yet due;" },
      { regionId: "operative", needle: "(ii) statutory Liens of landlords;" },
      { regionId: "operative", needle: "(iii) Liens securing Priority Debt;" },
      { regionId: "operative", needle: "(iv) Liens on Foreign Subsidiary equity." },
    ],
  },
  {
    id: "D",
    title: "cure period (DAYS) dropped",
    oldBehaviour: "silent twice over: the uncovered text is short and carries none of the connective vocabulary, and the DAYS value it contains was outside the MONEY/PERCENT/RATIO completeness gate",
    omittedSemantics: "a 30-day cure period governing when a payment default becomes an Event of Default",
    operativeText: `An Event of Default occurs if the Borrower fails to pay any principal when due. Cure period: 30 days.`,
    modelItems: [{ excerpt: "An Event of Default occurs if the Borrower fails to pay any principal when due", role: "TRIGGER", materiality: "CRITICAL" }],
    mustBeUnaccounted: [{ regionId: "operative", needle: "Cure period: 30 days." }],
  },
  {
    id: "E",
    title: "maturity date (DATE) dropped",
    oldBehaviour: "silent: an uncovered DATE value was outside the money/percent/ratio completeness gate",
    omittedSemantics: "the final maturity date on which all outstanding loans become due",
    operativeText: `Interest accrues on the outstanding principal amount at the Applicable Rate. All outstanding Loans become due and payable on March 31, 2030.`,
    modelItems: [{ excerpt: "Interest accrues on the outstanding principal amount at the Applicable Rate", role: "REQUIREMENT", materiality: "MATERIAL" }],
    mustBeUnaccounted: [{ regionId: "operative", needle: "All outstanding Loans become due and payable on March 31, 2030." }],
  },
  {
    id: "F",
    title: "$75M cap inside a dependency-expanded definition",
    oldBehaviour: "silent: text accounting ran on the OPERATIVE region only and the value gate was filtered to the region literally named 'operative', so the whole expanded definition was exempt",
    omittedSemantics: "a $75,000,000 aggregate cap, a no-Default condition, and an equity-pledge requirement carried by an incorporated definition",
    operativeText: `The Borrower shall not make Investments other than Permitted Investments as defined in Section 1.01.`,
    expansion: {
      regionId: "xref-0",
      referenceText: "Section 1.01",
      text: `Permitted Investments means investments not to exceed $75,000,000 in the aggregate; provided that no Default shall have occurred and the Borrower shall pledge the equity of each such Person.`,
    },
    modelItems: [{ excerpt: "The Borrower shall not make Investments other than Permitted Investments as defined in Section 1.01.", role: "PROHIBITION", materiality: "CRITICAL" }],
    mustBeUnaccounted: [{ regionId: "xref-0", needle: "Permitted Investments means investments not to exceed $75,000,000 in the aggregate" }],
  },
];

/** Builds the SourceContextResult for a counterexample - regions exactly as the semantic unit would carry them. */
export function auditSourceContext(c: AuditCounterexample): SourceContextResult {
  const regions: SourceContextRegion[] = [
    { regionId: "operative", kind: "OPERATIVE", documentId: AUDIT_DOC_ID, sourceNodeId: `${AUDIT_DOC_ID}:${c.id}`, sectionRef: null, charStart: 0, charEnd: c.operativeText.length, text: c.operativeText, expandedFor: null, truncatedAtBudget: false, unitExtension: null },
  ];
  if (c.expansion) {
    regions.push({ regionId: c.expansion.regionId, kind: "CROSS_REFERENCE_EXPANSION", documentId: AUDIT_DOC_ID, sourceNodeId: null, sectionRef: null, charStart: 0, charEnd: c.expansion.text.length, text: c.expansion.text, expandedFor: { referenceText: c.expansion.referenceText, resolution: "UNIQUE", note: "audit counterexample expansion" }, truncatedAtBudget: false, unitExtension: null });
  }
  return {
    state: c.expansion ? "DEPENDENCY_EXPANDED_SOURCE" : "COMPLETE_LOCAL_SOURCE",
    regions,
    unresolvedReferences: [],
    reasons: [],
    totalChars: regions.reduce((n, r) => n + r.text.length, 0),
    budgetChars: 100_000,
  };
}

/** The scripted model output for a counterexample. */
export function auditWireItems(c: AuditCounterexample): WireInventoryItem[] {
  return c.modelItems.map((m, i) => ({
    localRef: `${c.id}-${i}`,
    semanticRole: m.role,
    proposition: `${m.role.toLowerCase()}: ${m.excerpt.slice(0, 60)}`,
    excerpt: m.excerpt,
    regionId: m.regionId ?? "operative",
    quantitativeValues: [],
    referencedTerms: [],
    referencedSections: [],
    parentRef: null,
    relatedRefs: [],
    materiality: m.materiality,
    ambiguity: "NONE",
    ambiguityReason: null,
    operative: "OPERATIVE",
  }));
}
