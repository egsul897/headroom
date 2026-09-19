/**
 * PHASE 4A - deterministic compositional expression runtime.
 *
 * The runtime version is part of every evaluation result's identity: the same
 * IR + the same inputs + the same runtime version must yield byte-stable
 * semantic content. Bump it whenever evaluation semantics change.
 */
export const CONTRACT_RUNTIME_VERSION = "contract-runtime.v1";
