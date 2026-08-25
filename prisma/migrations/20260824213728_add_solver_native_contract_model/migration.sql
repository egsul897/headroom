-- CreateEnum
CREATE TYPE "grant_type" AS ENUM ('DEBT_INCURRENCE', 'LIEN');

-- CreateEnum
CREATE TYPE "amount_kind" AS ENUM ('FIXED', 'INCURRENCE_BASED');

-- CreateEnum
CREATE TYPE "modeling_status" AS ENUM ('MODELED', 'KNOWN_NOT_MODELED');

-- CreateEnum
CREATE TYPE "measurement_basis" AS ENUM ('CUMULATIVE_INCURRED', 'CURRENTLY_OUTSTANDING', 'NET_OF_REPAYMENT', 'PREPAYMENT_CREDIT');

-- CreateEnum
CREATE TYPE "stacking_relationship_type" AS ENUM ('CONCURRENT_DISREGARDED', 'CONCURRENT_COUNTED', 'ALTERNATIVE', 'MUTUALLY_EXCLUSIVE', 'AUTOMATIC_LINKED_PERMISSION', 'EQUAL_AND_RATABLE_PULLUP', 'PARAMETER_ADJUSTMENT_TRIGGER', 'SHARED_CONSTRAINT_PARTICIPATION', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "aggregation_rule" AS ENUM ('NAMED_MEMBER_CLAUSES', 'EXTERNAL_INSTRUMENT_BALANCE', 'ENTITY_CLASS_FILTER');

-- CreateEnum
CREATE TYPE "priority_tier" AS ENUM ('FIRST', 'SECOND', 'PARI_PASSU', 'UNSECURED');

-- CreateEnum
CREATE TYPE "entity_class_tag" AS ENUM ('BORROWER', 'GUARANTOR_RS', 'NON_GUARANTOR_RS', 'FOREIGN_RS', 'UNRESTRICTED_SUB', 'SECURITIZATION_SUB', 'IMMATERIAL_SUB');

-- CreateEnum
CREATE TYPE "rule_activation_effect" AS ENUM ('APPLICABILITY', 'PARAMETER_VALUE', 'RETROACTIVE_REEXAMINATION');

-- CreateEnum
CREATE TYPE "state_predicate_kind" AS ENUM ('POINT_IN_TIME', 'CONTINUITY_WINDOW', 'EVENT_TRIGGERED', 'USAGE_LIMITED');

-- CreateEnum
CREATE TYPE "external_input_kind" AS ENUM ('COMPUTABLE_FORMULA', 'CERTIFIED_EXTERNAL_INPUT', 'DISCRETIONARY_CATCH_ALL', 'HUMAN_CLASSIFICATION');

-- CreateTable
CREATE TABLE "permissions" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "code" TEXT,
    "grantType" "grant_type" NOT NULL,
    "amountKind" "amount_kind" NOT NULL,
    "action" TEXT NOT NULL,
    "entityScope" "entity_class_tag"[],
    "formulaType" "formula_type" NOT NULL,
    "thresholdValue" DECIMAL(18,6) NOT NULL,
    "params" JSONB,
    "eligibilityConditions" JSONB,
    "termConditions" JSONB,
    "measurementBasis" "measurement_basis" NOT NULL,
    "sectionRef" TEXT NOT NULL,
    "definedTermRefs" TEXT[],
    "effectiveFrom" TIMESTAMP(3),
    "effectiveTo" TIMESTAMP(3),
    "modelingStatus" "modeling_status" NOT NULL DEFAULT 'KNOWN_NOT_MODELED',
    "reviewStatus" "defined_term_status" NOT NULL DEFAULT 'UNVERIFIED',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permission_relationships" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "fromPermissionId" TEXT NOT NULL,
    "toPermissionId" TEXT NOT NULL,
    "relationshipType" "stacking_relationship_type" NOT NULL,
    "groupKey" TEXT,
    "parameter" JSONB,
    "sourceSectionRef" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "permission_relationships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shared_capacity_constraints" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "capAmount" DECIMAL(18,6),
    "capFormulaType" "formula_type",
    "capParams" JSONB,
    "aggregationRule" "aggregation_rule" NOT NULL,
    "measurementBasis" "measurement_basis" NOT NULL,
    "followsRefinancing" BOOLEAN NOT NULL DEFAULT false,
    "sourceSectionRef" TEXT NOT NULL,
    "effectiveFrom" TIMESTAMP(3),
    "effectiveTo" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shared_capacity_constraints_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shared_capacity_constraint_members" (
    "id" TEXT NOT NULL,
    "constraintId" TEXT NOT NULL,
    "permissionId" TEXT,
    "namedInstrument" TEXT,
    "entityClass" "entity_class_tag",
    "externalInstrumentRef" TEXT,

    CONSTRAINT "shared_capacity_constraint_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "collateral_pools" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "definedTermRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "collateral_pools_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permission_collateral_scopes" (
    "id" TEXT NOT NULL,
    "permissionId" TEXT NOT NULL,
    "collateralPoolId" TEXT NOT NULL,
    "priorityTier" "priority_tier" NOT NULL,
    "pariPassuWithGroupId" TEXT,
    "intercreditorAgreementId" TEXT,

    CONSTRAINT "permission_collateral_scopes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "intercreditor_agreements" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "governs" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "intercreditor_agreements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rule_activation_conditions" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "permissionId" TEXT,
    "covenantSectionIds" TEXT[],
    "companyWide" BOOLEAN NOT NULL DEFAULT false,
    "predicateKind" "state_predicate_kind" NOT NULL,
    "predicateConfig" JSONB NOT NULL,
    "effect" "rule_activation_effect" NOT NULL,
    "parameterName" TEXT,
    "reversionPredicateConfig" JSONB,
    "sourceSectionRef" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rule_activation_conditions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "entity_class_members" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "entityName" TEXT NOT NULL,
    "entityClass" "entity_class_tag" NOT NULL,

    CONSTRAINT "entity_class_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "external_input_records" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "kind" "external_input_kind" NOT NULL,
    "name" TEXT NOT NULL,
    "value" DECIMAL(18,6),
    "asOfDate" TIMESTAMP(3),
    "sourceRef" TEXT,
    "reviewStatus" "defined_term_status" NOT NULL DEFAULT 'UNVERIFIED',
    "maxAgeDays" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "external_input_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "solver_coverage_declarations" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "side" TEXT NOT NULL,
    "grantType" "grant_type" NOT NULL,
    "isComplete" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "solver_coverage_declarations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "permissions_documentId_grantType_idx" ON "permissions"("documentId", "grantType");

-- CreateIndex
CREATE INDEX "permissions_companyId_idx" ON "permissions"("companyId");

-- CreateIndex
CREATE INDEX "permission_relationships_fromPermissionId_idx" ON "permission_relationships"("fromPermissionId");

-- CreateIndex
CREATE INDEX "permission_relationships_toPermissionId_idx" ON "permission_relationships"("toPermissionId");

-- CreateIndex
CREATE INDEX "permission_relationships_groupKey_idx" ON "permission_relationships"("groupKey");

-- CreateIndex
CREATE INDEX "shared_capacity_constraints_companyId_idx" ON "shared_capacity_constraints"("companyId");

-- CreateIndex
CREATE INDEX "shared_capacity_constraint_members_constraintId_idx" ON "shared_capacity_constraint_members"("constraintId");

-- CreateIndex
CREATE INDEX "shared_capacity_constraint_members_permissionId_idx" ON "shared_capacity_constraint_members"("permissionId");

-- CreateIndex
CREATE INDEX "collateral_pools_companyId_idx" ON "collateral_pools"("companyId");

-- CreateIndex
CREATE INDEX "permission_collateral_scopes_permissionId_idx" ON "permission_collateral_scopes"("permissionId");

-- CreateIndex
CREATE INDEX "permission_collateral_scopes_collateralPoolId_idx" ON "permission_collateral_scopes"("collateralPoolId");

-- CreateIndex
CREATE INDEX "intercreditor_agreements_companyId_idx" ON "intercreditor_agreements"("companyId");

-- CreateIndex
CREATE INDEX "rule_activation_conditions_companyId_idx" ON "rule_activation_conditions"("companyId");

-- CreateIndex
CREATE INDEX "rule_activation_conditions_permissionId_idx" ON "rule_activation_conditions"("permissionId");

-- CreateIndex
CREATE UNIQUE INDEX "entity_class_members_companyId_entityName_key" ON "entity_class_members"("companyId", "entityName");

-- CreateIndex
CREATE INDEX "external_input_records_companyId_idx" ON "external_input_records"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "solver_coverage_declarations_documentId_side_grantType_key" ON "solver_coverage_declarations"("documentId", "side", "grantType");

-- AddForeignKey
ALTER TABLE "permissions" ADD CONSTRAINT "permissions_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "permissions" ADD CONSTRAINT "permissions_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "permission_relationships" ADD CONSTRAINT "permission_relationships_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "permission_relationships" ADD CONSTRAINT "permission_relationships_fromPermissionId_fkey" FOREIGN KEY ("fromPermissionId") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "permission_relationships" ADD CONSTRAINT "permission_relationships_toPermissionId_fkey" FOREIGN KEY ("toPermissionId") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shared_capacity_constraints" ADD CONSTRAINT "shared_capacity_constraints_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shared_capacity_constraint_members" ADD CONSTRAINT "shared_capacity_constraint_members_constraintId_fkey" FOREIGN KEY ("constraintId") REFERENCES "shared_capacity_constraints"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shared_capacity_constraint_members" ADD CONSTRAINT "shared_capacity_constraint_members_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collateral_pools" ADD CONSTRAINT "collateral_pools_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "permission_collateral_scopes" ADD CONSTRAINT "permission_collateral_scopes_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "permission_collateral_scopes" ADD CONSTRAINT "permission_collateral_scopes_collateralPoolId_fkey" FOREIGN KEY ("collateralPoolId") REFERENCES "collateral_pools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "permission_collateral_scopes" ADD CONSTRAINT "permission_collateral_scopes_intercreditorAgreementId_fkey" FOREIGN KEY ("intercreditorAgreementId") REFERENCES "intercreditor_agreements"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "intercreditor_agreements" ADD CONSTRAINT "intercreditor_agreements_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rule_activation_conditions" ADD CONSTRAINT "rule_activation_conditions_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rule_activation_conditions" ADD CONSTRAINT "rule_activation_conditions_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entity_class_members" ADD CONSTRAINT "entity_class_members_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "external_input_records" ADD CONSTRAINT "external_input_records_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "solver_coverage_declarations" ADD CONSTRAINT "solver_coverage_declarations_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
