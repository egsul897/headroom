-- CreateEnum
CREATE TYPE "covenant_family" AS ENUM ('INDEBTEDNESS', 'LIENS', 'RESTRICTED_PAYMENTS', 'INVESTMENTS', 'ACQUISITIONS', 'ASSET_SALES', 'DISPOSITIONS', 'SALE_LEASEBACKS', 'FINANCIAL_COVENANTS', 'MANDATORY_PREPAYMENTS', 'REPORTING_INFORMATION', 'FUNDAMENTAL_CHANGES', 'AFFILIATE_TRANSACTIONS', 'GUARANTEES', 'GUARANTOR_REQUIREMENTS', 'COLLATERAL_SECURITY', 'CHANGE_OF_CONTROL', 'EVENTS_OF_DEFAULT', 'RATING_TRIGGERS', 'SPRINGING_COVENANTS', 'MFN_PRICING_PROTECTION', 'SUBSIDIARY_DESIGNATIONS', 'ENTITY_SCOPE_RESTRICTIONS', 'AMENDMENT_WAIVER_CONSENT', 'NOTICE_REQUIREMENTS', 'QUALITATIVE_AFFIRMATIVE_COVENANTS', 'QUALITATIVE_NEGATIVE_COVENANTS', 'DEFINITIONS_CALCULATION_RULES');

-- CreateEnum
CREATE TYPE "contract_rule_type" AS ENUM ('QUANTITATIVE_PERMISSION', 'QUANTITATIVE_RESTRICTION', 'RATIO_TEST', 'PROHIBITION', 'EVENT_TRIGGER', 'REPORTING_OBLIGATION', 'NOTICE_OBLIGATION', 'MANDATORY_ACTION', 'CONDITIONAL_ACTIVATION', 'CONSENT_REQUIREMENT', 'QUALITATIVE_OBLIGATION', 'DEFINITION', 'CALCULATION_RULE', 'EXCEPTION', 'RECLASSIFICATION_RULE', 'ENTITY_SCOPE_RULE', 'PRIORITY_RULE', 'SOURCE_PRECEDENCE_RULE');

-- CreateEnum
CREATE TYPE "rule_evaluation_class" AS ENUM ('EXECUTABLE', 'EVENT_DRIVEN', 'MONITORABLE', 'JUDGMENT_REQUIRED', 'UNSUPPORTED');

-- CreateEnum
CREATE TYPE "contract_rule_posture" AS ENUM ('PERMISSION', 'PROHIBITION', 'OBLIGATION', 'N_A');

-- CreateEnum
CREATE TYPE "document_node_type" AS ENUM ('ARTICLE', 'SECTION', 'SUBSECTION', 'CLAUSE', 'SUBCLAUSE', 'PROVISO', 'EXCEPTION', 'SCHEDULE', 'EXHIBIT');

-- CreateEnum
CREATE TYPE "document_relationship_type" AS ENUM ('AMENDS', 'RESTATES', 'SUPPLEMENTS', 'SUPERSEDES', 'INCORPORATES_BY_REFERENCE', 'GOVERNS', 'SECURES', 'GUARANTEES', 'SUBORDINATES', 'INTERCREDITOR_WITH', 'MODIFIES_COLLATERAL', 'MODIFIES_GUARANTOR_STRUCTURE', 'REPLACES_SECTION', 'ADDS_SECTION', 'DELETES_SECTION');

-- CreateEnum
CREATE TYPE "amendment_effect_type" AS ENUM ('REPLACE_TEXT', 'ADD_TEXT', 'DELETE_TEXT', 'MODIFY_THRESHOLD', 'MODIFY_DEFINITION', 'MODIFY_RELATIONSHIP', 'MODIFY_ENTITY_SCOPE', 'MODIFY_EFFECTIVE_DATE', 'ADD_EXCEPTION', 'REMOVE_EXCEPTION', 'ADD_COVENANT', 'REMOVE_COVENANT');

-- CreateEnum
CREATE TYPE "definition_dependency_type" AS ENUM ('USES_TERM', 'USES_SECTION', 'USES_FINANCIAL_INPUT', 'USES_ACCOUNTING_CONCEPT', 'EXCLUDES_TERM', 'INCLUDES_TERM', 'SUBJECT_TO_CAP', 'SUBJECT_TO_CONDITION', 'INCORPORATES_RULE');

