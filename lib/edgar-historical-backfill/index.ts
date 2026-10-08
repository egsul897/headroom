/**
 * EDGAR Historical Backfill Engine (discovery / coverage / scheduling).
 *
 * Coordinates with WS-CKF (Covenant Knowledge Factory / lib/knowledge-factory):
 * - Does NOT download exhibit bodies (CKF acquisition owns that).
 * - Does NOT create a second source registry.
 * - Publishes acquisition-queue + ckf-handoff for CKF to consume.
 * - Process-local fair-access + explicit fleet budget/owner contract.
 */

export * from "./types";
export * from "./sec-identity";
export * from "./fleet-sec-budget";
export * from "./sec-access";
export * from "./exhibit-classifier";
export * from "./ibr-resolver";
export * from "./ibr-residuals";
export * from "./index-parser";
export * from "./primary-exhibit-index";
export * from "./submissions";
export * from "./dedupe";
export * from "./coverage";
export * from "./ranking";
export * from "./relationships";
export * from "./queue-validate";
export * from "./ckf-handoff";
export * from "./integrity";
export * from "./checkpoint";
export { runHistoricalDiscovery, type RunDiscoveryOptions } from "./engine";
