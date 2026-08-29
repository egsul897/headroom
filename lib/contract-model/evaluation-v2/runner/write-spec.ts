/**
 * Evaluation Methodology V2 — specification and independence artifacts.
 *
 * Phase 3F.1.5. Writes:
 *   01-methodology-spec.json      — the full design as structured data
 *   02-independence-matrix.json   — the evaluator's dependency graph and the
 *                                   mechanically-enforced import boundary
 *
 * Run: npx tsx lib/contract-model/evaluation-v2/runner/write-spec.ts
 */
import { SEMANTIC_CORRESPONDENCE_SYSTEM_PROMPT } from "../adjudication";
import { DEFAULT_GENERATION_OPTIONS } from "../candidate-generation";
import { MIN_SHARED_TERMS_FOR_CORRESPONDENCE, MIN_SHARED_TERMS_WITH_FAMILY_SUPPORT, OBJECT_CORRESPONDENCE_THRESHOLD, OBJECT_MATERIAL_CONFLICT_THRESHOLD } from "../conflicts";
import { currentVersions } from "../identity";
import { ALL_DIMENSIONS, BLOCKING_DIMENSIONS, CORE_CREDIT_DIMENSIONS } from "../types";
import { artifactHeader, writeArtifact } from "./artifacts";

export function writeSpecArtifacts(repoRoot: string): { path: string; sha256: string; bytes: number }[] {
  const written: { path: string; sha256: string; bytes: number }[] = [];

  written.push(
    writeArtifact(repoRoot, "01-methodology-spec.json", {
      ...artifactHeader("PHASE_3F_1_5_METHODOLOGY_SPEC", "The complete Evaluation V2 design as structured data: layers, types, taxonomies and dimension definitions."),
      centralPrinciple: {
        statement: "Coverage credit requires semantic correspondence. Structural proximity is navigation evidence, never proof.",
        consequences: [
          "A ground-truth unit is never credited because a candidate is in the same section, is a descendant, is an ancestor, sits near a similar dollar figure, sits near a higher-materiality unit, or shares a legal citation.",
          "Those facts may cause a candidate to be EVALUATED (candidate-generation.ts records why each pair was generated) and can never cause it to be CREDITED.",
          "The evaluator judges the system; the system is never altered to satisfy the evaluator.",
        ],
      },
      versions: currentVersions(),
      versioningRule:
        "Every result identity and every cached semantic judgment is keyed by evidenceIdentity(), which folds in all four version constants. A changed match policy invalidates every cached judgment by construction.",

      layers: [
        {
          layer: 1,
          name: "Deterministic signal correspondence",
          module: "lib/contract-model/evaluation-v2/signals.ts",
          reads: "TEXT AND STRUCTURED CONTENT ONLY. Never a section number, node key, parent/child relation or document position.",
          extracts: [
            "money amounts (with currency and scale)",
            "percentages WITH the metric they are taken of",
            "ratios WITH the ratio metric they test",
            "greater-of / lesser-of cap structure",
            "comparison direction (NOT_EXCEED / AT_LEAST / EXCEED / EQUAL)",
            "canonical metrics (EBITDA, Total Assets, leverage/coverage ratios, Available Amount, Borrowing Base, Availability, ...)",
            "defined terms",
            "canonical action tags (32 values covering incurrence, liens, investments, dispositions, restricted payments, junior prepayments, fundamental changes, affiliate transactions, restrictive agreements, swaps, unrestricted-subsidiary designation, reporting, collateral, ...)",
            "legal posture and its deontic class",
            "provision role and PROVISION BREADTH (universal restriction vs narrow carve-out vs specific obligation vs definitional)",
            "entity scope, with negated-entity handling so 'Restricted Subsidiaries that are NOT Loan Parties' never registers LOAN_PARTY",
            "instrument distinctions (secured/unsecured, first/second lien, senior/subordinated, revolving/term, capital lease, LC, swingline)",
            "time periods",
            "conditions (no-Default, Payment Conditions, pro forma compliance, ratio satisfied, notice, consent, certificate, solvency, ordinary course, FMV, cash-consideration minimum, subordination, availability)",
            "exceptions (ordinary course, except-as-permitted, notwithstanding override, grandfathered, de minimis, permitted-acquisition, intercompany)",
            "cap sharing, builder/grower semantics, reclassification rights, step-up/step-down",
            "cross-references",
            "substantive content lemmas (supporting evidence for the object dimension only)",
          ],
          role: "Produces SUPPORT / CONFLICT / MISSING evidence. Does NOT determine semantic equivalence on its own.",
        },
        {
          layer: 2,
          name: "Semantic correspondence analysis",
          module: "lib/contract-model/evaluation-v2/semantic-correspondence.ts",
          question: "Does this candidate substantively represent this ground-truth claim — considering meaning, never location?",
          output: "A per-dimension assessment, never a single opaque similarity scalar.",
          scalarUse:
            "A correspondenceStrength scalar exists but is used ONLY to order candidates that have already passed the categorical gate. It can never promote a candidate past that gate.",
          aiAssist: {
            when: "Only for pairs the deterministic layer marks INDETERMINATE.",
            canDo: "Confirm or downgrade an indeterminate pair.",
            cannotDo: [
              "Override a material conflict found by Layer 3.",
              "Decide any aggregate coverage number.",
              "See the ground truth's own disposition or any 'correct answer'.",
            ],
            promptVersion: currentVersions().promptVersion,
            systemPrompt: SEMANTIC_CORRESPONDENCE_SYSTEM_PROMPT,
            requiredStructuredOutputFields: ["corresponds (YES|PARTIAL|NO|AMBIGUOUS)", "supportingEvidence", "conflictingEvidence", "missingDimensions", "confidence", "rationale"],
            noPackageSpecificExamples: true,
            rawOutputPreserved: true,
            cachedBy: "evidenceIdentity(groundTruthEvidenceHash, candidateEvidenceHash, provider, model, all four version constants)",
            executedInThisPhase: false,
            executedInThisPhaseReason: "No model credential is available in the execution environment. See 11-reproducibility-and-cost.json.",
          },
        },
        {
          layer: 3,
          name: "Contradiction / omission checks",
          module: "lib/contract-model/evaluation-v2/conflicts.ts",
          runsEvenFor: "candidates that already look like a partial match",
          severities: ["MATERIAL_CONFLICT", "NON_MATERIAL_VARIANCE", "MISSING_REQUIRED_DIMENSION"],
          conflictCodes: [
            "WRONG_ACTION",
            "INVERTED_LEGAL_POSTURE",
            "WRONG_OBJECT_RESOURCE",
            "WRONG_ENTITY_SCOPE",
            "WRONG_AMOUNT",
            "WRONG_PERCENT_BASIS",
            "WRONG_METRIC",
            "WRONG_RATIO",
            "WRONG_COMPARISON_DIRECTION",
            "WRONG_CAP_STRUCTURE",
            "WRONG_TIME_PERIOD",
            "WRONG_INSTRUMENT",
            "SCOPE_BREADTH_MISMATCH",
            "MISSING_CONDITION",
            "MISSING_EXCEPTION",
            "MISSING_BASKET",
            "MISSING_DEPENDENCY",
            "MISSING_ECONOMICS",
            "WRONG_OPERATIVE_VERSION",
            "INCORRECT_SHARED_CAP_RELATIONSHIP",
            "MISSING_REVIEW_FLAG",
            "UNSUPPORTED_SEMANTICS_PRESENTED_AS_COMPLETE",
          ],
          rule: "A material conflict recorded here always controls its dimension's outcome, so a conflict can never be outvoted by a positive test on the same dimension.",
        },
        {
          layer: 4,
          name: "Match cardinality resolution",
          module: "lib/contract-model/evaluation-v2/matching.ts",
          statuses: {
            EXACT_SINGLE: "one substantive representation fully represents the claim",
            EXACT_COMPOSITE: "a SET of substantive representations jointly represents it, and EVERY member corresponds independently on the core dimensions — a union of structurally adjacent nodes is never a composite match",
            PARTIAL: "correspondence established against a substantive representation, but a required dimension is missing",
            AMBIGUOUS: "two or more mutually irreconcilable candidate clusters correspond about equally well; no winner is forced",
            CONTRADICTORY: "the system offered a substantive representation here that materially contradicts the claim",
            UNREPRESENTED: "nothing substantively represents the claim",
            HONESTLY_UNRESOLVED: "a corresponding candidate explicitly surfaces the claim as unresolved",
            HONESTLY_UNSUPPORTED: "a corresponding candidate explicitly declares the claim cannot be represented",
          },
          accountingGate: {
            rule: "Semantic correspondence establishes that a candidate is ABOUT the claim. Credit additionally requires that the corresponding candidate's accounting role is a SUBSTANTIVE_REPRESENTATION.",
            roles: {
              SUBSTANTIVE_REPRESENTATION: "a compiled/verified representation the system offers as its answer",
              HONEST_UNSUPPORTED: "the system says it cannot represent this",
              HONEST_UNRESOLVED: "the system says it could not resolve this",
              SAFETY_FLAG: "the system flags a gap here (dangerous-unaccounted, review-required, verifier finding)",
              INVENTORY_ONLY: "the system noticed the provision and produced no representation of it",
            },
            why: "A discovery candidate that correctly describes a covenant but was never compiled is an inventory finding, not a representation. Correspondence without representation is not credit.",
          },
        },
      ],

      dimensions: {
        all: ALL_DIMENSIONS,
        core: {
          list: CORE_CREDIT_DIMENSIONS,
          rule: "Must AFFIRMATIVELY correspond (or be NOT_APPLICABLE) before any credit is possible. An INDETERMINATE reading withholds credit rather than granting it.",
        },
        blocking: {
          list: BLOCKING_DIMENSIONS,
          rule: "Cannot earn credit on their own, but a MATERIAL_CONFLICT on any of them defeats a match however well the core dimensions line up.",
        },
        definitions: {
          A_SUBJECT_ACTION: "the governed activity (incur debt, create lien, make investment, dispose, pay a Restricted Payment, ...)",
          B_LEGAL_POSTURE: "prohibition / permission / obligation / condition / definition / representation / event of default, compared by deontic class so that 'shall not permit X below 3.00x' and 'shall maintain X of at least 3.00x' correspond while a permission and a prohibition never do",
          C_OBJECT_RESOURCE: "what the provision is about, measured by classified family, object tags and substantive-vocabulary overlap",
          D_SCOPE_ENTITY: "which obligors the provision reaches",
          E_ECONOMICS: "amounts, percentages WITH basis, ratios WITH metric, cap structure, comparison direction, time period",
          F_CONDITIONS_EXCEPTIONS: "material gates and carve-outs, plus shared-capacity and dependency relationships",
          G_OPERATIVE_PROVENANCE: "which document/version the claim is asserted as of",
          H_PROVISION_ROLE_BREADTH: "universal restriction vs narrow carve-out vs specific obligation vs definitional",
        },
        breadthRule:
          "The dimension the historical scorers had no concept of. A universal prohibition and one enumerated carve-out beneath it are different legal claims even when they share a section number, a covenant family, a governed action and most of their vocabulary. When the ground truth asserts a determinate breadth and the candidate cannot be shown to have one, breadth is a MISSING_REQUIRED_DIMENSION — which caps the pair at PARTIAL rather than crediting it.",
      },

      numericCorrespondence: {
        rule: "Numeric matching alone is never sufficient for credit, and a matching number on a different basis is a CONFLICT, not a match.",
        checks: ["exact value", "currency", "percentage value AND the metric it is taken of", "ratio value AND the ratio metric", "greater-of / lesser-of structure", "comparison direction", "time period"],
        worked: ["$35m is not $5m", "12.5% of EBITDA is not 12.5% of Total Assets", "4.00x leverage is not 4.00x fixed-charge coverage", "'greater of $50m and 10% EBITDA' is not '$50m' alone"],
        persistence: "Every comparison is persisted as a NumericComparisonRecord inside the evidence packet.",
      },

      qualitativeCorrespondence: {
        rule: "For a claim with no numeric figures, real semantic evidence is required. The absence of numbers must NEVER cause a fallback to location-only credit.",
        contrastWithHistoricalDefect:
          "The Phase C evaluator's hierarchy-child and intermediate-ancestor fallbacks were gated on `numbersMatch`, so a provision with figures could be credited by finding its number anywhere beneath its address. Evaluation V2 has no numeric gate on any fallback because it has no positional fallback at all.",
        examples: ["subject to Payment Conditions", "except dispositions in the ordinary course", "no Default shall exist", "Restricted Subsidiary only", "US Borrowers only", "may reclassify", "shared with basket X"],
      },

      coverageStates: {
        representationStatus: ["REPRESENTED", "PARTIALLY_REPRESENTED", "UNREPRESENTED", "HONESTLY_UNSUPPORTED", "HONESTLY_UNRESOLVED", "AMBIGUOUS"],
        semanticCorrectness: ["CORRECT", "PARTIALLY_CORRECT", "INCORRECT", "NOT_APPLICABLE", "NOT_VERIFIABLE"],
        rule: "Two independent dimensions, never collapsed into one boolean. A compiler that honestly says UNSUPPORTED is poor executability and GOOD safety behaviour; it never scores the same as a silent omission.",
      },

      dangerousUnaccountedV2: {
        name: "DANGEROUS_UNACCOUNTED_SEMANTIC_UNIT_V2",
        conditions: [
          "materiality is CRITICAL or MATERIAL",
          "no semantically-corresponding representation adequately accounts for the claim",
          "the system does not explicitly surface the claim as unresolved / unsupported / review-required / missing-context / otherwise-unsafe THROUGH A SEMANTICALLY-CORRESPONDING CANDIDATE",
          "no candidate excerpt actually substantiates the claim",
        ],
        criticalQualifier:
          "Condition 3's qualifier is the whole point. The historical scorer treated a dangerous-unaccounted flag anywhere under the same section number as accounting for the claim; that is how an unrelated intercompany-debt basket came to 'cover' a general Indebtedness prohibition. Here a flag accounts for a claim only when it sits on a candidate that actually represents that claim.",
        neverGrants: ["descendant credit", "ancestor credit", "location-only credit", "nearby-figure credit", "neighbouring-materiality credit"],
      },

      candidateGeneration: {
        module: "lib/contract-model/evaluation-v2/candidate-generation.ts",
        allowedCoarseFilters: ["SAME_DOCUMENT", "SECTION_REF_EXACT", "SECTION_REF_ANCESTOR", "SECTION_REF_DESCENDANT", "SECTION_REF_SIBLING", "SHARED_SEMANTIC_FAMILY", "SHARED_ACTION_TAG", "SHARED_NUMERIC_FIGURE", "SHARED_DEFINED_TERM", "SHARED_CONTENT_TERMS", "DEPENDENCY_LINK"],
        rule: "These generate pairs to evaluate. They never grant credit. Every reason a pair was generated is recorded on the pair so a reviewer can see that a SECTION_REF_DESCENDANT pairing still had to pass Layers 2 and 3 on content alone.",
        options: DEFAULT_GENERATION_OPTIONS,
        thresholds: {
          OBJECT_CORRESPONDENCE_THRESHOLD,
          OBJECT_MATERIAL_CONFLICT_THRESHOLD,
          MIN_SHARED_TERMS_FOR_CORRESPONDENCE,
          MIN_SHARED_TERMS_WITH_FAMILY_SUPPORT,
        },
      },

      groundTruthQualityTaxonomy: {
        verdicts: ["GT_CONFIRMED", "GT_AMBIGUOUS", "GT_INCOMPLETE", "GT_CONFLICT_WITH_SOURCE", "GT_REQUIRES_DOMAIN_REVIEW"],
        rule: "The frozen ground-truth files are NEVER edited. A defect is recorded as an adjudication OVERLAY, and any exclusion from clean aggregates carries a written reason.",
        adjudicationProvenance: {
          kinds: ["AI_ADJUDICATED_FROM_SOURCE_ONLY", "AI_ADJUDICATED_REVIEWED_BY_NON_LAWYER", "HUMAN_AUTHORED_NOT_EXTERNALLY_REVIEWED", "EXTERNAL_HUMAN_LAWYER_REVIEWED", "UNKNOWN_PROVENANCE"],
          rule: "externallyHumanReviewed is set true only when an external human lawyer is RECORDED as having reviewed the unit. It is never inferred.",
        },
      },

      aggregateMetrics: {
        rule: "Computed only after unit-level evidence is frozen. Every percentage carries the exact unit ids behind its numerator and denominator.",
        published: [
          "criticalSemanticRecall",
          "materialSemanticRecall",
          "combinedCriticalMaterialRecall",
          "exactSemanticCorrectnessRate",
          "partialRepresentationRate",
          "honestUnresolvedOrUnsupportedRate",
          "ambiguousMatchRate",
          "falseCreditRate",
          "candidateGenerationPrecision",
          "creditedCandidateShare",
          "inventoryOnlySurfacedRate",
          "noCorrespondingCandidateRate",
          "dangerousUnaccountedCount (+ the full unit id list)",
        ],
      },
    }),
  );

  written.push(
    writeArtifact(repoRoot, "02-independence-matrix.json", {
      ...artifactHeader("PHASE_3F_1_5_INDEPENDENCE_MATRIX", "The evaluator's dependency graph, and what it is and is not permitted to consume."),
      principle:
        "The evaluator MAY consume production outputs as EVIDENCE. It must NEVER consume production CONCLUSIONS as ground truth. Architecture invariants #17 and #18.",
      invariant18Response: {
        risk: "Mechanical independence at the algorithm level is necessary but NOT sufficient: a shared upstream substrate can defeat two 'independent' systems simultaneously (the real Phase 2A → 2B/2E precedent recorded in the invariants).",
        mitigation:
          "The evaluator's GROUND-TRUTH side resolves its own source excerpts directly from the raw extracted text (lib/contract-model/evaluation-v2/source-excerpt.ts), never from the production structural index. A structural-parser gap therefore cannot blind the evaluator and the system it evaluates at the same time.",
        residualExposure:
          "The CANDIDATE side is necessarily downstream of the structural index, because the candidates ARE the pipeline's output. That is unavoidable and is the correct exposure: the evaluator is measuring what the pipeline produced. What must not be shared is the ANSWER KEY, and it is not.",
      },
      consumes: [
        { source: "tests/fixtures/unseen-packages/phase-3f-ground-truth/ground-truth-doc-{a,b,c,d}.json", as: "GROUND TRUTH (answer key)", note: "Frozen, independently authored, never produced by the compiler. Read only." },
        { source: "tests/fixtures/unseen-packages/{fwrg,lsb,conmed}*/human-ground-truth.ts", as: "GROUND TRUTH (answer key)", note: "Frozen, authored from source before/independently of extraction. Read only." },
        { source: "tests/fixtures/unseen-packages/dsgr-2022-2025-credit-facility/extracted-text/*.txt", as: "RAW SOURCE", note: "Used by the evaluator's own excerpt resolver, independent of the production structural index." },
        { source: "phase-3f-first-blind-run/stage2-all-discovery-candidates.json", as: "CANDIDATE EVIDENCE", note: "The system's inventory findings, consumed as evidence about what it produced." },
        { source: "phase-3f-first-blind-run/stage6-compiled-results.json", as: "CANDIDATE EVIDENCE", note: "Compiled IR rules and definitions." },
        { source: "phase-3f-first-blind-run/stage7-verification-results.json", as: "CANDIDATE EVIDENCE", note: "Verifier findings, treated as safety flags." },
        { source: "phase-3f-first-blind-run/stage5-amendment-effects.json", as: "CANDIDATE EVIDENCE", note: "Amendment effects and their own unresolved reasons." },
        { source: "phase-3f-first-blind-run/stage8-coverage-result.json", as: "CANDIDATE EVIDENCE + SELF-REPORTED STATE", note: "Coverage units, coverage states and dangerous-unaccounted flags are read as the system's own self-report, never as a verdict about whether a ground-truth claim is covered." },
        { source: "phase-3f-ground-truth/phase-3f-scoring-report.json", as: "HISTORICAL CONCLUSION, FOR COMPARISON ONLY", note: "Read to build the old-vs-V2 table. Never used to decide any V2 disposition." },
        { source: "phase-3f1-1-forensics/raw-scorer-combination-C-corrected-x-firstblind.json", as: "HISTORICAL CONCLUSION, FOR COMPARISON ONLY", note: "Read to recover WHICH candidates carried the old credit, so V2 can re-judge exactly those. Never used to decide any V2 disposition." },
        { source: "phase-3f1-1-forensics/phase-3f1-1-scorer-bridge.json", as: "HISTORICAL FORENSIC RECORD", note: "The 26-case list and the 14 confirmed false-credit ids. Used to define the reconciliation population and the gate, never to decide a disposition." },
      ],
      mustNeverImport: [
        { module: "scripts/phase-3f-score-first-run.ts", why: "structural sectionRef matching (exact → parent → descendant) with coverage state taken from the best-materiality unit at that address" },
        { module: "scripts/phase-3f1-score-dsgr-regression.ts", why: "the descendant-union variant whose credit mechanism produced the 26-case artifact" },
        { module: "scripts/phase-3f1-1-forensics.ts", why: "re-parameterized re-implementation of the same structural matcher" },
        { module: "lib/contract-model/analyzer/evaluator.ts", why: "findMatch / findHierarchyChildren / findUnambiguousIntermediateAncestor — numbersMatch-gated positional fallbacks" },
        { module: "lib/covenant-engine.ts", why: "production answer path" },
        { module: "lib/contract-model/compiler/**", why: "the compiler under evaluation" },
        { module: "lib/contract-model/service.ts", why: "the production service under evaluation" },
      ],
      enforcement: {
        test: "tests/evaluation-v2/import-boundary.test.ts",
        checks: [
          "no file under lib/contract-model/evaluation-v2/** imports any forbidden module (import / require / dynamic import)",
          "no file references the historical matching FUNCTION names, even reimplemented under a different name",
          "the ground-truth loader reads only frozen answer-key artifacts",
          "no engine module writes to disk; only the runner subtree writes, and never into a frozen artifact path",
        ],
      },
      whatTheEvaluatorNeverDoes: [
        "It never reads a coverage state, a dangerous-unaccounted flag or a discovery reviewStatus as evidence that a GROUND-TRUTH CLAIM is covered. Those are only ever read as the self-report of a specific candidate, and they count for a claim only when that candidate independently passes semantic correspondence with it.",
        "It never uses a section number, a parent/child relation, an ancestor relation, a nearby figure, or a neighbouring unit's materiality to grant credit.",
        "It never lets the semantic judge decide an aggregate number.",
        "It never edits ground truth, a historical scorer artifact, a phase report, or any production module.",
      ],
    }),
  );

  return written;
}

if (process.argv[1] && process.argv[1].endsWith("write-spec.ts")) {
  for (const a of writeSpecArtifacts(process.cwd())) console.log(`  wrote ${a.path} (${a.bytes} bytes)`);
}