-- CreateEnum
CREATE TYPE "contract_reference_type" AS ENUM ('SUBJECT_TO', 'EXCEPT_AS_PROVIDED_IN', 'PERMITTED_BY', 'DEFINED_IN', 'CALCULATED_UNDER', 'REQUIRES', 'LIMITED_BY', 'INCORPORATES', 'OVERRIDES', 'SAME_AS', 'LINKED_PERMISSION', 'LIEN_AUTHORITY_FOR', 'DEBT_AUTHORITY_FOR', 'ACTIVATES', 'DEACTIVATES');

-- CreateEnum
CREATE TYPE "contract_reference_target_type" AS ENUM ('RULE', 'SECTION', 'DEFINED_TERM', 'DOCUMENT', 'UNRESOLVED');

-- CreateEnum
CREATE TYPE "contract_rule_relationship_type" AS ENUM ('ALTERNATIVE_TO', 'CONCURRENT_COUNTED', 'CONCURRENT_DISREGARDED', 'INDEPENDENT_REQUIREMENT', 'SHARES_CAPACITY_WITH', 'REQUIRES', 'LIMITED_BY', 'AUTOMATIC_LINKED_PERMISSION', 'BASKET_FEEDING', 'COMBINABLE', 'RECLASSIFIABLE_TO', 'REDESIGNATES_TO', 'EXCLUDED_FROM', 'OVERRIDES', 'ACTIVATES', 'DEACTIVATES', 'PARAMETER_ADJUSTMENT_TRIGGER', 'SOURCE_PRECEDENCE');

-- CreateEnum
CREATE TYPE "contract_condition_type" AS ENUM ('NO_DEFAULT', 'RATIO_SATISFIED', 'MINIMUM_LIQUIDITY', 'MATERIAL_ACQUISITION', 'RATING_STATUS', 'ENTITY_TYPE', 'SECURITY_SCOPE', 'PURPOSE', 'ACQUISITION_CONTEXT', 'REFINANCING_CONTEXT', 'REINVESTMENT_PERIOD', 'TIME_PERIOD', 'AMOUNT_THRESHOLD', 'OTHER_RULE_SATISFIED', 'UNSUPPORTED');

-- CreateEnum
CREATE TYPE "input_requirement_state" AS ENUM ('AVAILABLE', 'MISSING', 'STALE', 'CONFLICTING', 'CERTIFIED', 'ESTIMATED', 'REVIEW_REQUIRED');

-- CreateEnum
CREATE TYPE "obligation_satisfaction_state" AS ENUM ('PENDING', 'SATISFIED', 'OVERDUE', 'WAIVED', 'NOT_APPLICABLE');

-- CreateEnum
CREATE TYPE "contract_coverage_status" AS ENUM ('FULLY_MODELED', 'PARTIALLY_MODELED', 'REVIEW_REQUIRED', 'UNSUPPORTED', 'NOT_APPLICABLE', 'NOT_TESTED');

-- CreateEnum
CREATE TYPE "unresolved_contract_item_type" AS ENUM ('UNRESOLVED_CROSS_REFERENCE', 'MISSING_DEFINITION', 'UNSUPPORTED_RULE_TYPE', 'AMBIGUOUS_SCOPE', 'UNKNOWN_RELATIONSHIP', 'CONFLICTING_AMENDMENT', 'MISSING_EXTERNAL_INPUT', 'OTHER');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "entity_class_tag" ADD VALUE 'PARENT';
ALTER TYPE "entity_class_tag" ADD VALUE 'LOAN_PARTY';
ALTER TYPE "entity_class_tag" ADD VALUE 'MATERIAL_SUBSIDIARY';
ALTER TYPE "entity_class_tag" ADD VALUE 'ANY_SUBSIDIARY';

