export {
  COVENANT_LEARNING_FACTORY_VERSION,
  type LearningKnowledgeState,
  type LearningCohort,
  type LearningPackageSpec,
  type PackageAuditManifest,
  type DashboardReport,
  type BatchCheckpoint,
  type BatchBudget,
} from "./types";

export { DEFAULT_HELD_OUT_CIKS, assignCohort, assertNoHeldOutContamination, normalizeCik } from "./cohorts";
export { listLearningPackages, getLearningPackage, loadPackageDocuments } from "./package-registry";
export { processLearningPackage } from "./process-package";
export { runLearningBatch, DEFAULT_BATCH_BUDGET } from "./batch-runner";
export { buildDashboardReport } from "./dashboard";
export { BASELINE_CAPABILITY_INVENTORY, renderInventoryMarkdown } from "./inventory";
export { LearningFileStore, defaultLearningStorePaths } from "./store/file-store";
export { probeNeonLive, persistPackageManifestToNeon } from "./store/neon-store";
export {
  createClfPrismaClient,
  createNeonHttpsExecutor,
  getNeonTransportMode,
  redactConnectionSecrets,
} from "./store/neon-transport";
export {
  applyClfMigrationOverHttps,
  countLearningTables,
  CLF_MIGRATION_NAME,
  CLF_LEARNING_TABLES,
  assertMigrationSqlSafe,
  loadClfMigrationSql,
} from "./store/neon-migration-apply";
export {
  assertLearningFactoryCannotWriteProductionAuthority,
  assertAutomatedKnowledgeState,
  defaultHonestyClaims,
} from "./promotion-guards";
