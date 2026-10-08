/**
 * EDGAR Historical Backfill Engine (discovery / coverage / scheduling).
 *
 * Coordinates with WS-CKF (Covenant Knowledge Factory):
 * - Does NOT download exhibit bodies (acquisition agent owns that).
 * - Does NOT create a second source registry (reuse lib/connectors/registry).
 * - Publishes acquisition-queue.json for CKF to consume.
 * - Shares fair-access SEC traffic via SecAccessCoordinator.
 */

export * from "./types";
export * from "./sec-access";
export * from "./exhibit-classifier";
export * from "./ibr-resolver";
export * from "./index-parser";
export * from "./submissions";
export * from "./dedupe";
export * from "./coverage";
export * from "./ranking";
export * from "./checkpoint";
export { runHistoricalDiscovery, type RunDiscoveryOptions } from "./engine";