-- CreateTable
CREATE TABLE "document_nodes" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "stableKey" TEXT NOT NULL,
    "parentId" TEXT,
    "nodeType" "document_node_type" NOT NULL,
    "heading" TEXT,
    "sectionRef" TEXT,
    "ordinal" INTEGER NOT NULL DEFAULT 0,
    "charStart" INTEGER,
    "charEnd" INTEGER,
    "page" INTEGER,
    "effectiveFrom" TIMESTAMP(3),
    "effectiveTo" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "document_nodes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_relationship_edges" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "sourceDocumentId" TEXT NOT NULL,
    "targetDocumentId" TEXT NOT NULL,
    "relationshipType" "document_relationship_type" NOT NULL,
    "effectiveDate" TIMESTAMP(3),
    "sourceCitation" TEXT,
    "scopeNote" TEXT,
    "confidence" DOUBLE PRECISION,
    "reviewStatus" "extraction_candidate_review_status" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_relationship_edges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "defined_term_nodes" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "stableKey" TEXT NOT NULL,
    "termName" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "sourceNodeId" TEXT,
    "definitionTextRef" TEXT,
    "effectiveFrom" TIMESTAMP(3),
    "effectiveTo" TIMESTAMP(3),
    "reviewStatus" "extraction_candidate_review_status" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "defined_term_nodes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "defined_term_dependency_edges" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "fromTermId" TEXT NOT NULL,
    "dependencyType" "definition_dependency_type" NOT NULL,
    "toTermId" TEXT,
    "toSectionRef" TEXT,
    "toFinancialInputKey" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "defined_term_dependency_edges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contract_reference_edges" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "sourceNodeId" TEXT,
    "sourceRuleId" TEXT,
    "referenceType" "contract_reference_type" NOT NULL,
    "referenceText" TEXT NOT NULL,
    "targetType" "contract_reference_target_type" NOT NULL,
    "targetRuleId" TEXT,
    "targetDocumentNodeId" TEXT,
    "targetTermId" TEXT,
    "targetDocumentId" TEXT,
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "unresolvedReason" TEXT,
    "impact" TEXT,
    "confidence" DOUBLE PRECISION,
    "reviewStatus" "extraction_candidate_review_status" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contract_reference_edges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contract_rules" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "sourceDocumentId" TEXT NOT NULL,
    "sourceNodeId" TEXT,
    "stableKey" TEXT NOT NULL,
    "covenantFamily" "covenant_family" NOT NULL,
    "ruleType" "contract_rule_type" NOT NULL,
    "evaluationClass" "rule_evaluation_class" NOT NULL,
    "posture" "contract_rule_posture" NOT NULL DEFAULT 'N_A',
    "action" TEXT NOT NULL,
    "entityScope" "entity_class_tag"[],
    "entityScopeExcluded" "entity_class_tag"[],
    "beneficiary" TEXT,
    "thresholdValue" DECIMAL(18,6),
    "thresholdUnit" TEXT,
    "formulaRef" TEXT,
    "operator" TEXT,
    "conditions" JSONB,
    "exceptions" JSONB,
    "sourceSectionRef" TEXT NOT NULL,
    "definedTermRefs" TEXT[],
    "effectiveFrom" TIMESTAMP(3),
    "effectiveTo" TIMESTAMP(3),
    "supersededByRuleId" TEXT,
    "coverageStatus" "contract_coverage_status" NOT NULL DEFAULT 'NOT_TESTED',
    "reviewStatus" "extraction_candidate_review_status" NOT NULL DEFAULT 'PENDING',
    "extractionOrigin" JSONB,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contract_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contract_rule_relationships" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "fromRuleId" TEXT NOT NULL,
    "toRuleId" TEXT NOT NULL,
    "relationshipType" "contract_rule_relationship_type" NOT NULL,
    "parameter" JSONB,
    "sourceSectionRef" TEXT,
    "notes" TEXT,
    "confidence" DOUBLE PRECISION,
    "reviewStatus" "extraction_candidate_review_status" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contract_rule_relationships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "amendment_effects" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "amendmentDocumentId" TEXT NOT NULL,
    "effectType" "amendment_effect_type" NOT NULL,
    "targetRuleId" TEXT,
    "targetTermId" TEXT,
    "targetDocumentNodeId" TEXT,
    "effectiveDate" TIMESTAMP(3),
    "description" TEXT NOT NULL,
    "oldValueSnapshot" JSONB,
    "newValueSnapshot" JSONB,
    "sourceSectionRef" TEXT,
    "reviewStatus" "extraction_candidate_review_status" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "amendment_effects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contract_event_obligations" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "stableKey" TEXT NOT NULL,
    "sourceRuleId" TEXT,
    "eventType" TEXT NOT NULL,
    "conditionDescription" TEXT,
    "deadlineKind" TEXT NOT NULL,
    "deadlineDays" INTEGER,
    "deadlineDate" TIMESTAMP(3),
    "requiredAction" TEXT NOT NULL,
    "satisfactionState" "obligation_satisfaction_state" NOT NULL DEFAULT 'PENDING',
    "sourceSectionRef" TEXT,
    "reviewStatus" "extraction_candidate_review_status" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contract_event_obligations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contract_coverage_records" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "documentId" TEXT,
    "covenantFamily" "covenant_family",
    "ruleId" TEXT,
    "status" "contract_coverage_status" NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contract_coverage_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "unresolved_contract_items" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "itemType" "unresolved_contract_item_type" NOT NULL,
    "sourceRuleId" TEXT,
    "sourceTermId" TEXT,
    "sourceReferenceId" TEXT,
    "description" TEXT NOT NULL,
    "impact" TEXT,
    "blocking" BOOLEAN NOT NULL DEFAULT true,
    "reviewStatus" "extraction_candidate_review_status" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "unresolved_contract_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "document_nodes_companyId_documentId_idx" ON "document_nodes"("companyId", "documentId");

