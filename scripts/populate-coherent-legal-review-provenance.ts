/**
 * Coherent legal-model finalization / phase closeout.
 *
 * Records the founder-and-peer legal review determination as durable
 * `LegalReviewRecord` rows (see prisma/schema.prisma's own comment block
 * above that model) and promotes the specific `GoldenTest` rows whose
 * material legal-interpretation dependency was actually within the
 * reviewed scope to `status: FOUNDER_AND_PEER_REVIEWED`.
 *
 * THIS SCRIPT DOES NOT TOUCH: golden_tests.expectedAnswer/bindingProvision/
 * bindingDefinedTerms/question (frozen - see the closeout task's own §G);
 * any Permission/PermissionRelationship/SharedCapacityConstraint/
 * RuleActivationCondition/CollateralPool row (frozen - §L); any financial
 * snapshot/ledger row. It only (a) inserts new LegalReviewRecord rows and
 * (b) updates the `status` column of 8 specific, named GoldenTest rows.
 * Idempotent via upsert on fixed ids - safe to re-run.
 *
 * REVIEWER METADATA: reviewerName/reviewerRole/reviewerExperience/reviewDate
 * are left NULL on every row below. The closeout task supplied a review
 * DETERMINATION (founder-and-peer review occurred, per its own §A) but not
 * the reviewers' actual names, exact titles, or the review date - inventing
 * those would violate the task's explicit "DO NOT invent names, roles, or
 * dates" instruction. The `notes` field on each row states this explicitly
 * so a future update filling in real reviewer metadata has an obvious place
 * to land (see docs/legal-review-status-model.md §4).
 *
 * GOLDEN-QUESTION SELECTION (task §F - "do NOT blindly promote every row"):
 * See docs/coherent-legal-model-baseline-v1.md §5 and this session's final
 * report for the full per-row reasoning. Summary: of Coherent's 30 golden
 * rows, 8 have (a) a material legal-interpretation dependency that falls
 * within the four reviewed load-bearing conclusions, AND (b) a numeric/
 * boolean answer that is stable under both the pre-review (legacy,
 * MILA-as-ceiling) and post-review (corrected, non-netted) interpretation -
 * i.e. promoting them does not imply endorsement of a dollar figure the
 * review itself calls into question. Rows whose expected answer IS a
 * capacity-ceiling figure computed by the legacy, uncorrected CapacityExpr
 * formula (Q1-Q4, Q21, Q22, "CA secured capacity on its own") are
 * deliberately NOT promoted - see the CONFIGURATION/REVIEW MISMATCH note in
 * the final report (task §L/§G).
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const COMPANY_ID = "coherent";

const NOT_SUPPLIED_NOTE =
  "Reviewer name/role/experience-category and exact review date were NOT supplied to the closeout task that created this record and are therefore left null per that task's explicit instruction not to invent them (see docs/legal-review-status-model.md §4). The review DETERMINATION itself (founder-and-peer review completed) is recorded per the closeout task's own controlling §A statement.";

async function main() {
  const existing = await prisma.legalReviewRecord.count({ where: { companyId: COMPANY_ID } });
  if (existing > 0) {
    console.log(`legal_review_records already populated for ${COMPANY_ID} (${existing} rows) - re-running upserts idempotently.`);
  }

  // ---------------------------------------------------------------------
  // 1. The four load-bearing legal conclusions (task §E). None of these is
  //    a single-row artifact - each spans a document-wide interpretation
  //    or (for #1) the fact of an ABSENT stacking relationship between
  //    several Permission rows, so all four use reviewedArtifactType
  //    LEGAL_CONCLUSION with a stable descriptive slug, per the
  //    LegalReviewRecord/ReviewedArtifactType comment block in schema.prisma.
  // ---------------------------------------------------------------------
  const conclusions: {
    id: string;
    ref: string;
    notes: string;
    sourceVersion: string;
  }[] = [
    {
      id: "coh-lrr-clause-6-24-25-nonnetting",
      ref: "coherent-indenture-permitted-liens-clause-6-24-25-stacking-nonnetting",
      notes:
        "Permitted Liens clause (6) (automatic lien tied to §3.3(b)(i)/(iv)-sourced debt) is not netted against, and stacks additively with, clauses (24)/(25) (ratio/fixed lien baskets) - the 3.00x SSNL test in clause (24) is not a universal secured-debt ceiling. Reviewed conclusion applies to Permission rows coh-ind-l-cl6-linked-scf, coh-ind-l-cl6-linked-capex, coh-ind-l-cl24-ratio, coh-ind-l-cl25-general (Indenture liens side) and the deliberate absence of any PermissionRelationship row connecting clause-6-linked permissions to clause-24/25 permissions (the structural encoding of non-netting - see tests/solver/coherent-stacking-conclusions.test.ts). Source: docs/coherent-phase1-stacking-table.md §C.2, docs/coherent-phase8-blocker-closure.md. " +
        NOT_SUPPLIED_NOTE,
      sourceVersion: "docs/coherent-phase1-stacking-table.md; docs/coherent-phase8-blocker-closure.md",
    },
    {
      id: "coh-lrr-ebitda-addback-cap-absence",
      ref: "coherent-adjusted-consolidated-ebitda-addback-cap-absence",
      notes:
        "The reviewed Coherent debt-document Adjusted Consolidated EBITDA / Consolidated EBITDA definitions do not contain a general percentage-of-EBITDA addback cap, as reflected in the final Phase 8 legal specification. This is a LEGAL-DEFINITION conclusion only - it does NOT certify the numerical Covenant EBITDA value ($1,700M) currently supplied to the engine from prisma/seed-data.ts, which remains a plain, non-certified figure (see coh-lrr placeholder none; tracked instead by the pre-existing CERTIFIED_EXTERNAL_INPUT gap documented in docs/coherent-phase8-population-reconciliation.md §D/§S and docs/coherent-legal-model-baseline-v1.md §6). No golden_tests row's computed answer currently depends on this conclusion, because Coherent's EBITDA is a flat hardcoded snapshot value, not derived through a live addback computation - see the closeout session's final report for the row-by-row reasoning. Source: docs/coherent-phase8-blocker-closure.md §C/§D. " +
        NOT_SUPPLIED_NOTE,
      sourceVersion: "docs/coherent-phase8-blocker-closure.md",
    },
    {
      id: "coh-lrr-contribution-indebtedness-availability",
      ref: "coherent-indenture-contribution-indebtedness-availability",
      notes:
        "Contribution Indebtedness (Indenture §3.3(b)(xviii)) exists as an available contractual permission/measurement basis under the reviewed Indenture provisions, subject to the terms and limitations captured in the Phase 8 legal specification. This review does NOT authorize the engine to fabricate capacity: Contribution Indebtedness remains NOT POPULATED as a Permission row (its measurement basis - a contribution-linked credit tied to a historical corporate event, Officer's-Certificate-designated - has no representation in the MeasurementBasis enum today, and would also require a CERTIFIED_EXTERNAL_INPUT that does not exist in Coherent's data). This is a genuine, unchanged ENGINEERING_CAPABILITY gap (docs/coherent-phase8-population-reconciliation.md §M item 3), not resolved or affected by this legal-review closeout. No golden_tests row depends on this conclusion (none reference Contribution Indebtedness). Source: docs/coherent-phase8-blocker-closure.md §H. " +
        NOT_SUPPLIED_NOTE,
      sourceVersion: "docs/coherent-phase8-blocker-closure.md",
    },
    {
      id: "coh-lrr-collateral-suspension-period-current-state",
      ref: "coherent-collateral-suspension-period-current-state-as-of-2026-08-25",
      notes:
        "The previously reviewed conclusion regarding current Collateral Suspension Period status is approved AS OF the applicable review/as-of date (the 8/25/2026 reporting date used throughout docs/coherent-phase8-blocker-closure.md §G and docs/coherent-phase8-population-reconciliation.md). The relevant contractual trigger (Investment Grade Rating Trigger Date) is NOT currently satisfied because Term B Loans ($1,080.0M as of 6/30/2026) remain outstanding, independently corroborated by then-current Fitch/S&P ratings (both 'BB'). This is a TEMPORAL, as-of determination, not a timeless contractual constant - it would need to be re-confirmed against a later factual state before being relied upon for a future reporting period. Provenance row: RuleActivationCondition id=coh-rac-collateral-suspension (PERMISSION reviewedArtifactType record below cross-references it). Source: docs/coherent-phase8-blocker-closure.md §G. " +
        NOT_SUPPLIED_NOTE,
      sourceVersion: "docs/coherent-phase8-blocker-closure.md",
    },
  ];

  for (const c of conclusions) {
    await prisma.legalReviewRecord.upsert({
      where: { id: c.id },
      create: {
        id: c.id,
        companyId: COMPANY_ID,
        reviewedArtifactType: "LEGAL_CONCLUSION",
        reviewedArtifactRef: c.ref,
        reviewStatus: "FOUNDER_AND_PEER_REVIEWED",
        notes: c.notes,
        sourceVersion: c.sourceVersion,
      },
      update: {
        reviewStatus: "FOUNDER_AND_PEER_REVIEWED",
        notes: c.notes,
        sourceVersion: c.sourceVersion,
      },
    });
  }
  console.log(`Upserted ${conclusions.length} LEGAL_CONCLUSION LegalReviewRecord rows.`);

  // ---------------------------------------------------------------------
  // 2. Additional provenance row cross-referencing the Collateral Suspension
  //    Period's RuleActivationCondition directly (task §D: "reviewed
  //    conclusion/artifact" - both the conclusion-level slug above AND the
  //    concrete data row it is expressed through are useful join points).
  // ---------------------------------------------------------------------
  await prisma.legalReviewRecord.upsert({
    where: { id: "coh-lrr-rac-collateral-suspension" },
    create: {
      id: "coh-lrr-rac-collateral-suspension",
      companyId: COMPANY_ID,
      reviewedArtifactType: "RULE_ACTIVATION_CONDITION",
      reviewedArtifactRef: "coh-rac-collateral-suspension",
      reviewStatus: "FOUNDER_AND_PEER_REVIEWED",
      notes: "Concrete-row cross-reference for coh-lrr-collateral-suspension-period-current-state. " + NOT_SUPPLIED_NOTE,
      sourceVersion: "docs/coherent-phase8-blocker-closure.md",
    },
    update: {
      reviewStatus: "FOUNDER_AND_PEER_REVIEWED",
      notes: "Concrete-row cross-reference for coh-lrr-collateral-suspension-period-current-state. " + NOT_SUPPLIED_NOTE,
    },
  });

  // ---------------------------------------------------------------------
  // 3. Golden-question reconciliation (task §F). Exactly 8 of 30 rows
  //    qualify - see the header comment and the final report for the full
  //    row-by-row reasoning. expectedAnswer/bindingProvision/question are
  //    NEVER touched here - only `status`.
  // ---------------------------------------------------------------------
  const promotedGoldenTests: { id: string; question: string; reason: string }[] = [
    {
      id: "cmt7vicw6001rj1d3qr02g8l6",
      question: "Is $100M of new secured debt permitted? Under which test?",
      reason: "mila_secured/clause-24 SSNL<=3.00x test - within reviewed clause 6/24/25 scope; clears under both legacy and corrected capacity, so promotion does not endorse an unreviewed ceiling figure.",
    },
    {
      id: "cmt7vicw7001tj1d3riwfeoy1",
      question: "Is $250M of new secured debt permitted?",
      reason: "Same basis as $100M row.",
    },
    {
      id: "cmt7vicw9001vj1d3mxmcuusv",
      question: "Is $500M of new secured debt permitted?",
      reason: "Same basis as $100M row.",
    },
    {
      id: "cmt7vicwa001xj1d3l5x0s6ah",
      question: "Is $1,000M ($1B) of new secured debt permitted?",
      reason: "Same basis as $100M row.",
    },
    {
      id: "cmt7vicwi002bj1d39xfqtbe0",
      question: "What is the SSNL threshold applicable to secured incurrence under the indenture, and what is the current SSNL?",
      reason: "Directly the Permitted Liens clause (24) SSNL<=3.00x ratio test; the ratio/threshold computation itself (not an aggregate ceiling) is unaffected by the non-netting correction.",
    },
    {
      id: "cmt7vicwj002dj1d3bv3zwd1w",
      question: "At what level of incremental secured debt would the indenture's SSNL test first become the binding constraint - spot check at $2,000M",
      reason: "DEBT_SIMULATION clear/blocked spot check - matches exactly between legacy and solver-native per docs/coherent-phase8-population-reconciliation.md §O/§J.",
    },
    {
      id: "cmt7vicwk002fj1d3nnpsqqdp",
      question: "At what level of incremental secured debt would the indenture's SSNL test first become the binding constraint - spot check at the $4,041M ceiling",
      reason: "Same basis as the $2,000M spot check row - clear under both interpretations (the corrected model's true ceiling is materially higher).",
    },
    {
      id: "cmt7vicwt002rj1d35pii22zu",
      question: "Can Coherent incur $1,000M of secured debt without breaching either document, and if so what does pro forma total net leverage become?",
      reason: "DEBT_SIMULATION clear check well within capacity under either interpretation - within reviewed clause 24 scope.",
    },
  ];

  for (const g of promotedGoldenTests) {
    const row = await prisma.goldenTest.findUnique({ where: { id: g.id } });
    if (!row) throw new Error(`Expected golden_tests row ${g.id} not found - refusing to proceed (question mismatch risk).`);
    if (row.question !== g.question) {
      throw new Error(`golden_tests row ${g.id} question text changed since this script was written - refusing to promote. Expected: "${g.question}" Got: "${row.question}"`);
    }

    await prisma.goldenTest.update({
      where: { id: g.id },
      data: { status: "FOUNDER_AND_PEER_REVIEWED" },
    });

    await prisma.legalReviewRecord.upsert({
      where: { id: `coh-lrr-golden-${g.id}` },
      create: {
        id: `coh-lrr-golden-${g.id}`,
        companyId: COMPANY_ID,
        reviewedArtifactType: "GOLDEN_TEST",
        reviewedArtifactRef: g.id,
        reviewStatus: "FOUNDER_AND_PEER_REVIEWED",
        notes: `${g.reason} ${NOT_SUPPLIED_NOTE}`,
        sourceVersion: "docs/coherent-phase1-stacking-table.md; docs/coherent-phase8-blocker-closure.md",
      },
      update: {
        reviewStatus: "FOUNDER_AND_PEER_REVIEWED",
        notes: `${g.reason} ${NOT_SUPPLIED_NOTE}`,
      },
    });
  }
  console.log(`Promoted ${promotedGoldenTests.length}/30 golden_tests rows to FOUNDER_AND_PEER_REVIEWED (expectedAnswer/bindingProvision/question left untouched).`);

  const [total, byStatus, lrrCount] = await Promise.all([
    prisma.goldenTest.count({ where: { companyId: COMPANY_ID } }),
    prisma.goldenTest.groupBy({ by: ["status"], where: { companyId: COMPANY_ID }, _count: true }),
    prisma.legalReviewRecord.count({ where: { companyId: COMPANY_ID } }),
  ]);
  console.log(`\ngolden_tests total: ${total}`);
  console.log("Status distribution:", byStatus.map((s) => `${s.status}=${s._count}`).join(", "));
  console.log(`legal_review_records total: ${lrrCount}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
