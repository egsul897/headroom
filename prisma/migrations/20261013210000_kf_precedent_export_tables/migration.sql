-- Knowledge-factory precedent export shards (COMPUTED_NOT_CERTIFIED / precedent-only).
-- Additive. Never production ContractRule / certification authority.

CREATE TABLE "kf_precedent_structural_nodes" (
  "nodeId" TEXT NOT NULL,
  "sourceId" TEXT NOT NULL,
  "nodeType" TEXT,
  "sectionRef" TEXT,
  "heading" TEXT,
  "charStart" INTEGER,
  "charEnd" INTEGER,
  "ambiguous" BOOLEAN,
  "authorityStatus" TEXT NOT NULL DEFAULT 'COMPUTED_NOT_CERTIFIED',
  "payloadJson" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "kf_precedent_structural_nodes_pkey" PRIMARY KEY ("nodeId")
);

CREATE INDEX "kf_precedent_structural_nodes_sourceId_idx" ON "kf_precedent_structural_nodes"("sourceId");

CREATE TABLE "kf_precedent_covenant_candidates" (
  "candidateId" TEXT NOT NULL,
  "sourceId" TEXT NOT NULL,
  "nodeId" TEXT,
  "familiesJson" JSONB NOT NULL,
  "signalsJson" JSONB NOT NULL,
  "excerpt" TEXT,
  "discoveryScore" DOUBLE PRECISION,
  "representationLevel" TEXT,
  "authorityStatus" TEXT NOT NULL DEFAULT 'COMPUTED_NOT_CERTIFIED',
  "payloadJson" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "kf_precedent_covenant_candidates_pkey" PRIMARY KEY ("candidateId")
);

CREATE INDEX "kf_precedent_covenant_candidates_sourceId_idx" ON "kf_precedent_covenant_candidates"("sourceId");

CREATE TABLE "kf_precedent_definitions" (
  "id" TEXT NOT NULL,
  "sourceId" TEXT NOT NULL,
  "term" TEXT NOT NULL,
  "charStart" INTEGER,
  "charEnd" INTEGER,
  "excerpt" TEXT,
  "authorityStatus" TEXT NOT NULL DEFAULT 'COMPUTED_NOT_CERTIFIED',
  "payloadJson" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "kf_precedent_definitions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "kf_precedent_definitions_sourceId_term_key" ON "kf_precedent_definitions"("sourceId", "term");
CREATE INDEX "kf_precedent_definitions_sourceId_idx" ON "kf_precedent_definitions"("sourceId");

CREATE TABLE "kf_precedent_dependency_edges" (
  "edgeId" TEXT NOT NULL,
  "sourceId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "rawReference" TEXT,
  "resolution" TEXT,
  "legalTruth" TEXT,
  "charStart" INTEGER,
  "charEnd" INTEGER,
  "authorityStatus" TEXT NOT NULL DEFAULT 'COMPUTED_NOT_CERTIFIED',
  "payloadJson" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "kf_precedent_dependency_edges_pkey" PRIMARY KEY ("edgeId")
);

CREATE INDEX "kf_precedent_dependency_edges_sourceId_idx" ON "kf_precedent_dependency_edges"("sourceId");

CREATE TABLE "kf_precedent_conditions_exceptions" (
  "id" TEXT NOT NULL,
  "sourceId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "nodeId" TEXT,
  "excerpt" TEXT,
  "signalsJson" JSONB,
  "representationLevel" TEXT,
  "charStart" INTEGER,
  "charEnd" INTEGER,
  "authorityStatus" TEXT NOT NULL DEFAULT 'COMPUTED_NOT_CERTIFIED',
  "payloadJson" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "kf_precedent_conditions_exceptions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "kf_precedent_conditions_exceptions_sourceId_idx" ON "kf_precedent_conditions_exceptions"("sourceId");

CREATE TABLE "kf_precedent_document_relationships" (
  "id" TEXT NOT NULL,
  "sourceId" TEXT NOT NULL,
  "targetId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "evidenceStatus" TEXT,
  "rationale" TEXT,
  "confidence" DOUBLE PRECISION,
  "authorityStatus" TEXT NOT NULL DEFAULT 'COMPUTED_NOT_CERTIFIED',
  "payloadJson" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "kf_precedent_document_relationships_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "kf_precedent_document_relationships_sourceId_idx" ON "kf_precedent_document_relationships"("sourceId");
CREATE INDEX "kf_precedent_document_relationships_targetId_idx" ON "kf_precedent_document_relationships"("targetId");

CREATE TABLE "kf_precedent_unresolved_uncertainties" (
  "id" TEXT NOT NULL,
  "sourceId" TEXT NOT NULL,
  "candidateId" TEXT,
  "nodeId" TEXT,
  "reasonsJson" JSONB,
  "excerpt" TEXT,
  "reviewerTask" TEXT,
  "suggestedRegression" TEXT,
  "authorityStatus" TEXT NOT NULL DEFAULT 'COMPUTED_NOT_CERTIFIED',
  "payloadJson" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "kf_precedent_unresolved_uncertainties_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "kf_precedent_unresolved_uncertainties_sourceId_idx" ON "kf_precedent_unresolved_uncertainties"("sourceId");

CREATE TABLE "kf_precedent_import_checkpoints" (
  "batchKey" TEXT NOT NULL,
  "stage" TEXT NOT NULL,
  "cursor" TEXT,
  "status" TEXT NOT NULL,
  "countsJson" JSONB NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "kf_precedent_import_checkpoints_pkey" PRIMARY KEY ("batchKey", "stage")
);