-- CreateIndex
CREATE INDEX "document_nodes_parentId_idx" ON "document_nodes"("parentId");

-- CreateIndex
CREATE UNIQUE INDEX "document_nodes_companyId_stableKey_key" ON "document_nodes"("companyId", "stableKey");

-- CreateIndex
CREATE INDEX "document_relationship_edges_companyId_idx" ON "document_relationship_edges"("companyId");

-- CreateIndex
CREATE INDEX "document_relationship_edges_sourceDocumentId_idx" ON "document_relationship_edges"("sourceDocumentId");

-- CreateIndex
CREATE INDEX "document_relationship_edges_targetDocumentId_idx" ON "document_relationship_edges"("targetDocumentId");

-- CreateIndex
CREATE INDEX "defined_term_nodes_companyId_documentId_idx" ON "defined_term_nodes"("companyId", "documentId");

-- CreateIndex
CREATE INDEX "defined_term_nodes_companyId_normalizedName_idx" ON "defined_term_nodes"("companyId", "normalizedName");

-- CreateIndex
CREATE UNIQUE INDEX "defined_term_nodes_companyId_stableKey_key" ON "defined_term_nodes"("companyId", "stableKey");

-- CreateIndex
CREATE INDEX "defined_term_dependency_edges_companyId_idx" ON "defined_term_dependency_edges"("companyId");

-- CreateIndex
CREATE INDEX "defined_term_dependency_edges_fromTermId_idx" ON "defined_term_dependency_edges"("fromTermId");

-- CreateIndex
CREATE INDEX "defined_term_dependency_edges_toTermId_idx" ON "defined_term_dependency_edges"("toTermId");

-- CreateIndex
CREATE INDEX "contract_reference_edges_companyId_idx" ON "contract_reference_edges"("companyId");

-- CreateIndex
CREATE INDEX "contract_reference_edges_sourceRuleId_idx" ON "contract_reference_edges"("sourceRuleId");

-- CreateIndex
CREATE INDEX "contract_reference_edges_targetRuleId_idx" ON "contract_reference_edges"("targetRuleId");

-- CreateIndex
CREATE INDEX "contract_reference_edges_companyId_resolved_idx" ON "contract_reference_edges"("companyId", "resolved");

-- CreateIndex
CREATE INDEX "contract_rules_companyId_covenantFamily_idx" ON "contract_rules"("companyId", "covenantFamily");

-- CreateIndex
CREATE INDEX "contract_rules_companyId_action_idx" ON "contract_rules"("companyId", "action");

-- CreateIndex
CREATE INDEX "contract_rules_sourceDocumentId_idx" ON "contract_rules"("sourceDocumentId");

-- CreateIndex
CREATE UNIQUE INDEX "contract_rules_companyId_stableKey_key" ON "contract_rules"("companyId", "stableKey");

