/**
 * Shared constants for the HTTPS precedent loader.
 * Live writes require the mass-precedent gate. Rows are precedent-only.
 */

export const MASS_LIVE_ENV = "KF_MASS_PRECEDENT_LIVE_WRITE";
export const MASS_LIVE_TOKEN = "I_AUTHORIZE_NEON_BULK_WRITE";
export const AUTHORITY_STATUS = "COMPUTED_NOT_CERTIFIED" as const;
export const BATCH_KEY = "kf-https-precedent.v1";
