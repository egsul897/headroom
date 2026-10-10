/**
 * Neon corpus inventory — READ-ONLY.
 *
 * Bounded aggregations only. Never INSERT/UPDATE/DELETE/migrate.
 * Writes artifacts under docs/neon-corpus-flywheel/ only (repo filesystem).
 *
 * Usage: npx tsx scripts/neon-corpus-flywheel/inventory.ts
 */

import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

const OUT_DIR = path.join(process.cwd(), "docs/neon-corpus-flywheel");

function hostFingerprint(databaseUrl: string): string {
  try {
    const u = new URL(databaseUrl);
    return createHash("sha256").update(u.hostname).digest("hex").slice(0, 12);
  } catch {
    return "unparseable";
  }
}

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required (read-only Neon connection)");
  }

  const prisma = new PrismaClient({
    datasources: { db: { url: process.env.DATABASE_URL } },
  });

  const startedAt = new Date().toISOString();
  const queries: { id: string; sql: string; notes?: string }[] = [];

  try {
    // Enforce session-level read-only for this connection.
    await prisma.$executeRawUnsafe("SET default_transaction_read_only = on");
    await prisma.$executeRawUnsafe("SET statement_timeout = '120s'");

    const snap = await prisma.$queryRawUnsafe<
      { now: Date; db: string; user: string; read_only: string }[]
    >(
      `SELECT now() AS now,
              current_database() AS db,
              current_user AS "user",
              current_setting('default_transaction_read_only') AS read_only`,
    );
    queries.push({
      id: "snapshot_meta",
      sql: "SELECT now(), current_database(), current_user, default_transaction_read_only",
    });

    const companies = await prisma.$queryRawUnsafe<
      {
        id: string;
        name: string;
        ticker: string | null;
        cik: string | null;
        tenant_kind: string;
        onboarding_status: string;
        doc_count: bigint;
        provision_count: bigint;
        rule_count: bigint;
        term_count: bigint;
        snapshot_count: bigint;
        ledger_count: bigint;
      }[]
    >(`
      SELECT c.id, c.name, c.ticker, c.cik, c."tenantKind"::text AS tenant_kind,
             c."onboardingStatus"::text AS onboarding_status,
             (SELECT COUNT(*) FROM documents d WHERE d."companyId" = c.id) AS doc_count,
             (SELECT COUNT(*) FROM covenant_provisions p WHERE p."companyId" = c.id) AS provision_count,
             (SELECT COUNT(*) FROM contract_rules r WHERE r."companyId" = c.id) AS rule_count,
             (SELECT COUNT(*) FROM defined_terms t WHERE t."documentId" IN (SELECT id FROM documents WHERE "companyId" = c.id)) AS term_count,
             (SELECT COUNT(*) FROM financial_snapshots f WHERE f."companyId" = c.id) AS snapshot_count,
             (SELECT COUNT(*) FROM ledger_entries l WHERE l."companyId" = c.id) AS ledger_count
      FROM companies c
      ORDER BY c.name
    `);
    queries.push({ id: "companies_with_counts", sql: "companies + per-company doc/provision/rule/term/snapshot/ledger counts" });

    const docsByType = await prisma.$queryRawUnsafe<
      { type: string; count: bigint }[]
    >(`SELECT type::text AS type, COUNT(*)::bigint AS count FROM documents GROUP BY type ORDER BY count DESC`);
    queries.push({ id: "documents_by_type", sql: "SELECT type, COUNT(*) FROM documents GROUP BY type" });

    const docsByCompanyType = await prisma.$queryRawUnsafe<
      { company_id: string; company_name: string; type: string; count: bigint }[]
    >(`
      SELECT c.id AS company_id, c.name AS company_name, d.type::text AS type, COUNT(*)::bigint AS count
      FROM documents d JOIN companies c ON c.id = d."companyId"
      GROUP BY c.id, c.name, d.type
      ORDER BY c.name, count DESC
    `);
    queries.push({ id: "documents_by_company_type", sql: "documents grouped by company + type" });

    const financingPackages = await prisma.$queryRawUnsafe<
      {
        company_id: string;
        company_name: string;
        package_key: string;
        run_id: string;
        doc_count: bigint;
        started_at: Date;
        completed_at: Date | null;
      }[]
    >(`
      SELECT c.id AS company_id, c.name AS company_name, r."packageKey" AS package_key,
             r.id AS run_id, COUNT(rd.id)::bigint AS doc_count,
             r."startedAt" AS started_at, r."completedAt" AS completed_at
      FROM contract_compiler_runs r
      JOIN companies c ON c.id = r."companyId"
      LEFT JOIN contract_compiler_run_documents rd ON rd."runId" = r.id
      GROUP BY c.id, c.name, r."packageKey", r.id, r."startedAt", r."completedAt"
      ORDER BY c.name, r."packageKey"
    `);
    queries.push({ id: "financing_packages", sql: "contract_compiler_runs + member document counts" });

    const debtInstruments = await prisma.$queryRawUnsafe<
      {
        company_id: string;
        company_name: string;
        instrument_id: string;
        name: string;
        instrument_type: string | null;
        base_document_id: string | null;
        review_status: string;
        doc_count: bigint;
      }[]
    >(`
      SELECT c.id AS company_id, c.name AS company_name, i.id AS instrument_id, i.name,
             i."instrumentType"::text AS instrument_type, i."baseDocumentId" AS base_document_id,
             i."reviewStatus"::text AS review_status,
             (SELECT COUNT(*) FROM documents d WHERE d."instrumentId" = i.id) AS doc_count
      FROM debt_instruments i
      JOIN companies c ON c.id = i."companyId"
      ORDER BY c.name, i.name
    `);
    queries.push({ id: "debt_instruments", sql: "debt_instruments + member document counts" });

    const covenantFamilies = await prisma.$queryRawUnsafe<
      { covenant_family: string; count: bigint; companies: bigint }[]
    >(`
      SELECT "covenantFamily"::text AS covenant_family, COUNT(*)::bigint AS count,
             COUNT(DISTINCT "companyId")::bigint AS companies
      FROM contract_rules
      GROUP BY "covenantFamily"
      ORDER BY count DESC
    `);
    queries.push({ id: "contract_rules_by_family", sql: "contract_rules GROUP BY covenantFamily" });

    const provisionCodes = await prisma.$queryRawUnsafe<
      { code_prefix: string; count: bigint }[]
    >(`
      SELECT SPLIT_PART(code, '_', 1) AS code_prefix, COUNT(*)::bigint AS count
      FROM covenant_provisions
      GROUP BY 1
      ORDER BY count DESC
      LIMIT 50
    `);
    queries.push({ id: "covenant_provision_code_prefixes", sql: "covenant_provisions code prefix histogram (top 50)" });

    const definedTerms = await prisma.$queryRawUnsafe<
      { source: string; count: bigint }[]
    >(`
      SELECT 'DefinedTerm' AS source, COUNT(*)::bigint AS count FROM defined_terms
      UNION ALL
      SELECT 'DefinedTermNode', COUNT(*)::bigint FROM defined_term_nodes
      UNION ALL
      SELECT 'DefinedTermDependencyEdge', COUNT(*)::bigint FROM defined_term_dependency_edges
      UNION ALL
      SELECT 'ContractReferenceEdge', COUNT(*)::bigint FROM contract_reference_edges
    `);
    queries.push({ id: "defined_terms_and_refs", sql: "counts of defined_terms, defined_term_nodes, deps, contract_reference_edges" });

    const relationshipEdges = await prisma.$queryRawUnsafe<
      {
        relationship_type: string;
        total: bigint;
        resolved: bigint;
        unresolved: bigint;
        distinct_discovery: bigint;
      }[]
    >(`
      SELECT "relationshipType"::text AS relationship_type,
             COUNT(*)::bigint AS total,
             COUNT(*) FILTER (WHERE resolved = true)::bigint AS resolved,
             COUNT(*) FILTER (WHERE resolved = false)::bigint AS unresolved,
             COUNT(DISTINCT ("companyId", "sourceDocumentId", COALESCE("targetDocumentId", ''), "relationshipType"::text, COALESCE("targetHint", '')))::bigint AS distinct_discovery
      FROM document_relationship_edges
      GROUP BY "relationshipType"
      ORDER BY total DESC
    `);
    queries.push({
      id: "document_relationship_edges",
      sql: "edges by type with resolved/unresolved and discovery-identity dedupe",
      notes: "discovery identity = (companyId, sourceDocumentId, targetDocumentId|'', relationshipType, targetHint|'')",
    });

    const edgeDupes = await prisma.$queryRawUnsafe<{ duplicate_groups: bigint; excess_rows: bigint }[]>(`
      SELECT COUNT(*)::bigint AS duplicate_groups,
             COALESCE(SUM(cnt - 1), 0)::bigint AS excess_rows
      FROM (
        SELECT COUNT(*) AS cnt
        FROM document_relationship_edges
        GROUP BY "companyId", "sourceDocumentId", COALESCE("targetDocumentId", ''), "relationshipType", COALESCE("targetHint", '')
        HAVING COUNT(*) > 1
      ) d
    `);
    queries.push({ id: "relationship_edge_duplicates", sql: "duplicate groups by discovery identity" });

    const sourceText = await prisma.$queryRawUnsafe<
      {
        metric: string;
        count: bigint;
      }[]
    >(`
      SELECT 'documents_total' AS metric, COUNT(*)::bigint AS count FROM documents
      UNION ALL
      SELECT 'documents_with_storage_ref', COUNT(*)::bigint FROM documents WHERE "storageRef" IS NOT NULL
      UNION ALL
      SELECT 'document_chunks', COUNT(*)::bigint FROM document_chunks
      UNION ALL
      SELECT 'documents_with_chunks', COUNT(DISTINCT "documentId")::bigint FROM document_chunks
      UNION ALL
      SELECT 'document_nodes', COUNT(*)::bigint FROM document_nodes
      UNION ALL
      SELECT 'document_nodes_with_char_span', COUNT(*)::bigint FROM document_nodes WHERE "charStart" IS NOT NULL AND "charEnd" IS NOT NULL
      UNION ALL
      SELECT 'document_byte_objects', COUNT(*)::bigint FROM document_byte_objects
      UNION ALL
      SELECT 'knowledge_sources', COUNT(*)::bigint FROM knowledge_sources
      UNION ALL
      SELECT 'knowledge_sources_with_storage', COUNT(*)::bigint FROM knowledge_sources WHERE "storageRef" IS NOT NULL
      UNION ALL
      SELECT 'source_artifacts', COUNT(*)::bigint FROM source_artifacts
    `);
    queries.push({ id: "source_text_availability", sql: "storageRef/chunks/nodes/byte objects/knowledge sources" });

    const citationQuality = await prisma.$queryRawUnsafe<
      { metric: string; count: bigint }[]
    >(`
      SELECT 'contract_rules_total' AS metric, COUNT(*)::bigint AS count FROM contract_rules
      UNION ALL
      SELECT 'contract_rules_with_section_ref', COUNT(*)::bigint FROM contract_rules WHERE "sourceSectionRef" IS NOT NULL AND "sourceSectionRef" <> ''
      UNION ALL
      SELECT 'contract_rules_with_source_node', COUNT(*)::bigint FROM contract_rules WHERE "sourceNodeId" IS NOT NULL
      UNION ALL
      SELECT 'permissions_total', COUNT(*)::bigint FROM permissions
      UNION ALL
      SELECT 'permissions_with_source_citation', COUNT(*)::bigint FROM permissions WHERE "sourceCitation" IS NOT NULL AND "sourceCitation" <> ''
      UNION ALL
      SELECT 'covenant_provisions_with_section_ref', COUNT(*)::bigint FROM covenant_provisions WHERE "sectionRef" IS NOT NULL AND "sectionRef" <> ''
    `);
    queries.push({ id: "citation_quality", sql: "rules/permissions/provisions with section/node citations" });

    // Financial snapshots — approval status may live on FinancialState / ExternalInputRecord
    const financial = await prisma.$queryRawUnsafe<{ metric: string; count: bigint }[]>(`
      SELECT 'financial_snapshots' AS metric, COUNT(*)::bigint AS count FROM financial_snapshots
      UNION ALL
      SELECT 'financial_states', COUNT(*)::bigint FROM financial_states
      UNION ALL
      SELECT 'financial_states_approved', COUNT(*)::bigint FROM financial_states WHERE status::text ILIKE '%APPROV%' OR status::text ILIKE '%ACTIVE%'
      UNION ALL
      SELECT 'debt_tranches', COUNT(*)::bigint FROM debt_tranches
      UNION ALL
      SELECT 'external_input_records', COUNT(*)::bigint FROM external_input_records
      UNION ALL
      SELECT 'facilities', COUNT(*)::bigint FROM facilities
      UNION ALL
      SELECT 'debt_events', COUNT(*)::bigint FROM debt_events
    `);
    queries.push({ id: "financial_snapshots", sql: "snapshots/states/tranches/facilities/events" });

    // Probe financial_states columns for status field names
    const financialStateCols = await prisma.$queryRawUnsafe<{ column_name: string }[]>(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'financial_states' ORDER BY ordinal_position
    `);

    const ledger = await prisma.$queryRawUnsafe<{ metric: string; count: bigint }[]>(`
      SELECT 'ledger_entries' AS metric, COUNT(*)::bigint AS count FROM ledger_entries
      UNION ALL
      SELECT 'ledger_entries_by_basket_' || basket::text, COUNT(*)::bigint FROM ledger_entries GROUP BY basket
      UNION ALL
      SELECT 'contract_ledger_usage', COUNT(*)::bigint FROM contract_ledger_usage
      UNION ALL
      SELECT 'contract_ledger_usage_events', COUNT(*)::bigint FROM contract_ledger_usage_events
    `);
    queries.push({ id: "ledger_utilization", sql: "ledger_entries + contract_ledger_usage" });

    const verifiedRules = await prisma.$queryRawUnsafe<{ metric: string; count: bigint }[]>(`
      SELECT 'permissions' AS metric, COUNT(*)::bigint AS count FROM permissions
      UNION ALL
      SELECT 'permissions_by_review_' || "reviewStatus"::text, COUNT(*)::bigint FROM permissions GROUP BY "reviewStatus"
      UNION ALL
      SELECT 'contract_rules_by_review_' || "reviewStatus"::text, COUNT(*)::bigint FROM contract_rules GROUP BY "reviewStatus"
      UNION ALL
      SELECT 'contract_rules_by_coverage_' || "coverageStatus"::text, COUNT(*)::bigint FROM contract_rules GROUP BY "coverageStatus"
      UNION ALL
      SELECT 'legal_review_records', COUNT(*)::bigint FROM legal_review_records
      UNION ALL
      SELECT 'claim_review_items', COUNT(*)::bigint FROM claim_review_items
      UNION ALL
      SELECT 'claim_review_decisions', COUNT(*)::bigint FROM claim_review_decisions
      UNION ALL
      SELECT 'golden_tests', COUNT(*)::bigint FROM golden_tests
      UNION ALL
      SELECT 'solver_coverage_declarations', COUNT(*)::bigint FROM solver_coverage_declarations
      UNION ALL
      SELECT 'shared_capacity_constraints', COUNT(*)::bigint FROM shared_capacity_constraints
    `);
    queries.push({ id: "verified_rules_and_reviews", sql: "permissions/rules review+coverage, legal/claim reviews, golden tests" });

    // Legal review decision histogram if columns allow
    const legalReviewByStatus = await prisma.$queryRawUnsafe<{ status: string; count: bigint }[]>(`
      SELECT COALESCE(status::text, 'NULL') AS status, COUNT(*)::bigint AS count
      FROM legal_review_records
      GROUP BY status
      ORDER BY count DESC
    `).catch(() => [] as { status: string; count: bigint }[]);

    const orphans = await prisma.$queryRawUnsafe<{ issue: string; count: bigint }[]>(`
      SELECT 'documents_without_instrument' AS issue, COUNT(*)::bigint AS count
      FROM documents WHERE "instrumentId" IS NULL
        AND type::text NOT IN ('INTERCREDITOR_AGREEMENT', 'OTHER', 'UNKNOWN', 'SIDE_LETTER', 'FEE_LETTER', 'COMPLIANCE_CERTIFICATE')
      UNION ALL
      SELECT 'documents_orphan_company_missing', COUNT(*)::bigint
      FROM documents d LEFT JOIN companies c ON c.id = d."companyId" WHERE c.id IS NULL
      UNION ALL
      SELECT 'instruments_missing_base_document', COUNT(*)::bigint
      FROM debt_instruments WHERE "baseDocumentId" IS NULL
      UNION ALL
      SELECT 'instruments_base_doc_not_found', COUNT(*)::bigint
      FROM debt_instruments i
      LEFT JOIN documents d ON d.id = i."baseDocumentId"
      WHERE i."baseDocumentId" IS NOT NULL AND d.id IS NULL
      UNION ALL
      SELECT 'relationship_edges_unresolved', COUNT(*)::bigint
      FROM document_relationship_edges WHERE resolved = false OR "targetDocumentId" IS NULL
      UNION ALL
      SELECT 'relationship_edges_target_missing', COUNT(*)::bigint
      FROM document_relationship_edges e
      LEFT JOIN documents d ON d.id = e."targetDocumentId"
      WHERE e."targetDocumentId" IS NOT NULL AND d.id IS NULL
      UNION ALL
      SELECT 'contract_rules_without_source_node', COUNT(*)::bigint
      FROM contract_rules WHERE "sourceNodeId" IS NULL
      UNION ALL
      SELECT 'unresolved_contract_items', COUNT(*)::bigint FROM unresolved_contract_items
      UNION ALL
      SELECT 'amendment_effects', COUNT(*)::bigint FROM amendment_effects
      UNION ALL
      SELECT 'documents_with_effective_to_set', COUNT(*)::bigint FROM documents WHERE "effectiveTo" IS NOT NULL
      UNION ALL
      SELECT 'documents_with_supersedes', COUNT(*)::bigint FROM documents WHERE "supersedesDocumentId" IS NOT NULL
      UNION ALL
      SELECT 'knowledge_sources_without_company', COUNT(*)::bigint FROM knowledge_sources WHERE "companyId" IS NULL
    `);
    queries.push({ id: "orphans_and_gaps", sql: "orphan docs, missing bases, unresolved edges, rules without nodes" });

    const completeness = await prisma.$queryRawUnsafe<
      {
        company_id: string;
        company_name: string;
        has_credit_agreement: boolean;
        has_indenture: boolean;
        has_amendment: boolean;
        has_intercreditor: boolean;
        has_guarantee: boolean;
        has_security: boolean;
        has_guarantee_and_security: boolean;
        has_amended_restated: boolean;
        has_supplemental_indenture: boolean;
        total_docs: bigint;
        instruments: bigint;
        packages: bigint;
        rules: bigint;
        defined_term_nodes: bigint;
        relationship_edges: bigint;
        financial_snapshots: bigint;
        ledger_entries: bigint;
      }[]
    >(`
      SELECT c.id AS company_id, c.name AS company_name,
        EXISTS(SELECT 1 FROM documents d WHERE d."companyId"=c.id AND d.type='CREDIT_AGREEMENT') AS has_credit_agreement,
        EXISTS(SELECT 1 FROM documents d WHERE d."companyId"=c.id AND d.type='INDENTURE') AS has_indenture,
        EXISTS(SELECT 1 FROM documents d WHERE d."companyId"=c.id AND d.type='AMENDMENT') AS has_amendment,
        EXISTS(SELECT 1 FROM documents d WHERE d."companyId"=c.id AND d.type='INTERCREDITOR_AGREEMENT') AS has_intercreditor,
        EXISTS(SELECT 1 FROM documents d WHERE d."companyId"=c.id AND d.type='GUARANTEE') AS has_guarantee,
        EXISTS(SELECT 1 FROM documents d WHERE d."companyId"=c.id AND d.type='SECURITY_AGREEMENT') AS has_security,
        EXISTS(SELECT 1 FROM documents d WHERE d."companyId"=c.id AND d.type='GUARANTEE_AND_SECURITY_AGREEMENT') AS has_guarantee_and_security,
        EXISTS(SELECT 1 FROM documents d WHERE d."companyId"=c.id AND d.type='AMENDED_AND_RESTATED_AGREEMENT') AS has_amended_restated,
        EXISTS(SELECT 1 FROM documents d WHERE d."companyId"=c.id AND d.type='SUPPLEMENTAL_INDENTURE') AS has_supplemental_indenture,
        (SELECT COUNT(*) FROM documents d WHERE d."companyId"=c.id) AS total_docs,
        (SELECT COUNT(*) FROM debt_instruments i WHERE i."companyId"=c.id) AS instruments,
        (SELECT COUNT(*) FROM contract_compiler_runs r WHERE r."companyId"=c.id) AS packages,
        (SELECT COUNT(*) FROM contract_rules r WHERE r."companyId"=c.id) AS rules,
        (SELECT COUNT(*) FROM defined_term_nodes t WHERE t."companyId"=c.id) AS defined_term_nodes,
        (SELECT COUNT(*) FROM document_relationship_edges e WHERE e."companyId"=c.id) AS relationship_edges,
        (SELECT COUNT(*) FROM financial_snapshots f WHERE f."companyId"=c.id) AS financial_snapshots,
        (SELECT COUNT(*) FROM ledger_entries l WHERE l."companyId"=c.id) AS ledger_entries
      FROM companies c
      ORDER BY c.name
    `);
    queries.push({ id: "issuer_completeness", sql: "per-issuer document-type flags + structure counts" });

    const knowledgeByClass = await prisma.$queryRawUnsafe<
      { document_class: string; count: bigint; with_storage: bigint; distinct_issuers: bigint }[]
    >(`
      SELECT "documentClass"::text AS document_class,
             COUNT(*)::bigint AS count,
             COUNT(*) FILTER (WHERE "storageRef" IS NOT NULL)::bigint AS with_storage,
             COUNT(DISTINCT "issuerCik")::bigint AS distinct_issuers
      FROM knowledge_sources
      GROUP BY "documentClass"
      ORDER BY count DESC
    `);
    queries.push({ id: "knowledge_sources_by_class", sql: "knowledge_sources by documentClass" });

    const knowledgeIssuers = await prisma.$queryRawUnsafe<{ distinct_issuers: bigint; distinct_accessions: bigint }[]>(`
      SELECT COUNT(DISTINCT "issuerCik")::bigint AS distinct_issuers,
             COUNT(DISTINCT "accessionNumber")::bigint AS distinct_accessions
      FROM knowledge_sources
    `);

    const documentNodes = await prisma.$queryRawUnsafe<{ metric: string; count: bigint }[]>(`
      SELECT 'document_nodes' AS metric, COUNT(*)::bigint AS count FROM document_nodes
      UNION ALL
      SELECT 'document_nodes_by_type_' || "nodeType"::text, COUNT(*)::bigint FROM document_nodes GROUP BY "nodeType"
    `);

    const analysisRuns = await prisma.$queryRawUnsafe<{ metric: string; count: bigint }[]>(`
      SELECT 'analysis_runs' AS metric, COUNT(*)::bigint AS count FROM analysis_runs
      UNION ALL
      SELECT 'semantic_truth_records', COUNT(*)::bigint FROM semantic_truth_records
      UNION ALL
      SELECT 'extraction_runs', COUNT(*)::bigint FROM extraction_runs
      UNION ALL
      SELECT 'extraction_candidates', COUNT(*)::bigint FROM extraction_candidates
      UNION ALL
      SELECT 'contract_compiler_runs', COUNT(*)::bigint FROM contract_compiler_runs
      UNION ALL
      SELECT 'contract_compiler_stages', COUNT(*)::bigint FROM contract_compiler_stages
      UNION ALL
      SELECT 'contract_compiler_stages_completed', COUNT(*)::bigint FROM contract_compiler_stages WHERE status::text = 'COMPLETED'
    `);

    // Sample documents for package ranking (bounded)
    const documentSample = await prisma.$queryRawUnsafe<
      {
        id: string;
        company_id: string;
        company_name: string;
        name: string;
        type: string;
        instrument_id: string | null;
        executed_on: Date | null;
        effective_from: Date | null;
        effective_to: Date | null;
        supersedes_document_id: string | null;
        storage_ref: string | null;
        source: string;
        chunk_count: bigint;
        node_count: bigint;
        rule_count: bigint;
      }[]
    >(`
      SELECT d.id, d."companyId" AS company_id, c.name AS company_name, d.name, d.type::text AS type,
             d."instrumentId" AS instrument_id, d."executedOn" AS executed_on,
             d."effectiveFrom" AS effective_from, d."effectiveTo" AS effective_to,
             d."supersedesDocumentId" AS supersedes_document_id, d."storageRef" AS storage_ref,
             d.source,
             (SELECT COUNT(*) FROM document_chunks ch WHERE ch."documentId"=d.id) AS chunk_count,
             (SELECT COUNT(*) FROM document_nodes n WHERE n."documentId"=d.id) AS node_count,
             (SELECT COUNT(*) FROM contract_rules r WHERE r."sourceDocumentId"=d.id) AS rule_count
      FROM documents d
      JOIN companies c ON c.id = d."companyId"
      ORDER BY c.name, d.type::text, d.name
      LIMIT 500
    `);
    queries.push({ id: "document_sample", sql: "up to 500 documents with chunk/node/rule counts", notes: "bounded; not full materialization of text" });

    const intercreditor = await prisma.$queryRawUnsafe<{ count: bigint }[]>(`
      SELECT COUNT(*)::bigint AS count FROM intercreditor_agreements
    `);

    const permissionRels = await prisma.$queryRawUnsafe<{ metric: string; count: bigint }[]>(`
      SELECT 'permission_relationships' AS metric, COUNT(*)::bigint AS count FROM permission_relationships
      UNION ALL
      SELECT 'contract_rule_relationships', COUNT(*)::bigint FROM contract_rule_relationships
      UNION ALL
      SELECT 'intercreditor_agreements', COUNT(*)::bigint FROM intercreditor_agreements
      UNION ALL
      SELECT 'collateral_pools', COUNT(*)::bigint FROM collateral_pools
    `);

    const endedAt = new Date().toISOString();

    const inventory = {
      schemaVersion: "neon-corpus-flywheel.inventory.v1",
      mode: "READ_ONLY",
      repositorySha: process.env.GITHUB_SHA ?? null,
      localHeadHint: "filled-by-caller",
      startedAt,
      endedAt,
      snapshot: {
        databaseNow: snap[0]?.now?.toISOString?.() ?? String(snap[0]?.now),
        database: snap[0]?.db,
        user: snap[0]?.user,
        defaultTransactionReadOnly: snap[0]?.read_only,
        hostFingerprint: hostFingerprint(process.env.DATABASE_URL!),
      },
      denominators: {
        companies: companies.length,
        issuersWithCik: companies.filter((c) => c.cik).length,
        knowledgeIssuers: Number(knowledgeIssuers[0]?.distinct_issuers ?? 0),
        knowledgeAccessions: Number(knowledgeIssuers[0]?.distinct_accessions ?? 0),
        documents: Number(docsByType.reduce((a, r) => a + Number(r.count), 0)),
        financingPackages_compilerRuns: financingPackages.length,
        debtInstruments: debtInstruments.length,
        contractRules: Number(covenantFamilies.reduce((a, r) => a + Number(r.count), 0)),
        knowledgeSources: Number(knowledgeByClass.reduce((a, r) => a + Number(r.count), 0)),
      },
      companies: companies.map((c) => ({
        ...c,
        doc_count: Number(c.doc_count),
        provision_count: Number(c.provision_count),
        rule_count: Number(c.rule_count),
        term_count: Number(c.term_count),
        snapshot_count: Number(c.snapshot_count),
        ledger_count: Number(c.ledger_count),
      })),
      documentsByType: docsByType.map((r) => ({ type: r.type, count: Number(r.count) })),
      documentsByCompanyType: docsByCompanyType.map((r) => ({
        companyId: r.company_id,
        companyName: r.company_name,
        type: r.type,
        count: Number(r.count),
      })),
      financingPackages: financingPackages.map((p) => ({
        companyId: p.company_id,
        companyName: p.company_name,
        packageKey: p.package_key,
        runId: p.run_id,
        docCount: Number(p.doc_count),
        startedAt: p.started_at?.toISOString?.() ?? String(p.started_at),
        completedAt: p.completed_at?.toISOString?.() ?? (p.completed_at ? String(p.completed_at) : null),
      })),
      debtInstruments: debtInstruments.map((i) => ({
        companyId: i.company_id,
        companyName: i.company_name,
        instrumentId: i.instrument_id,
        name: i.name,
        instrumentType: i.instrument_type,
        baseDocumentId: i.base_document_id,
        reviewStatus: i.review_status,
        docCount: Number(i.doc_count),
      })),
      covenantFamilies: covenantFamilies.map((r) => ({
        family: r.covenant_family,
        count: Number(r.count),
        companies: Number(r.companies),
      })),
      provisionCodePrefixes: provisionCodes.map((r) => ({
        codePrefix: r.code_prefix,
        count: Number(r.count),
      })),
      definedTermsAndRefs: definedTerms.map((r) => ({ source: r.source, count: Number(r.count) })),
      relationshipEdges: relationshipEdges.map((r) => ({
        relationshipType: r.relationship_type,
        total: Number(r.total),
        resolved: Number(r.resolved),
        unresolved: Number(r.unresolved),
        distinctDiscoveryIdentity: Number(r.distinct_discovery),
      })),
      relationshipEdgeDuplicates: {
        duplicateGroups: Number(edgeDupes[0]?.duplicate_groups ?? 0),
        excessRows: Number(edgeDupes[0]?.excess_rows ?? 0),
      },
      sourceTextAvailability: Object.fromEntries(sourceText.map((r) => [r.metric, Number(r.count)])),
      citationQuality: Object.fromEntries(citationQuality.map((r) => [r.metric, Number(r.count)])),
      financial: Object.fromEntries(financial.map((r) => [r.metric, Number(r.count)])),
      financialStateColumns: financialStateCols.map((c) => c.column_name),
      ledger: Object.fromEntries(ledger.map((r) => [r.metric, Number(r.count)])),
      verifiedRulesAndReviews: Object.fromEntries(verifiedRules.map((r) => [r.metric, Number(r.count)])),
      legalReviewByStatus: legalReviewByStatus.map((r) => ({ status: r.status, count: Number(r.count) })),
      orphansAndGaps: Object.fromEntries(orphans.map((r) => [r.issue, Number(r.count)])),
      issuerCompleteness: completeness.map((r) => ({
        companyId: r.company_id,
        companyName: r.company_name,
        hasCreditAgreement: r.has_credit_agreement,
        hasIndenture: r.has_indenture,
        hasAmendment: r.has_amendment,
        hasIntercreditor: r.has_intercreditor,
        hasGuarantee: r.has_guarantee,
        hasSecurity: r.has_security,
        hasGuaranteeAndSecurity: r.has_guarantee_and_security,
        hasAmendedRestated: r.has_amended_restated,
        hasSupplementalIndenture: r.has_supplemental_indenture,
        totalDocs: Number(r.total_docs),
        instruments: Number(r.instruments),
        packages: Number(r.packages),
        rules: Number(r.rules),
        definedTermNodes: Number(r.defined_term_nodes),
        relationshipEdges: Number(r.relationship_edges),
        financialSnapshots: Number(r.financial_snapshots),
        ledgerEntries: Number(r.ledger_entries),
      })),
      knowledgeByClass: knowledgeByClass.map((r) => ({
        documentClass: r.document_class,
        count: Number(r.count),
        withStorage: Number(r.with_storage),
        distinctIssuers: Number(r.distinct_issuers),
      })),
      documentNodes: Object.fromEntries(documentNodes.map((r) => [r.metric, Number(r.count)])),
      analysisAndExtraction: Object.fromEntries(analysisRuns.map((r) => [r.metric, Number(r.count)])),
      permissionAndCollateral: Object.fromEntries(permissionRels.map((r) => [r.metric, Number(r.count)])),
      intercreditorAgreements: Number(intercreditor[0]?.count ?? 0),
      documents: documentSample.map((d) => ({
        id: d.id,
        companyId: d.company_id,
        companyName: d.company_name,
        name: d.name,
        type: d.type,
        instrumentId: d.instrument_id,
        executedOn: d.executed_on?.toISOString?.() ?? (d.executed_on ? String(d.executed_on) : null),
        effectiveFrom: d.effective_from?.toISOString?.() ?? (d.effective_from ? String(d.effective_from) : null),
        effectiveTo: d.effective_to?.toISOString?.() ?? (d.effective_to ? String(d.effective_to) : null),
        supersedesDocumentId: d.supersedes_document_id,
        hasStorageRef: Boolean(d.storage_ref),
        source: d.source,
        chunkCount: Number(d.chunk_count),
        nodeCount: Number(d.node_count),
        ruleCount: Number(d.rule_count),
      })),
      queryProvenance: queries,
    };

    mkdirSync(OUT_DIR, { recursive: true });
    const outPath = path.join(OUT_DIR, "inventory.json");
    writeFileSync(outPath, JSON.stringify(inventory, null, 2));
    console.log(JSON.stringify({ ok: true, outPath, denominators: inventory.denominators, snapshot: inventory.snapshot }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