-- CreateIndex
CREATE INDEX "contract_rule_relationships_companyId_idx" ON "contract_rule_relationships"("companyId");

-- CreateIndex
CREATE INDEX "contract_rule_relationships_fromRuleId_idx" ON "contract_rule_relationships"("fromRuleId");

-- CreateIndex
CREATE INDEX "contract_rule_relationships_toRuleId_idx" ON "contract_rule_relationships"("toRuleId");

-- CreateIndex
CREATE INDEX "amendment_effects_companyId_idx" ON "amendment_effects"("companyId");

-- CreateIndex
CREATE INDEX "amendment_effects_amendmentDocumentId_idx" ON "amendment_effects"("amendmentDocumentId");

-- CreateIndex
CREATE INDEX "contract_event_obligations_companyId_idx" ON "contract_event_obligations"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "contract_event_obligations_companyId_stableKey_key" ON "contract_event_obligations"("companyId", "stableKey");

-- CreateIndex
CREATE INDEX "contract_coverage_records_companyId_idx" ON "contract_coverage_records"("companyId");

-- CreateIndex
CREATE INDEX "contract_coverage_records_companyId_covenantFamily_idx" ON "contract_coverage_records"("companyId", "covenantFamily");

-- CreateIndex
CREATE INDEX "unresolved_contract_items_companyId_idx" ON "unresolved_contract_items"("companyId");

-- CreateIndex
CREATE INDEX "unresolved_contract_items_companyId_blocking_idx" ON "unresolved_contract_items"("companyId", "blocking");

