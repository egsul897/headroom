/**
 * Workstream A — baseline inventory of reusable Headroom capabilities.
 * Classifies each as reusable | incomplete | fixture-specific | missing.
 */

export type CapabilityStatus = "reusable" | "incomplete" | "fixture-specific" | "missing";

export interface CapabilityInventoryItem {
  id: string;
  area: string;
  canonicalPath: string;
  summary: string;
  status: CapabilityStatus;
  notes: string;
}

export const BASELINE_CAPABILITY_INVENTORY: CapabilityInventoryItem[] = [
  {
    id: "ingest-kf-pipeline",
    area: "Document ingestion / structural retrieval",
    canonicalPath: "lib/knowledge-factory/pipeline/run.ts",
    summary: "Deterministic KF acquire→text→structure→candidates with exact-byte dedupe.",
    status: "reusable",
    notes: "File corpus store; Neon KnowledgeSource optional via mass-precedent import.",
  },
  {
    id: "ingest-edgar-ehb",
    area: "Document ingestion / structural retrieval",
    canonicalPath: "lib/edgar-historical-backfill/",
    summary: "SEC EDGAR historical backfill with checkpoints, dedupe, CKF handoff queue.",
    status: "reusable",
    notes: "Rate-limited; requires HEADROOM_SEC_FETCH_OWNER.",
  },
  {
    id: "structural-index",
    area: "Document ingestion / structural retrieval",
    canonicalPath: "lib/contract-model/compiler/stage-structure.ts + structural-index.ts",
    summary: "Canonical document structure, definitions, references, structural index.",
    status: "reusable",
    notes: "Used by KF, offline compile, and compute jobs.",
  },
  {
    id: "discovery-pass-a",
    area: "Autonomous covenant discovery",
    canonicalPath: "lib/contract-model/compiler/discovery/pass-a-signals.ts",
    summary: "Deterministic Pass A covenant signals.",
    status: "reusable",
    notes: "No LLM.",
  },
  {
    id: "discovery-catalogs",
    area: "Autonomous covenant discovery",
    canonicalPath: "lib/contract-model/compiler/discovery/definition-exception-catalog.ts",
    summary: "Definition/section exception catalogs + ratio section permissions.",
    status: "reusable",
    notes: "Issuer-agnostic; generalized nested numbering.",
  },
  {
    id: "coverage-audit",
    area: "Autonomous covenant discovery",
    canonicalPath: "lib/contract-model/compiler/coverage-audit/pipeline.ts",
    summary: "Independent coverage auditor over discovered regions.",
    status: "reusable",
    notes: "Wired in compileFrozenDebtPackage.",
  },
  {
    id: "semantic-ir-compile",
    area: "Semantic IR / verification",
    canonicalPath: "lib/contract-model/compiler/semantic/compile.ts",
    summary: "Semantic IR compilation with support-status gating.",
    status: "reusable",
    notes: "Only supported structures compile to deterministic rules.",
  },
  {
    id: "verification-envelope",
    area: "Semantic IR / verification",
    canonicalPath: "lib/contract-model/verification-envelope/",
    summary: "Verification envelope and verified-execution handoff.",
    status: "reusable",
    notes: "Production capacity separately refused without trusted identity.",
  },
  {
    id: "operative-amendment",
    area: "Operative amendment / version handling",
    canonicalPath: "lib/contract-model/compiler/amendment/ + package-graph/",
    summary: "Package graph, amendment effects, operative contract state, authority gates.",
    status: "reusable",
    notes: "Fail-closed on provisional / unresolved identity.",
  },
  {
    id: "offline-package-compile",
    area: "Covenant compilation / deterministic computation",
    canonicalPath: "lib/contract-model/analysis/offline-package-compile.ts",
    summary: "Issuer-agnostic offline package compile entry (structure→VE).",
    status: "reusable",
    notes: "Canonical entry for learning factory; fixed-dollar/greater-of VE slices.",
  },
  {
    id: "capacity-runtime",
    area: "Covenant compilation / deterministic computation",
    canonicalPath: "lib/contract-model/runtime/ + lib/capacity/",
    summary: "Deterministic capacity / simulation runtime over certified rules + snapshots.",
    status: "reusable",
    notes: "Learning factory must not write production Permission/SharedCapacity rows.",
  },
  {
    id: "neon-knowledge-source",
    area: "Neon schema / persistence",
    canonicalPath: "prisma/schema.prisma → KnowledgeSource, DocumentByteObject, KnowledgeImportBatch",
    summary: "KF source registry, BYTEA store, import batch checkpoints.",
    status: "reusable",
    notes: "Live Neon currently blocked on credentials/connectivity in this environment.",
  },
  {
    id: "neon-learning-tables",
    area: "Neon schema / persistence",
    canonicalPath: "prisma/migrations/20261013180000_covenant_learning_factory/",
    summary: "Learning packages, runs, artifacts, error ledger, evaluations, cohorts.",
    status: "incomplete",
    notes: "Additive migration shipped; apply when Neon is reachable. File store works offline.",
  },
  {
    id: "eval-source-to-covenant",
    area: "Evaluation corpora / golden tests",
    canonicalPath: "datasets/source-to-covenant/",
    summary: "Train/dev vs eval-heldout issuer-disjoint compilation dataset.",
    status: "reusable",
    notes: "Do not contaminate held-out or mutate goldens to pass.",
  },
  {
    id: "eval-v2",
    area: "Evaluation corpora / golden tests",
    canonicalPath: "lib/contract-model/evaluation-v2/",
    summary: "Evaluation-v2 adjudication / correspondence framework.",
    status: "reusable",
    notes: "Heavy; learning factory uses lighter independent compile eval first.",
  },
  {
    id: "product-proof-unseen",
    area: "Evaluation corpora / golden tests",
    canonicalPath: "docs/product-proof/001 + 002 (MTN/MHK)",
    summary: "Authentic unseen-issuer proof packages with freeze manifests.",
    status: "reusable",
    notes: "MHK is default HELD_OUT CIK for learning factory.",
  },
  {
    id: "kf-mass-precedent",
    area: "Precedent ingestion pipeline",
    canonicalPath: "lib/knowledge-factory/mass-precedent/",
    summary: "Mass-precedent inventory, SEC batch persist, analysis runs.",
    status: "reusable",
    notes: "Live Neon write requires KF_MASS_PRECEDENT_LIVE_WRITE authorization.",
  },
  {
    id: "neon-flywheel",
    area: "Continuous learning / evaluation",
    canonicalPath: "scripts/neon-corpus-flywheel/",
    summary: "Batch analysis + compiler challenge loop over authentic packages.",
    status: "incomplete",
    notes: "Offline remediation shipped; live inventory blocked on Neon auth historically.",
  },
  {
    id: "learning-factory-orchestrator",
    area: "Continuous learning / evaluation",
    canonicalPath: "lib/covenant-learning-factory/",
    summary: "Unified resumable batch loop: ingest→compile→eval→error ledger→proposals.",
    status: "reusable",
    notes: "This workstream; wires existing compiler; no auto-promotion.",
  },
  {
    id: "issuer-specific-branches",
    area: "Anti-pattern",
    canonicalPath: "lib/product/autonomous-covenant-compilation/package-contexts.ts (Matthews loader)",
    summary: "Fixture loaders may name issuers; production discovery must not.",
    status: "fixture-specific",
    notes: "Learning factory package-registry uses document loaders only.",
  },
];

export function renderInventoryMarkdown(items = BASELINE_CAPABILITY_INVENTORY): string {
  const lines = [
    "# Covenant Learning Factory — Baseline Capability Inventory",
    "",
    `Generated for \`${"covenant-learning-factory.v1"}\`. Classifications: reusable | incomplete | fixture-specific | missing.`,
    "",
    "| ID | Area | Status | Canonical path | Summary |",
    "|---|---|---|---|---|",
  ];
  for (const i of items) {
    lines.push(
      `| \`${i.id}\` | ${i.area} | **${i.status}** | \`${i.canonicalPath}\` | ${i.summary} |`,
    );
  }
  lines.push("", "## Notes", "");
  for (const i of items) {
    lines.push(`- **${i.id}**: ${i.notes}`);
  }
  lines.push("");
  return lines.join("\n");
}
