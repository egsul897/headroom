/**
 * Human-authored example catalog for the source-to-covenant dataset.
 *
 * SAFETY:
 * - Labels are authored from direct reading of authentic SEC fixture text.
 * - Compiler / verifier outputs are NOT consulted and are NOT ground truth.
 * - MODEL_HYPOTHESIS / HUMAN_HYPOTHESIS / UNRESOLVED / UNSUPPORTED statuses
 *   are first-class — never auto-promoted to HUMAN_SOURCE_VERIFIED.
 */
import type {
  CandidateOutput,
  ExamplePolarity,
  ExampleRole,
  OperativeVersionIdentity,
  PermissionProhibitionClass,
  SourceDocumentIdentity,
  SplitBucket,
  StructuralIdentity,
} from "./types";

export type WindowExtractor =
  | {
      kind: "regex";
      sourceFixturePath: string;
      startRe: string;
      endRe: string | null;
      occurrence?: number;
      maxLen?: number;
    }
  | {
      kind: "anchor";
      sourceFixturePath: string;
      anchor: string;
      back: number;
      forward: number;
      occurrence?: number;
    }
  | {
      kind: "literal";
      sourceFixturePath: string;
      /** Literal controlling text embedded when the fixture window is intentionally tiny (e.g. [Reserved]). */
      exactText: string;
      sourceTextSha256FromFixture?: boolean;
    };

export interface ExampleSpec {
  exampleId: string;
  polarity: ExamplePolarity;
  role: ExampleRole;
  split: SplitBucket;
  document: SourceDocumentIdentity;
  operativeVersion: OperativeVersionIdentity;
  structural: StructuralIdentity;
  governingProhibition: string | null;
  window: WindowExtractor;
  /** Definition excerpts pulled from a defs fixture (term start → maxLen). */
  definitionPulls?: Array<{ sourceFixturePath: string; termStart: string; maxLen?: number; key: string }>;
  inputExceptions?: string[];
  inputConditions?: string[];
  inputCrossReferences?: string[];
  entityScopeNotes?: string[];
  output: Omit<CandidateOutput, "candidatePermissionProhibitionClass"> & {
    candidatePermissionProhibitionClass: PermissionProhibitionClass;
  };
  authoringMethod: "HUMAN_SOURCE_READING" | "HUMAN_SOURCE_READING_PLUS_CATALOG" | "SYNTHETIC_NEGATIVE";
  authoredAt: string;
}

const LSB_DOC: SourceDocumentIdentity = {
  issuerId: "lsb-industries",
  issuerName: "LSB Industries, Inc.",
  instrumentKey: "lsb-2023-abl-credit-agreement",
  documentId: "lsb-doc-a-abl-credit-agreement-2023",
  sourceFixturePath: "tests/fixtures/unseen-packages/lsb-2023-abl-credit-agreement/article-6-negative-covenants.txt",
  filingAccession: "0001193125-23-303035",
  cik: "0000060714",
  exhibit: "EX-10.1",
  agreementDate: "2023-12-21",
  sourceUrl: "https://www.sec.gov/Archives/edgar/data/60714/000119312523303035/",
};

const FWRG_DOC: SourceDocumentIdentity = {
  issuerId: "fwrg",
  issuerName: "First Watch Restaurant Group, Inc.",
  instrumentKey: "fwrg-2021-credit-agreement",
  documentId: "fwrg-doc-a-credit-agreement-2021",
  sourceFixturePath: "tests/fixtures/unseen-packages/fwrg-2021-credit-agreement/article-6-negative-covenants.txt",
  filingAccession: "0001193125-21-293207",
  cik: "0001789940",
  exhibit: "EX-10.1",
  agreementDate: "2021-10-06",
  sourceUrl: "https://www.sec.gov/Archives/edgar/data/1789940/000119312521293207/d212487dex101.htm",
};

const CONMED_DOC: SourceDocumentIdentity = {
  issuerId: "conmed",
  issuerName: "CONMED Corporation",
  instrumentKey: "conmed-eighth-ar-credit-agreement",
  documentId: "conmed-doc-a-eighth-ar-credit-agreement",
  sourceFixturePath: "tests/fixtures/unseen-packages/conmed-2025-credit-facility/curated/base-credit-agreement-article-vii-negative-covenants.txt",
  cik: "0000816956",
  exhibit: "EX-10.1",
  agreementDate: "2025-06-16",
};

const CONMED_AMD: SourceDocumentIdentity = {
  ...CONMED_DOC,
  documentId: "conmed-doc-c-second-amendment-2022",
  sourceFixturePath: "tests/fixtures/unseen-packages/conmed-2025-credit-facility/curated/second-amendment-2022-full.txt",
  agreementDate: "2022-08-02",
  exhibit: "EX-10.2",
};

const DSGR_DOC: SourceDocumentIdentity = {
  issuerId: "dsgr",
  issuerName: "Distribution Solutions Group, Inc.",
  instrumentKey: "dsgr-2022-2025-credit-facility",
  documentId: "dsgr-doc-c-fourth-amendment-2025",
  sourceFixturePath: "tests/fixtures/unseen-packages/dsgr-2022-2025-credit-facility/extracted-text/doc-c-2025-fourth-amendment.txt",
  agreementDate: "2025-03-31",
};

const CHWY_DOC: SourceDocumentIdentity = {
  issuerId: "chewy",
  issuerName: "Chewy, Inc.",
  instrumentKey: "chwy-2026-credit-agreement",
  documentId: "chwy-doc-a-credit-agreement-2026",
  sourceFixturePath: "tests/fixtures/unseen-packages/chwy-2026-credit-agreement/extracted-text/doc-a-2026-06-23-credit-agreement.txt",
  agreementDate: "2026-06-23",
};

const GIB_DOC: SourceDocumentIdentity = {
  issuerId: "gibraltar",
  issuerName: "Gibraltar Industries, Inc.",
  instrumentKey: "gibraltar-2026-credit-agreement",
  documentId: "gibraltar-doc-a-credit-agreement-2026",
  sourceFixturePath: "tests/fixtures/unseen-packages/gibraltar-2026-credit-agreement/extracted-text/credit-agreement.txt",
  filingAccession: "0001140361-26-003087",
  cik: "0000912562",
  exhibit: "EX-10.1",
  agreementDate: "2026-02-02",
  sourceUrl: "https://www.sec.gov/Archives/edgar/data/912562/000114036126003087/ef20064499_ex10-1.htm",
};

const RIOT_DOC: SourceDocumentIdentity = {
  issuerId: "riot-platforms",
  issuerName: "Riot Platforms, Inc.",
  instrumentKey: "riot-2025-2026-credit-facility",
  documentId: "riot-doc-c-second-ar-credit-agreement-2026",
  sourceFixturePath: "tests/fixtures/unseen-packages/riot-2025-2026-credit-facility/extracted-text/doc-c-2026-04-21-second-amended-restated-credit-agreement.txt",
  agreementDate: "2026-04-21",
};

const AUTH = "2026-10-08T00:00:00.000Z";

function baseOutput(partial: CandidateOutput): CandidateOutput {
  return partial;
}