-- AddForeignKey
ALTER TABLE "document_nodes" ADD CONSTRAINT "document_nodes_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_nodes" ADD CONSTRAINT "document_nodes_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_nodes" ADD CONSTRAINT "document_nodes_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "document_nodes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_relationship_edges" ADD CONSTRAINT "document_relationship_edges_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_relationship_edges" ADD CONSTRAINT "document_relationship_edges_sourceDocumentId_fkey" FOREIGN KEY ("sourceDocumentId") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_relationship_edges" ADD CONSTRAINT "document_relationship_edges_targetDocumentId_fkey" FOREIGN KEY ("targetDocumentId") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "defined_term_nodes" ADD CONSTRAINT "defined_term_nodes_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "defined_term_nodes" ADD CONSTRAINT "defined_term_nodes_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "defined_term_nodes" ADD CONSTRAINT "defined_term_nodes_sourceNodeId_fkey" FOREIGN KEY ("sourceNodeId") REFERENCES "document_nodes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "defined_term_dependency_edges" ADD CONSTRAINT "defined_term_dependency_edges_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "defined_term_dependency_edges" ADD CONSTRAINT "defined_term_dependency_edges_fromTermId_fkey" FOREIGN KEY ("fromTermId") REFERENCES "defined_term_nodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "defined_term_dependency_edges" ADD CONSTRAINT "defined_term_dependency_edges_toTermId_fkey" FOREIGN KEY ("toTermId") REFERENCES "defined_term_nodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_reference_edges" ADD CONSTRAINT "contract_reference_edges_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_reference_edges" ADD CONSTRAINT "contract_reference_edges_sourceNodeId_fkey" FOREIGN KEY ("sourceNodeId") REFERENCES "document_nodes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_reference_edges" ADD CONSTRAINT "contract_reference_edges_sourceRuleId_fkey" FOREIGN KEY ("sourceRuleId") REFERENCES "contract_rules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_reference_edges" ADD CONSTRAINT "contract_reference_edges_targetRuleId_fkey" FOREIGN KEY ("targetRuleId") REFERENCES "contract_rules"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_reference_edges" ADD CONSTRAINT "contract_reference_edges_targetDocumentNodeId_fkey" FOREIGN KEY ("targetDocumentNodeId") REFERENCES "document_nodes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_reference_edges" ADD CONSTRAINT "contract_reference_edges_targetTermId_fkey" FOREIGN KEY ("targetTermId") REFERENCES "defined_term_nodes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_reference_edges" ADD CONSTRAINT "contract_reference_edges_targetDocumentId_fkey" FOREIGN KEY ("targetDocumentId") REFERENCES "documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_rules" ADD CONSTRAINT "contract_rules_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_rules" ADD CONSTRAINT "contract_rules_sourceDocumentId_fkey" FOREIGN KEY ("sourceDocumentId") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_rules" ADD CONSTRAINT "contract_rules_sourceNodeId_fkey" FOREIGN KEY ("sourceNodeId") REFERENCES "document_nodes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_rules" ADD CONSTRAINT "contract_rules_supersededByRuleId_fkey" FOREIGN KEY ("supersededByRuleId") REFERENCES "contract_rules"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_rule_relationships" ADD CONSTRAINT "contract_rule_relationships_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_rule_relationships" ADD CONSTRAINT "contract_rule_relationships_fromRuleId_fkey" FOREIGN KEY ("fromRuleId") REFERENCES "contract_rules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_rule_relationships" ADD CONSTRAINT "contract_rule_relationships_toRuleId_fkey" FOREIGN KEY ("toRuleId") REFERENCES "contract_rules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "amendment_effects" ADD CONSTRAINT "amendment_effects_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "amendment_effects" ADD CONSTRAINT "amendment_effects_amendmentDocumentId_fkey" FOREIGN KEY ("amendmentDocumentId") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "amendment_effects" ADD CONSTRAINT "amendment_effects_targetRuleId_fkey" FOREIGN KEY ("targetRuleId") REFERENCES "contract_rules"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "amendment_effects" ADD CONSTRAINT "amendment_effects_targetTermId_fkey" FOREIGN KEY ("targetTermId") REFERENCES "defined_term_nodes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "amendment_effects" ADD CONSTRAINT "amendment_effects_targetDocumentNodeId_fkey" FOREIGN KEY ("targetDocumentNodeId") REFERENCES "document_nodes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_event_obligations" ADD CONSTRAINT "contract_event_obligations_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_event_obligations" ADD CONSTRAINT "contract_event_obligations_sourceRuleId_fkey" FOREIGN KEY ("sourceRuleId") REFERENCES "contract_rules"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_coverage_records" ADD CONSTRAINT "contract_coverage_records_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_coverage_records" ADD CONSTRAINT "contract_coverage_records_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_coverage_records" ADD CONSTRAINT "contract_coverage_records_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "contract_rules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "unresolved_contract_items" ADD CONSTRAINT "unresolved_contract_items_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "unresolved_contract_items" ADD CONSTRAINT "unresolved_contract_items_sourceRuleId_fkey" FOREIGN KEY ("sourceRuleId") REFERENCES "contract_rules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "unresolved_contract_items" ADD CONSTRAINT "unresolved_contract_items_sourceTermId_fkey" FOREIGN KEY ("sourceTermId") REFERENCES "defined_term_nodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "unresolved_contract_items" ADD CONSTRAINT "unresolved_contract_items_sourceReferenceId_fkey" FOREIGN KEY ("sourceReferenceId") REFERENCES "contract_reference_edges"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- CheckConstraint: a DefinedTermDependencyEdge must point at EXACTLY ONE
-- polymorphic target (task §16 - a dependency edge is never ambiguous about
-- what it references).
ALTER TABLE "defined_term_dependency_edges" ADD CONSTRAINT "defined_term_dependency_edges_exactly_one_target" CHECK (
  (("toTermId" IS NOT NULL)::int + ("toSectionRef" IS NOT NULL)::int + ("toFinancialInputKey" IS NOT NULL)::int) = 1
);

-- CheckConstraint: a ContractReferenceEdge's targetType discriminant must
-- agree with which polymorphic target column is actually set (task §17-19).
ALTER TABLE "contract_reference_edges" ADD CONSTRAINT "contract_reference_edges_target_matches_type" CHECK (
  ("targetType" = 'RULE' AND "targetRuleId" IS NOT NULL)
  OR ("targetType" = 'SECTION' AND "targetDocumentNodeId" IS NOT NULL)
  OR ("targetType" = 'DEFINED_TERM' AND "targetTermId" IS NOT NULL)
  OR ("targetType" = 'DOCUMENT' AND "targetDocumentId" IS NOT NULL)
  OR ("targetType" = 'UNRESOLVED' AND "resolved" = false)
);
