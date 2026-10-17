-- Grok lane 2: filings monitoring, covenant bands, CFO notifications, brief visits, finance members, sweep cursor. Additive only.
-- NOT applied to Neon by this PR; Egzon applies migrations. Rollback: down.sql in this folder.
-- CreateTable
CREATE TABLE "monitored_filings" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "cik" TEXT NOT NULL,
    "accessionNumber" TEXT NOT NULL,
    "form" TEXT NOT NULL,
    "filingDate" TEXT NOT NULL,
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "monitored_filings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "covenant_band_thresholds" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "covenantKey" TEXT NOT NULL,
    "healthyUntil" DOUBLE PRECISION NOT NULL,
    "moderateUntil" DOUBLE PRECISION NOT NULL,
    "updatedBy" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "covenant_band_thresholds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "covenant_band_events" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "covenantKey" TEXT NOT NULL,
    "covenantName" TEXT NOT NULL,
    "documentName" TEXT NOT NULL,
    "sectionRef" TEXT NOT NULL,
    "fromBand" TEXT,
    "toBand" TEXT NOT NULL,
    "actual" DOUBLE PRECISION,
    "limitValue" DOUBLE PRECISION NOT NULL,
    "healthyUntil" DOUBLE PRECISION,
    "moderateUntil" DOUBLE PRECISION,
    "direction" TEXT NOT NULL,
    "asOfDate" TEXT NOT NULL,
    "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "covenant_band_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workspace_visits" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "lastVisitAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workspace_visits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workspace_notifications" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "link" TEXT,
    "dedupeKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readAt" TIMESTAMP(3),
    "emailStatus" TEXT NOT NULL DEFAULT 'NOT_SENT_DISABLED',

    CONSTRAINT "workspace_notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workspace_finance_members" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "alertEmails" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workspace_finance_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "monitoring_sweep_cursors" (
    "key" TEXT NOT NULL,
    "lastCompanyId" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "monitoring_sweep_cursors_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "monitored_filings_companyId_detectedAt_idx" ON "monitored_filings"("companyId", "detectedAt");

-- CreateIndex
CREATE UNIQUE INDEX "monitored_filings_companyId_accessionNumber_key" ON "monitored_filings"("companyId", "accessionNumber");

-- CreateIndex
CREATE UNIQUE INDEX "covenant_band_thresholds_companyId_covenantKey_key" ON "covenant_band_thresholds"("companyId", "covenantKey");

-- CreateIndex
CREATE INDEX "covenant_band_events_companyId_observedAt_idx" ON "covenant_band_events"("companyId", "observedAt");

-- CreateIndex
CREATE INDEX "covenant_band_events_companyId_covenantKey_observedAt_idx" ON "covenant_band_events"("companyId", "covenantKey", "observedAt");

-- CreateIndex
CREATE UNIQUE INDEX "workspace_visits_companyId_userId_key" ON "workspace_visits"("companyId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "workspace_notifications_dedupeKey_key" ON "workspace_notifications"("dedupeKey");

-- CreateIndex
CREATE INDEX "workspace_notifications_companyId_createdAt_idx" ON "workspace_notifications"("companyId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "workspace_finance_members_companyId_userId_key" ON "workspace_finance_members"("companyId", "userId");