export const EXAMPLE_CATALOG: ExampleSpec[] = [
  // ---------- LSB train ----------
  {
    exampleId: "stc-lsb-6.01-chapeau-ratio-gated",
    polarity: "POSITIVE",
    role: "OPERATIVE_COVENANT",
    split: "train",
    document: LSB_DOC,
    operativeVersion: {
      operativeDocumentId: LSB_DOC.documentId,
      asOfDate: "2023-12-21",
      amendmentIdentity: null,
      isRestatedOperativeText: false,
    },
    structural: { sectionRef: "6.01", sourceNodeKey: null, articleRef: "ARTICLE VI", unitKind: "OPERATIVE_COVENANT" },
    governingProhibition: "Create, incur, assume, permit, guarantee, or otherwise become or remain liable with respect to any Indebtedness",
    window: {
      kind: "regex",
      sourceFixturePath: LSB_DOC.sourceFixturePath,
      startRe: String.raw`SECTION\s+6\.01`,
      endRe: String.raw`SECTION\s+6\.02`,
    },
    definitionPulls: [
      {
        key: "Payment Conditions",
        sourceFixturePath: "tests/fixtures/unseen-packages/lsb-2023-abl-credit-agreement/definitions-excerpt.txt",
        termStart: "Payment Conditions",
        maxLen: 1400,
      },
    ],
    inputExceptions: ["6.01(a)–(t) enumerated carve-outs"],
    inputConditions: ["Fixed Charge Coverage Ratio > 2.0:1.0", "Payment Conditions satisfied"],
    inputCrossReferences: ["Payment Conditions", "Fixed Charge Coverage Ratio", "Schedule 6.01"],
    entityScopeNotes: ["Loan Parties and their respective Subsidiaries"],
    output: baseOutput({
      candidateCovenantFamily: "INDEBTEDNESS",
      candidatePermissionProhibitionClass: "PERMISSION",
      proposedFormulaOrCapacity: {
        shape: "UNLIMITED_CAPACITY_GATED",
        description: "Uncapped Indebtedness permission unlocked only if FCCR > 2.0x and Payment Conditions are satisfied; enumerated exceptions follow separately.",
        figures: ["2.0:1.0 Fixed Charge Coverage Ratio"],
        capacityUnlimited: true,
      },
      proposedConditions: [
        { conditionType: "RATIO_SATISFIED", description: "FCCR > 2.0:1.0 for most recently ended four full fiscal quarters after giving effect", status: "PROPOSED" },
        { conditionType: "OTHER_RULE_SATISFIED", description: "Payment Conditions satisfied with respect to such incurrence", status: "PROPOSED" },
      ],
      proposedDependencyEdges: [
        { edgeType: "REQUIRES", targetRef: "Payment Conditions", description: "Compound liquidity/no-default/certificate gate" },
        { edgeType: "REQUIRES", targetRef: "Fixed Charge Coverage Ratio", description: "Ratio metric definition" },
      ],
      missingInputs: ["Current FCCR financial facts", "Specified Availability / Revolving Commitment for Payment Conditions"],
      uncertainty: { level: "LOW", reasons: ["Operative gate language is explicit in the chapeau"] },
      verificationStatus: "HUMAN_SOURCE_VERIFIED",
      labelNotes: "Independent source reading of LSB Article VI §6.01 chapeau. Not derived from compiler output.",
    }),
    authoringMethod: "HUMAN_SOURCE_READING",
    authoredAt: AUTH,
  },
  {
    exampleId: "stc-lsb-6.01-i-greater-of-assets",
    polarity: "POSITIVE",
    role: "EXCEPTION_BASKET",
    split: "train",
    document: LSB_DOC,
    operativeVersion: {
      operativeDocumentId: LSB_DOC.documentId,
      asOfDate: "2023-12-21",
      amendmentIdentity: null,
      isRestatedOperativeText: false,
    },
    structural: { sectionRef: "6.01(i)", sourceNodeKey: null, articleRef: "ARTICLE VI", unitKind: "EXCEPTION_BASKET" },
    governingProhibition: "Create, incur, assume, permit, guarantee, or otherwise become or remain liable with respect to any Indebtedness",
    window: {
      kind: "regex",
      sourceFixturePath: LSB_DOC.sourceFixturePath,
      startRe: String.raw`SECTION\s+6\.01`,
      endRe: String.raw`SECTION\s+6\.02`,
    },
    inputExceptions: ["6.01(i) other Indebtedness basket"],
    inputConditions: [],
    inputCrossReferences: ["GAAP"],
    entityScopeNotes: ["Loan Parties and their Subsidiaries"],
    output: baseOutput({
      candidateCovenantFamily: "INDEBTEDNESS",
      candidatePermissionProhibitionClass: "PERMISSION",
      proposedFormulaOrCapacity: {
        shape: "GREATER_OF_FLAT_OR_PCT_TOTAL_ASSETS",
        description: "Aggregate principal amount outstanding at any time not to exceed the greater of $70,000,000 and 5.5% of total consolidated assets per GAAP balance sheet.",
        figures: ["$70,000,000", "5.5% of total consolidated assets"],
        capacityUnlimited: false,
      },
      proposedConditions: [],
      proposedDependencyEdges: [
        { edgeType: "EXCEPTION_TO", targetRef: "6.01 chapeau", description: "Enumerated exception to general Indebtedness limitation" },
      ],
      missingInputs: ["Total consolidated assets of the Loan Parties and their Subsidiaries"],
      uncertainty: {
        level: "MEDIUM",
        reasons: ["Percentage base is total consolidated assets, not EBITDA — ontology fit may stretch existing GREATER_OF_FLAT_OR_PCT_EBITDA naming"],
      },
      verificationStatus: "HUMAN_SOURCE_VERIFIED",
      labelNotes: "Figures and asset base verified against LSB §6.01(i) source text.",
    }),
    authoringMethod: "HUMAN_SOURCE_READING",
    authoredAt: AUTH,
  },
  {
    exampleId: "stc-lsb-6.02-liens-prohibition",
    polarity: "POSITIVE",
    role: "OPERATIVE_COVENANT",
    split: "train",
    document: LSB_DOC,
    operativeVersion: {
      operativeDocumentId: LSB_DOC.documentId,
      asOfDate: "2023-12-21",
      amendmentIdentity: null,
      isRestatedOperativeText: false,
    },
    structural: { sectionRef: "6.02", sourceNodeKey: null, articleRef: "ARTICLE VI", unitKind: "OPERATIVE_COVENANT" },
    governingProhibition: "Create, incur, assume, or permit to exist any Lien on or with respect to any of its assets",
    window: {
      kind: "regex",
      sourceFixturePath: LSB_DOC.sourceFixturePath,
      startRe: String.raw`SECTION\s+6\.02`,
      endRe: String.raw`SECTION\s+6\.03`,
    },
    inputExceptions: ["Permitted Liens", "replacement Liens for refinanced 6.01(d) debt"],
    inputConditions: [],
    inputCrossReferences: ["Permitted Liens", "Section 6.01(d)"],
    entityScopeNotes: ["Loan Party assets"],
    output: baseOutput({
      candidateCovenantFamily: "LIENS",
      candidatePermissionProhibitionClass: "PROHIBITION",
      proposedFormulaOrCapacity: {
        shape: null,
        description: "General Lien prohibition subject only to Permitted Liens (including replacement liens for refinanced §6.01(d) debt on the same assets).",
        figures: [],
        capacityUnlimited: null,
      },
      proposedConditions: [],
      proposedDependencyEdges: [
        { edgeType: "LIMITED_BY", targetRef: "Permitted Liens", description: "Definitional carve-out set" },
        { edgeType: "REFERENCES", targetRef: "6.01(d)", description: "Refinancing replacement-lien path" },
      ],
      missingInputs: ["Permitted Liens definition full text"],
      uncertainty: { level: "LOW", reasons: ["Prohibition and exception pointer are explicit"] },
      verificationStatus: "HUMAN_SOURCE_VERIFIED",
      labelNotes: "Verified against LSB §6.02 source.",
    }),
    authoringMethod: "HUMAN_SOURCE_READING",
    authoredAt: AUTH,
  },
  {
    exampleId: "stc-lsb-6.11-restricted-payments",
    polarity: "POSITIVE",
    role: "OPERATIVE_COVENANT",
    split: "dev",
    document: LSB_DOC,
    operativeVersion: {
      operativeDocumentId: LSB_DOC.documentId,
      asOfDate: "2023-12-21",
      amendmentIdentity: null,
      isRestatedOperativeText: false,
    },
    structural: { sectionRef: "6.11", sourceNodeKey: null, articleRef: "ARTICLE VI", unitKind: "OPERATIVE_COVENANT" },
    governingProhibition: "Make any distribution or declare or pay any dividends ... or purchase, acquire, redeem, or retire any of any Loan Party's Stock",
    window: {
      kind: "regex",
      sourceFixturePath: LSB_DOC.sourceFixturePath,
      startRe: String.raw`SECTION\s+6\.11`,
      endRe: String.raw`SECTION\s+6\.12`,
    },
    definitionPulls: [
      {
        key: "Payment Conditions",
        sourceFixturePath: "tests/fixtures/unseen-packages/lsb-2023-abl-credit-agreement/definitions-excerpt.txt",
        termStart: "Payment Conditions",
        maxLen: 1400,
      },
    ],
    inputExceptions: ["6.11(a)–(listed carve-outs including Payment Conditions path)"],
    inputConditions: ["Payment Conditions for certain RP paths"],
    inputCrossReferences: ["Section 6.03", "Payment Conditions"],
    entityScopeNotes: ["Loan Parties"],
    output: baseOutput({
      candidateCovenantFamily: "RESTRICTED_PAYMENTS",
      candidatePermissionProhibitionClass: "PROHIBITION",
      proposedFormulaOrCapacity: {
        shape: "PROHIBITION_WITH_ENUMERATED_EXCEPTIONS",
        description: "General Restricted Payment prohibition with enumerated exceptions; some exceptions gated by Payment Conditions.",
        figures: [],
        capacityUnlimited: null,
      },
      proposedConditions: [
        { conditionType: "OTHER_RULE_SATISFIED", description: "Payment Conditions on applicable RP baskets", status: "PROPOSED" },
      ],
      proposedDependencyEdges: [
        { edgeType: "REQUIRES", targetRef: "Payment Conditions", description: "Shared compound gate across RP and other baskets" },
      ],
      missingInputs: ["Full enumeration of each RP exception limb economics"],
      uncertainty: { level: "MEDIUM", reasons: ["Multiple exception limbs; not every dollar figure isolated in this window alone"] },
      verificationStatus: "HUMAN_SOURCE_VERIFIED",
      labelNotes: "Dev-split example; family/prohibition posture verified from §6.11 source.",
    }),
    authoringMethod: "HUMAN_SOURCE_READING",
    authoredAt: AUTH,
  },
  {
    exampleId: "stc-lsb-payment-conditions-definition",
    polarity: "POSITIVE",
    role: "DEFINITION",
    split: "train",
    document: {
      ...LSB_DOC,
      sourceFixturePath: "tests/fixtures/unseen-packages/lsb-2023-abl-credit-agreement/definitions-excerpt.txt",
    },
    operativeVersion: {
      operativeDocumentId: LSB_DOC.documentId,
      asOfDate: "2023-12-21",
      amendmentIdentity: null,
      isRestatedOperativeText: false,
    },
    structural: { sectionRef: "1.01/Payment Conditions", sourceNodeKey: null, articleRef: "ARTICLE I", unitKind: "DEFINITION" },
    governingProhibition: null,
    window: {
      kind: "anchor",
      sourceFixturePath: "tests/fixtures/unseen-packages/lsb-2023-abl-credit-agreement/definitions-excerpt.txt",
      anchor: "Payment Conditions",
      back: 0,
      forward: 1400,
    },
    inputExceptions: [],
    inputConditions: ["no Default", "Specified Availability greater of 20% Revolving Commitment and $13,000,000 over 30-day window", "officer certificate"],
    inputCrossReferences: ["Payment Condition Transaction", "Specified Availability", "Revolving Commitment"],
    entityScopeNotes: ["Borrowers"],
    output: baseOutput({
      candidateCovenantFamily: "DEFINITIONS_CALCULATION_RULES",
      candidatePermissionProhibitionClass: "DEFINITION",
      proposedFormulaOrCapacity: {
        shape: "COMPOUND_CONDITION_DEFINITION",
        description: "Payment Conditions = no Default + Specified Availability ≥ greater of 20% Revolving Commitment and $13,000,000 (pro forma, 30-day lookback) + delivery of certificate.",
        figures: ["20% of the Revolving Commitment", "$13,000,000"],
        capacityUnlimited: null,
      },
      proposedConditions: [
        { conditionType: "NO_DEFAULT", description: "no Default continuing or resulting", status: "PROPOSED" },
        { conditionType: "MINIMUM_LIQUIDITY", description: "Specified Availability ≥ max(20% Revolving Commitment, $13,000,000)", status: "PROPOSED" },
      ],
      proposedDependencyEdges: [
        { edgeType: "PARAMETER_OF", targetRef: "multiple Article VI baskets", description: "Shared gate referenced by debt/RP/investment paths" },
      ],
      missingInputs: ["Specified Availability computation inputs", "Revolving Commitment amount"],
      uncertainty: { level: "LOW", reasons: ["Definition text is self-contained in the excerpt"] },
      verificationStatus: "HUMAN_SOURCE_VERIFIED",
      labelNotes: "Definition-only positive example; no WireRule/permission attaches from the definition alone.",
    }),
    authoringMethod: "HUMAN_SOURCE_READING",
    authoredAt: AUTH,
  },

  // ---------- FWRG train/dev ----------
  {
    exampleId: "stc-fwrg-6.01-chapeau-prohibition",
    polarity: "POSITIVE",
    role: "OPERATIVE_COVENANT",
    split: "train",
    document: FWRG_DOC,
    operativeVersion: {
      operativeDocumentId: FWRG_DOC.documentId,
      asOfDate: "2021-10-06",
      amendmentIdentity: null,
      isRestatedOperativeText: false,
    },
    structural: { sectionRef: "6.01", sourceNodeKey: null, articleRef: "ARTICLE VI", unitKind: "OPERATIVE_COVENANT" },
    governingProhibition: "The Borrower shall not, nor shall it permit any of its Restricted Subsidiaries to create, incur, assume or otherwise become or remain liable with respect to any Indebtedness, except:",
    window: {
      kind: "regex",
      sourceFixturePath: FWRG_DOC.sourceFixturePath,
      startRe: String.raw`Section 6\.01\. Indebtedness`,
      endRe: null,
      maxLen: 8500,
    },
    inputExceptions: ["6.01(a) et seq. enumerated permissions"],
    inputConditions: [],
    inputCrossReferences: ["Secured Obligations", "Restricted Subsidiary", "Holdings"],
    entityScopeNotes: ["Borrower and Restricted Subsidiaries; some baskets further limit to non-Loan Party Restricted Subsidiaries"],
    output: baseOutput({
      candidateCovenantFamily: "INDEBTEDNESS",
      candidatePermissionProhibitionClass: "PROHIBITION",
      proposedFormulaOrCapacity: {
        shape: "PROHIBITION_WITH_ENUMERATED_EXCEPTIONS",
        description: "General Indebtedness prohibition on Borrower/Restricted Subsidiaries subject to lettered exceptions.",
        figures: [],
        capacityUnlimited: null,
      },
      proposedConditions: [],
      proposedDependencyEdges: [],
      missingInputs: [],
      uncertainty: { level: "LOW", reasons: ["Chapeau prohibition is explicit"] },
      verificationStatus: "HUMAN_SOURCE_VERIFIED",
      labelNotes: "Verified from FWRG §6.01 opening prohibition.",
    }),
    authoringMethod: "HUMAN_SOURCE_READING",
    authoredAt: AUTH,
  },
  {
    exampleId: "stc-fwrg-6.01-g-i-guaranty-grower",
    polarity: "POSITIVE",
    role: "EXCEPTION_BASKET",
    split: "train",
    document: FWRG_DOC,
    operativeVersion: {
      operativeDocumentId: FWRG_DOC.documentId,
      asOfDate: "2021-10-06",
      amendmentIdentity: null,
      isRestatedOperativeText: false,
    },
    structural: { sectionRef: "6.01(g)(i)", sourceNodeKey: null, articleRef: "ARTICLE VI", unitKind: "EXCEPTION_BASKET" },
    governingProhibition: "The Borrower shall not, nor shall it permit any of its Restricted Subsidiaries to create, incur, assume or otherwise become or remain liable with respect to any Indebtedness, except:",
    window: {
      kind: "anchor",
      sourceFixturePath: FWRG_DOC.sourceFixturePath,
      anchor: "$2,500,000",
      back: 420,
      forward: 480,
    },
    inputExceptions: ["6.01(g)(i) supplier/customer/franchisee/licensee guaranties"],
    inputConditions: ["ordinary course"],
    inputCrossReferences: ["Consolidated Adjusted EBITDA"],
    entityScopeNotes: ["Borrower and/or any Restricted Subsidiary"],
    output: baseOutput({
      candidateCovenantFamily: "INDEBTEDNESS",
      candidatePermissionProhibitionClass: "PERMISSION",
      proposedFormulaOrCapacity: {
        shape: "GREATER_OF_FLAT_OR_PCT_EBITDA",
        description: "Guaranties of supplier/customer/franchisee/licensee obligations in the ordinary course, capped at the greater of $2,500,000 and 5% of Consolidated Adjusted EBITDA.",
        figures: ["$2,500,000", "5% of Consolidated Adjusted EBITDA"],
        capacityUnlimited: false,
      },
      proposedConditions: [
        { conditionType: "UNSUPPORTED", description: "ordinary course of business qualifier", status: "UNSUPPORTED" },
      ],
      proposedDependencyEdges: [
        { edgeType: "REQUIRES", targetRef: "Consolidated Adjusted EBITDA", description: "Grower metric" },
      ],
      missingInputs: ["Consolidated Adjusted EBITDA"],
      uncertainty: { level: "LOW", reasons: ["Dollar/% figures explicit in source window"] },
      verificationStatus: "HUMAN_SOURCE_VERIFIED",
      labelNotes: "Grower basket verified from FWRG source around $2,500,000 guaranty limb.",
    }),
    authoringMethod: "HUMAN_SOURCE_READING",
    authoredAt: AUTH,
  },
  {
    exampleId: "stc-fwrg-6.04-a-x-rp-grower",
    polarity: "POSITIVE",
    role: "EXCEPTION_BASKET",
    split: "train",
    document: FWRG_DOC,
    operativeVersion: {
      operativeDocumentId: FWRG_DOC.documentId,
      asOfDate: "2021-10-06",
      amendmentIdentity: null,
      isRestatedOperativeText: false,
    },
    structural: { sectionRef: "6.04(a)(x)", sourceNodeKey: null, articleRef: "ARTICLE VI", unitKind: "EXCEPTION_BASKET" },
    governingProhibition: "Restricted Payments general prohibition (Section 6.04)",
    window: {
      kind: "anchor",
      sourceFixturePath: FWRG_DOC.sourceFixturePath,
      anchor: "$21,000,000",
      back: 520,
      forward: 520,
    },
    inputExceptions: ["6.04(a)(x)"],
    inputConditions: ["no continuing Event of Default"],
    inputCrossReferences: ["Consolidated Adjusted EBITDA", "Event of Default"],
    entityScopeNotes: ["Borrower / Restricted Subsidiaries per §6.04"],
    output: baseOutput({
      candidateCovenantFamily: "RESTRICTED_PAYMENTS",
      candidatePermissionProhibitionClass: "PERMISSION",
      proposedFormulaOrCapacity: {
        shape: "GREATER_OF_FLAT_OR_PCT_EBITDA",
        description: "Restricted Payments up to the greater of $21,000,000 and 35% of Consolidated Adjusted EBITDA, conditioned on no continuing Event of Default.",
        figures: ["$21,000,000", "35% of Consolidated Adjusted EBITDA"],
        capacityUnlimited: false,
      },
      proposedConditions: [
        { conditionType: "NO_DEFAULT", description: "no continuing Event of Default", status: "PROPOSED" },
      ],
      proposedDependencyEdges: [
        { edgeType: "REQUIRES", targetRef: "Consolidated Adjusted EBITDA", description: "Grower metric" },
      ],
      missingInputs: ["Consolidated Adjusted EBITDA", "Event of Default status"],
      uncertainty: { level: "LOW", reasons: [] },
      verificationStatus: "HUMAN_SOURCE_VERIFIED",
      labelNotes: "Verified from FWRG §6.04(a)(x) source window.",
    }),
    authoringMethod: "HUMAN_SOURCE_READING",
    authoredAt: AUTH,
  },
  {
    exampleId: "stc-fwrg-6.04-a-xi-ratio-unlimited",
    polarity: "POSITIVE",
    role: "EXCEPTION_BASKET",
    split: "dev",
    document: FWRG_DOC,
    operativeVersion: {
      operativeDocumentId: FWRG_DOC.documentId,
      asOfDate: "2021-10-06",
      amendmentIdentity: null,
      isRestatedOperativeText: false,
    },
    structural: { sectionRef: "6.04(a)(xi)", sourceNodeKey: null, articleRef: "ARTICLE VI", unitKind: "EXCEPTION_BASKET" },
    governingProhibition: "Restricted Payments general prohibition (Section 6.04)",
    window: {
      kind: "anchor",
      sourceFixturePath: FWRG_DOC.sourceFixturePath,
      anchor: "3.50",
      back: 520,
      forward: 520,
    },
    inputExceptions: ["6.04(a)(xi)"],
    inputConditions: ["Total Rent Adjusted Net Leverage Ratio ≤ 3.50:1.00 on Pro Forma Basis"],
    inputCrossReferences: ["Total Rent Adjusted Net Leverage Ratio", "Pro Forma Basis"],
    entityScopeNotes: ["Borrower / Restricted Subsidiaries per §6.04"],
    output: baseOutput({
      candidateCovenantFamily: "RESTRICTED_PAYMENTS",
      candidatePermissionProhibitionClass: "PERMISSION",
      proposedFormulaOrCapacity: {
        shape: "RATIO_GATED_UNLIMITED",
        description: "Unlimited Restricted Payments so long as Total Rent Adjusted Net Leverage Ratio, calculated Pro Forma, would not exceed 3.50:1.00.",
        figures: ["3.50:1.00 Total Rent Adjusted Net Leverage Ratio"],
        capacityUnlimited: true,
      },
      proposedConditions: [
        { conditionType: "RATIO_SATISFIED", description: "Total Rent Adjusted Net Leverage Ratio ≤ 3.50:1.00 Pro Forma", status: "PROPOSED" },
      ],
      proposedDependencyEdges: [
        { edgeType: "REQUIRES", targetRef: "Total Rent Adjusted Net Leverage Ratio", description: "Ratio definition + components" },
      ],
      missingInputs: ["Total Rent Adjusted Net Leverage Ratio inputs"],
      uncertainty: { level: "LOW", reasons: [] },
      verificationStatus: "HUMAN_SOURCE_VERIFIED",
      labelNotes: "Verified from FWRG §6.04(a)(xi) source window.",
    }),
    authoringMethod: "HUMAN_SOURCE_READING",
    authoredAt: AUTH,
  },
  {
    exampleId: "stc-fwrg-available-amount-builder",
    polarity: "POSITIVE",
    role: "DEFINITION",
    split: "train",
    document: {
      ...FWRG_DOC,
      sourceFixturePath: "tests/fixtures/unseen-packages/fwrg-2021-credit-agreement/definitions-excerpt.txt",
    },
    operativeVersion: {
      operativeDocumentId: FWRG_DOC.documentId,
      asOfDate: "2021-10-06",
      amendmentIdentity: null,
      isRestatedOperativeText: false,
    },
    structural: { sectionRef: "1.01/Available Amount", sourceNodeKey: null, articleRef: "ARTICLE I", unitKind: "DEFINITION" },
    governingProhibition: null,
    window: {
      kind: "anchor",
      sourceFixturePath: "tests/fixtures/unseen-packages/fwrg-2021-credit-agreement/definitions-excerpt.txt",
      anchor: "Available Amount",
      back: 0,
      forward: 3200,
    },
    inputExceptions: [],
    inputConditions: ["Total Rent Adjusted Net Leverage Ratio ≤ 4.50:1.00 for CNI Growth Amount availability", "Event of Default gates on certain RP reliance"],
    inputCrossReferences: ["CNI Growth Amount", "Section 6.04(a)(iii)(A)", "Section 7.01(a)/(f)/(g)", "Qualified Capital Stock", "Cure Amount"],
    entityScopeNotes: [],
    output: baseOutput({
      candidateCovenantFamily: "DEFINITIONS_CALCULATION_RULES",
      candidatePermissionProhibitionClass: "DEFINITION",
      proposedFormulaOrCapacity: {
        shape: "BUILDER_BASKET",
        description: "Cumulative Available Amount builder: CNI Growth Amount (ratio-gated) + Qualified Capital Stock proceeds Not Otherwise Applied + other builder components; deep nesting.",
        figures: ["4.50:1.00 Total Rent Adjusted Net Leverage Ratio gate on CNI Growth Amount"],
        capacityUnlimited: false,
      },
      proposedConditions: [
        { conditionType: "RATIO_SATISFIED", description: "TRALR ≤ 4.50:1.00 Pro Forma for CNI Growth Amount clause", status: "PROPOSED" },
        { conditionType: "NO_DEFAULT", description: "EOD gate when Available Amount used for certain RPs", status: "PROPOSED" },
      ],
      proposedDependencyEdges: [
        { edgeType: "BASKET_FEEDING", targetRef: "CNI Growth Amount", description: "Builder component" },
        { edgeType: "PARAMETER_OF", targetRef: "6.04(a)(iii)", description: "RP reliance path" },
      ],
      missingInputs: ["CNI Growth Amount mechanics", "historical builder usage ledger", "Not Otherwise Applied tracking"],
      uncertainty: {
        level: "HIGH",
        reasons: ["Deep multi-component builder; excerpt truncates full definition; several sub-clauses require additional defined terms"],
      },
      verificationStatus: "HUMAN_HYPOTHESIS",
      labelNotes: "Structure hypothesized from definitions excerpt; NOT fully verified end-to-end against every builder sub-clause. Must not be treated as approved semantic ground truth.",
    }),
    authoringMethod: "HUMAN_SOURCE_READING_PLUS_CATALOG",
    authoredAt: AUTH,
  },

  // ---------- CONMED ----------
  {
    exampleId: "stc-conmed-7.2-indebtedness",
    polarity: "POSITIVE",
    role: "OPERATIVE_COVENANT",
    split: "train",
    document: CONMED_DOC,
    operativeVersion: {
      operativeDocumentId: CONMED_DOC.documentId,
      asOfDate: "2025-06-16",
      amendmentIdentity: null,
      isRestatedOperativeText: true,
    },
    structural: { sectionRef: "7.2", sourceNodeKey: null, articleRef: "ARTICLE VII", unitKind: "OPERATIVE_COVENANT" },
    governingProhibition: "Create, incur, assume or suffer to exist any Indebtedness, except:",
    window: {
      kind: "regex",
      sourceFixturePath: CONMED_DOC.sourceFixturePath,
      startRe: String.raw`SECTION 7\.2 Limitation on Indebtedness`,
      endRe: String.raw`SECTION 7\.3 `,
    },
    inputExceptions: ["7.2(a) et seq."],
    inputConditions: [],
    inputCrossReferences: ["Loan Documents", "Early Maturing Debt"],
    entityScopeNotes: ["Parent Borrower and its Subsidiaries; Loan Party distinctions in exceptions"],
    output: baseOutput({
      candidateCovenantFamily: "INDEBTEDNESS",
      candidatePermissionProhibitionClass: "PROHIBITION",
      proposedFormulaOrCapacity: {
        shape: "PROHIBITION_WITH_ENUMERATED_EXCEPTIONS",
        description: "CONMED §7.2 Limitation on Indebtedness — general prohibition with lettered exceptions.",
        figures: [],
        capacityUnlimited: null,
      },
      proposedConditions: [],
      proposedDependencyEdges: [],
      missingInputs: ["Per-exception capacity figures when evaluating a specific basket"],
      uncertainty: { level: "LOW", reasons: ["Chapeau clear; exception economics require per-limb analysis"] },
      verificationStatus: "HUMAN_SOURCE_VERIFIED",
      labelNotes: "Verified from CONMED curated Article VII §7.2.",
    }),
    authoringMethod: "HUMAN_SOURCE_READING",
    authoredAt: AUTH,
  },
  {
    exampleId: "stc-conmed-7.8-investments",
    polarity: "POSITIVE",
    role: "OPERATIVE_COVENANT",
    split: "dev",
    document: CONMED_DOC,
    operativeVersion: {
      operativeDocumentId: CONMED_DOC.documentId,
      asOfDate: "2025-06-16",
      amendmentIdentity: null,
      isRestatedOperativeText: true,
    },
    structural: { sectionRef: "7.8", sourceNodeKey: null, articleRef: "ARTICLE VII", unitKind: "OPERATIVE_COVENANT" },
    governingProhibition: "Limitation on Investments, Loans and Advances",
    window: {
      kind: "regex",
      sourceFixturePath: CONMED_DOC.sourceFixturePath,
      startRe: String.raw`SECTION 7\.8 Limitation on Investments`,
      endRe: String.raw`SECTION 7\.9 `,
    },
    inputExceptions: ["7.8 lettered exceptions"],
    inputConditions: [],
    inputCrossReferences: [],
    entityScopeNotes: ["Parent Borrower and Subsidiaries; Loan Party / non-Loan Party distinctions in limbs"],
    output: baseOutput({
      candidateCovenantFamily: "INVESTMENTS",
      candidatePermissionProhibitionClass: "PROHIBITION",
      proposedFormulaOrCapacity: {
        shape: "PROHIBITION_WITH_ENUMERATED_EXCEPTIONS",
        description: "General Investments/loans/advances limitation with enumerated exceptions.",
        figures: [],
        capacityUnlimited: null,
      },
      proposedConditions: [],
      proposedDependencyEdges: [],
      missingInputs: ["Specific exception limb figures for capacity questions"],
      uncertainty: { level: "MEDIUM", reasons: ["Long multi-limb section; this record labels the governing prohibition family, not every basket"] },
      verificationStatus: "HUMAN_SOURCE_VERIFIED",
      labelNotes: "Family/prohibition verified from CONMED §7.8; per-basket formulas intentionally not auto-approved.",
    }),
    authoringMethod: "HUMAN_SOURCE_READING",
    authoredAt: AUTH,
  },
  {
    exampleId: "stc-conmed-7.7-reserved-negative",
    polarity: "NEGATIVE",
    role: "BOILERPLATE_OR_RESERVED",
    split: "train",
    document: CONMED_DOC,
    operativeVersion: {
      operativeDocumentId: CONMED_DOC.documentId,
      asOfDate: "2025-06-16",
      amendmentIdentity: null,
      isRestatedOperativeText: true,
    },
    structural: { sectionRef: "7.7", sourceNodeKey: null, articleRef: "ARTICLE VII", unitKind: "BOILERPLATE_OR_RESERVED" },
    governingProhibition: null,
    window: {
      kind: "literal",
      sourceFixturePath: CONMED_DOC.sourceFixturePath,
      exactText: "SECTION 7.7 [Reserved]\n",
      sourceTextSha256FromFixture: true,
    },
    inputExceptions: [],
    inputConditions: [],
    inputCrossReferences: [],
    entityScopeNotes: [],
    output: baseOutput({
      candidateCovenantFamily: null,
      candidatePermissionProhibitionClass: "NONE",
      proposedFormulaOrCapacity: {
        shape: null,
        description: "Reserved section — no operative permission or prohibition.",
        figures: [],
        capacityUnlimited: null,
      },
      proposedConditions: [],
      proposedDependencyEdges: [],
      missingInputs: [],
      uncertainty: { level: "LOW", reasons: [] },
      verificationStatus: "NOT_APPLICABLE",
      labelNotes: "Negative example: [Reserved] must not be compiled into a covenant rule.",
    }),
    authoringMethod: "SYNTHETIC_NEGATIVE",
    authoredAt: AUTH,
  },
  {
    exampleId: "stc-conmed-amd-2022-amendment-identity",
    polarity: "POSITIVE",
    role: "AMENDMENT_EFFECT",
    split: "train",
    document: CONMED_AMD,
    operativeVersion: {
      operativeDocumentId: CONMED_AMD.documentId,
      asOfDate: "2022-08-02",
      amendmentIdentity: "conmed-second-amendment-2022-08-02",
      isRestatedOperativeText: false,
    },
    structural: { sectionRef: "amendment-preamble", sourceNodeKey: null, articleRef: null, unitKind: "AMENDMENT_EFFECT" },
    governingProhibition: null,
    window: {
      kind: "anchor",
      sourceFixturePath: CONMED_AMD.sourceFixturePath,
      anchor: "SECOND AMENDMENT",
      back: 0,
      forward: 3200,
    },
    inputExceptions: [],
    inputConditions: ["effectiveness conditions in amendment"],
    inputCrossReferences: ["Credit Agreement being amended"],
    entityScopeNotes: [],
    output: baseOutput({
      candidateCovenantFamily: "AMENDMENT_WAIVER_CONSENT",
      candidatePermissionProhibitionClass: "AMENDMENT_MECHANIC",
      proposedFormulaOrCapacity: {
        shape: null,
        description: "Amendment identity / effectiveness mechanics — not itself a basket capacity rule.",
        figures: [],
        capacityUnlimited: null,
      },
      proposedConditions: [
        { conditionType: "UNSUPPORTED", description: "Amendment effectiveness conditions require full amendment body", status: "MISSING_INPUT" },
      ],
      proposedDependencyEdges: [
        { edgeType: "AMENDS", targetRef: "conmed base credit agreement", description: "Amendment relationship" },
      ],
      missingInputs: ["Full schedule of amended definitions/covenant text", "effectiveness certificate evidence"],
      uncertainty: { level: "HIGH", reasons: ["Window is preamble/front matter; operative amended covenant text may live later in the amendment"] },
      verificationStatus: "UNRESOLVED",
      labelNotes: "Unresolved example: amendment identity is clear, but operative covenant restatement content is not fully resolved from this preamble window alone.",
    }),
    authoringMethod: "HUMAN_SOURCE_READING",
    authoredAt: AUTH,
  },

  // ---------- DSGR ----------
  {
    exampleId: "stc-dsgr-fourth-amd-6.08-restatement",
    polarity: "POSITIVE",
    role: "AMENDMENT_EFFECT",
    split: "train",
    document: DSGR_DOC,
    operativeVersion: {
      operativeDocumentId: DSGR_DOC.documentId,
      asOfDate: "2025-03-31",
      amendmentIdentity: "dsgr-fourth-amendment-2025-03-31",
      isRestatedOperativeText: true,
    },
    structural: { sectionRef: "6.08(a)(v) (as restated)", sourceNodeKey: null, articleRef: null, unitKind: "AMENDMENT_EFFECT" },
    governingProhibition: "Restricted Payments limitation (Credit Agreement Section 6.08)",
    window: {
      kind: "anchor",
      sourceFixturePath: DSGR_DOC.sourceFixturePath,
      anchor: "Section 6.08(a)(v)",
      back: 500,
      forward: 2200,
    },
    inputExceptions: ["restated 6.08(a)(v) basket"],
    inputConditions: [],
    inputCrossReferences: ["Section 6.08", "Section 6.12", "Existing Credit Agreement"],
    entityScopeNotes: [],
    output: baseOutput({
      candidateCovenantFamily: "RESTRICTED_PAYMENTS",
      candidatePermissionProhibitionClass: "PERMISSION",
      proposedFormulaOrCapacity: {
        shape: "FLAT_CAP_AS_RESTATED",
        description: "Fourth Amendment restates §6.08(a)(v) Restricted Payments basket language (includes an aggregate amount not to exceed $25,000,000 in the restated text).",
        figures: ["$25,000,000"],
        capacityUnlimited: false,
      },
      proposedConditions: [],
      proposedDependencyEdges: [
        { edgeType: "AMENDS", targetRef: "Existing Credit Agreement Section 6.08(a)(v)", description: "Restatement operative effect" },
      ],
      missingInputs: ["Pre-amendment §6.08(a)(v) text for diff", "Fourth Amendment Effective Date satisfaction evidence"],
      uncertainty: { level: "MEDIUM", reasons: ["Restated operative language present; effectiveness conditions and deemed-effect dating need the full amendment"] },
      verificationStatus: "HUMAN_SOURCE_VERIFIED",
      labelNotes: "Restated RP basket figures verified from DSGR Fourth Amendment source window. Amendment identity recorded.",
    }),
    authoringMethod: "HUMAN_SOURCE_READING",
    authoredAt: AUTH,
  },
  {
    exampleId: "stc-dsgr-intercreditor-unsupported",
    polarity: "NEGATIVE",
    role: "UNSUPPORTED_SEMANTICS",
    split: "dev",
    document: {
      ...LSB_DOC,
      documentId: "lsb-doc-intercreditor-joinder-2023",
      sourceFixturePath: "tests/fixtures/unseen-packages/lsb-2023-abl-credit-agreement/intercreditor-joinder.txt",
      exhibit: "EX-10.3",
    },
    operativeVersion: {
      operativeDocumentId: "lsb-doc-intercreditor-joinder-2023",
      asOfDate: "2023-12-21",
      amendmentIdentity: "lsb-intercreditor-joinder-2023-12-21",
      isRestatedOperativeText: false,
    },
    structural: { sectionRef: "joinder", sourceNodeKey: null, articleRef: null, unitKind: "UNSUPPORTED_SEMANTICS" },
    governingProhibition: null,
    window: {
      kind: "anchor",
      sourceFixturePath: "tests/fixtures/unseen-packages/lsb-2023-abl-credit-agreement/intercreditor-joinder.txt",
      anchor: "Joinder",
      back: 0,
      forward: 3500,
    },
    inputExceptions: [],
    inputConditions: [],
    inputCrossReferences: ["Intercreditor Agreement dated August 7, 2013", "ABL Priority Collateral", "Notes Priority Collateral"],
    entityScopeNotes: [],
    output: baseOutput({
      candidateCovenantFamily: null,
      candidatePermissionProhibitionClass: "NONE",
      proposedFormulaOrCapacity: {
        shape: null,
        description: "Intercreditor joinder / priority mechanics are not a negative-covenant basket representation in the current IR target set.",
        figures: [],
        capacityUnlimited: null,
      },
      proposedConditions: [],
      proposedDependencyEdges: [
        { edgeType: "UNRESOLVED_EXTERNAL", targetRef: "2013 Intercreditor Agreement (not in fixture)", description: "Underlying ICA not filed in this package" },
      ],
      missingInputs: ["Full 2013 Intercreditor Agreement text", "Notes indenture"],
      uncertainty: { level: "UNRESOLVED", reasons: ["Cross-document priority semantics cannot be compiled from the joinder alone"] },
      verificationStatus: "UNSUPPORTED",
      labelNotes: "Unsupported-semantics / unresolved external authority example. Negative for covenant-family compilation.",
    }),
    authoringMethod: "HUMAN_SOURCE_READING",
    authoredAt: AUTH,
  },

  // Model hypothesis (explicitly not verified) — same LSB 6.01(i) window, alternate/wrong ontology stretch call
  {
    exampleId: "stc-lsb-6.01-i-model-hypothesis-contrast",
    polarity: "POSITIVE",
    role: "EXCEPTION_BASKET",
    split: "dev",
    document: LSB_DOC,
    operativeVersion: {
      operativeDocumentId: LSB_DOC.documentId,
      asOfDate: "2023-12-21",
      amendmentIdentity: null,
      isRestatedOperativeText: false,
    },
    structural: { sectionRef: "6.01(i)", sourceNodeKey: null, articleRef: "ARTICLE VI", unitKind: "EXCEPTION_BASKET" },
    governingProhibition: "Create, incur, assume, permit, guarantee, or otherwise become or remain liable with respect to any Indebtedness",
    window: {
      kind: "regex",
      sourceFixturePath: LSB_DOC.sourceFixturePath,
      startRe: String.raw`SECTION\s+6\.01`,
      endRe: String.raw`SECTION\s+6\.02`,
    },
    inputExceptions: ["6.01(i)"],
    inputConditions: [],
    inputCrossReferences: [],
    entityScopeNotes: ["Loan Parties and their Subsidiaries"],
    output: baseOutput({
      candidateCovenantFamily: "INDEBTEDNESS",
      candidatePermissionProhibitionClass: "PERMISSION",
      proposedFormulaOrCapacity: {
        shape: "GREATER_OF_FLAT_OR_PCT_EBITDA",
        description: "MODEL HYPOTHESIS (intentionally not approved): treats the 5.5% limb as % of EBITDA rather than total consolidated assets.",
        figures: ["$70,000,000", "5.5%"],
        capacityUnlimited: false,
      },
      proposedConditions: [],
      proposedDependencyEdges: [],
      missingInputs: ["Metric base confirmation"],
      uncertainty: {
        level: "HIGH",
        reasons: ["Hypothesis mis-states the percentage base vs source (assets vs EBITDA) — retained as contrastive MODEL_HYPOTHESIS, not ground truth"],
      },
      verificationStatus: "MODEL_HYPOTHESIS",
      labelNotes: "Contrastive hypothesis deliberately NOT verified. Exists to train/evaluate refusal to auto-approve compiler-like mistakes. Must never be promoted without human source re-verification.",
    }),
    authoringMethod: "HUMAN_SOURCE_READING_PLUS_CATALOG",
    authoredAt: AUTH,
  },

  // Near-duplicate of LSB 6.02 for dedup detection (dev) — same window, different example id / notes
  {
    exampleId: "stc-lsb-6.02-liens-prohibition-near-dup-probe",
    polarity: "POSITIVE",
    role: "OPERATIVE_COVENANT",
    split: "dev",
    document: LSB_DOC,
    operativeVersion: {
      operativeDocumentId: LSB_DOC.documentId,
      asOfDate: "2023-12-21",
      amendmentIdentity: null,
      isRestatedOperativeText: false,
    },
    structural: { sectionRef: "6.02", sourceNodeKey: null, articleRef: "ARTICLE VI", unitKind: "OPERATIVE_COVENANT" },
    governingProhibition: "Create, incur, assume, or permit to exist any Lien on or with respect to any of its assets",
    window: {
      kind: "regex",
      sourceFixturePath: LSB_DOC.sourceFixturePath,
      startRe: String.raw`SECTION\s+6\.02`,
      endRe: String.raw`SECTION\s+6\.03`,
    },
    inputExceptions: ["Permitted Liens"],
    inputConditions: [],
    inputCrossReferences: ["Permitted Liens", "Section 6.01(d)"],
    entityScopeNotes: ["Loan Party assets"],
    output: baseOutput({
      candidateCovenantFamily: "LIENS",
      candidatePermissionProhibitionClass: "PROHIBITION",
      proposedFormulaOrCapacity: {
        shape: null,
        description: "Duplicate-probe twin of stc-lsb-6.02-liens-prohibition — same controlling window for exact-duplicate detection tests.",
        figures: [],
        capacityUnlimited: null,
      },
      proposedConditions: [],
      proposedDependencyEdges: [],
      missingInputs: ["Permitted Liens definition full text"],
      uncertainty: { level: "LOW", reasons: [] },
      verificationStatus: "HUMAN_SOURCE_VERIFIED",
      labelNotes: "Intentional exact-duplicate window probe for dedup machinery. Same source hash expected as stc-lsb-6.02-liens-prohibition.",
    }),
    authoringMethod: "HUMAN_SOURCE_READING",
    authoredAt: AUTH,
  },

  // ---------- HELDOUT issuers (Chewy, Gibraltar, Riot) ----------
  {
    exampleId: "stc-chwy-6.01-indebtedness-heldout",
    polarity: "POSITIVE",
    role: "OPERATIVE_COVENANT",
    split: "eval-heldout",
    document: CHWY_DOC,
    operativeVersion: {
      operativeDocumentId: CHWY_DOC.documentId,
      asOfDate: "2026-06-23",
      amendmentIdentity: null,
      isRestatedOperativeText: false,
    },
    structural: { sectionRef: "6.01", sourceNodeKey: null, articleRef: "ARTICLE VI", unitKind: "OPERATIVE_COVENANT" },
    governingProhibition: "Limitation on Incurrence of Indebtedness and Issuance of Disqualified Stock and Preferred Stock",
    window: {
      kind: "regex",
      sourceFixturePath: CHWY_DOC.sourceFixturePath,
      startRe: String.raw`Section 6\.01\s+Limitation on Incurrence of Indebtedness`,
      endRe: String.raw`Section 6\.02`,
      occurrence: -1,
      maxLen: 10000,
    },
    inputExceptions: [],
    inputConditions: [],
    inputCrossReferences: [],
    entityScopeNotes: [],
    output: baseOutput({
      candidateCovenantFamily: "INDEBTEDNESS",
      candidatePermissionProhibitionClass: "PROHIBITION",
      proposedFormulaOrCapacity: {
        shape: "PROHIBITION_WITH_ENUMERATED_EXCEPTIONS",
        description: "HELD-OUT EVAL: Chewy §6.01 Indebtedness/Disqualified Stock/Preferred Stock limitation. Labels are provisional hypotheses for evaluation only.",
        figures: [],
        capacityUnlimited: null,
      },
      proposedConditions: [],
      proposedDependencyEdges: [],
      missingInputs: ["Full exception schedule economics", "entity-scope nuances for Preferred Stock"],
      uncertainty: { level: "HIGH", reasons: ["Held-out issuer; detailed basket labels intentionally not fully verified in this dataset build"] },
      verificationStatus: "HUMAN_HYPOTHESIS",
      labelNotes: "Held-out issuer/instrument evaluation example. Must remain excluded from training SFT mixes unless a separate rights/review decision says otherwise.",
    }),
    authoringMethod: "HUMAN_SOURCE_READING_PLUS_CATALOG",
    authoredAt: AUTH,
  },
  {
    exampleId: "stc-gibraltar-reporting-heldout",
    polarity: "POSITIVE",
    role: "OPERATIVE_COVENANT",
    split: "eval-heldout",
    document: GIB_DOC,
    operativeVersion: {
      operativeDocumentId: GIB_DOC.documentId,
      asOfDate: "2026-02-02",
      amendmentIdentity: null,
      isRestatedOperativeText: false,
    },
    structural: { sectionRef: "6.01", sourceNodeKey: null, articleRef: "ARTICLE VI", unitKind: "OPERATIVE_COVENANT" },
    governingProhibition: null,
    window: {
      kind: "regex",
      sourceFixturePath: GIB_DOC.sourceFixturePath,
      startRe: String.raw`Section 6\.01`,
      endRe: String.raw`Section 6\.02`,
      occurrence: 0,
      maxLen: 5000,
    },
    inputExceptions: [],
    inputConditions: [],
    inputCrossReferences: ["Section 6.02(a)"],
    entityScopeNotes: [],
    output: baseOutput({
      candidateCovenantFamily: "REPORTING_INFORMATION",
      candidatePermissionProhibitionClass: "UNRESOLVED",
      proposedFormulaOrCapacity: {
        shape: null,
        description: "HELD-OUT EVAL: Gibraltar §6.01 region as encountered in extracted text (financial reporting / certificate mechanics appear in this span in this instrument). Family label unresolved pending fuller article mapping.",
        figures: [],
        capacityUnlimited: null,
      },
      proposedConditions: [],
      proposedDependencyEdges: [],
      missingInputs: ["Confirmed negative-covenant article mapping for this instrument", "full section body if TOC collision"],
      uncertainty: { level: "UNRESOLVED", reasons: ["Held-out; section numbering/role differs from LSB/FWRG Article VI negative-covenant pattern"] },
      verificationStatus: "UNRESOLVED",
      labelNotes: "Held-out unresolved example — preserves honest uncertainty for evaluation.",
    }),
    authoringMethod: "HUMAN_SOURCE_READING_PLUS_CATALOG",
    authoredAt: AUTH,
  },
  {
    exampleId: "stc-riot-negative-covenant-article-heldout",
    polarity: "POSITIVE",
    role: "OPERATIVE_COVENANT",
    split: "eval-heldout",
    document: RIOT_DOC,
    operativeVersion: {
      operativeDocumentId: RIOT_DOC.documentId,
      asOfDate: "2026-04-21",
      amendmentIdentity: "riot-second-amended-restated-2026-04-21",
      isRestatedOperativeText: true,
    },
    structural: { sectionRef: "Article VI (Negative Covenants)", sourceNodeKey: null, articleRef: "ARTICLE VI", unitKind: "OPERATIVE_COVENANT" },
    governingProhibition: null,
    window: {
      kind: "regex",
      sourceFixturePath: RIOT_DOC.sourceFixturePath,
      startRe: String.raw`Negative Covenant`,
      endRe: null,
      occurrence: -1,
      maxLen: 7000,
    },
    inputExceptions: [],
    inputConditions: [],
    inputCrossReferences: [],
    entityScopeNotes: ["Riot Platforms, Inc. as Borrower"],
    output: baseOutput({
      candidateCovenantFamily: "QUALITATIVE_NEGATIVE_COVENANTS",
      candidatePermissionProhibitionClass: "UNRESOLVED",
      proposedFormulaOrCapacity: {
        shape: null,
        description: "HELD-OUT EVAL: Riot Second A&R Credit Agreement negative-covenant region. Detailed permission/prohibition decomposition left unresolved for independent evaluation.",
        figures: [],
        capacityUnlimited: null,
      },
      proposedConditions: [],
      proposedDependencyEdges: [],
      missingInputs: ["Per-section operative limbs", "defined-term pack for this instrument"],
      uncertainty: { level: "UNRESOLVED", reasons: ["Held-out restated instrument; not labeled to avoid contaminating acceptance evaluation"] },
      verificationStatus: "UNRESOLVED",
      labelNotes: "Held-out issuer/instrument. Amendment identity recorded. No verified semantic approval.",
    }),
    authoringMethod: "HUMAN_SOURCE_READING_PLUS_CATALOG",
    authoredAt: AUTH,
  },
];

/** Issuers reserved exclusively for eval-heldout. */
export const HELDOUT_ISSUER_IDS = ["chewy", "gibraltar", "riot-platforms"] as const;
