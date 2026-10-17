import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

/**
 * Password hashing for SaaS account provisioning.
 *
 * Standard scrypt KDF from Node's own crypto (no home-rolled algorithm, no
 * custom construction): 128-bit random salt, cost=16384/blockSize=8/
 * parallelization=1, 64-byte key.
 * Stored format: `scrypt:<cost>:<blockSize>:<parallelization>:<saltHex>:<hashHex>`.
 * Verification uses constant-time comparison and fails closed (false) on
 * any malformed stored value.
 */
const MIN_PASSWORD_LENGTH = 8;
const SCRYPT_COST = 16384;
const SCRYPT_BLOCK_SIZE = 8;
const SCRYPT_PARALLELIZATION = 1;
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;

export function hashPassword(password: string): string {
  if (typeof password !== "string" || password.length < MIN_PASSWORD_LENGTH) {
    throw new Error("Password must be at least 8 characters.");
  }
  const salt = randomBytes(SALT_LENGTH);
  const hash = scryptSync(password, salt, KEY_LENGTH, {
    cost: SCRYPT_COST,
    blockSize: SCRYPT_BLOCK_SIZE,
    parallelization: SCRYPT_PARALLELIZATION,
  });
  return `scrypt:${SCRYPT_COST}:${SCRYPT_BLOCK_SIZE}:${SCRYPT_PARALLELIZATION}:${salt.toString("hex")}:${hash.toString("hex")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  try {
    if (typeof password !== "string" || typeof stored !== "string") return false;
    const parts = stored.split(":");
    if (parts.length !== 6 || parts[0] !== "scrypt") return false;
    const cost = Number(parts[1]);
    const blockSize = Number(parts[2]);
    const parallelization = Number(parts[3]);
    if (!Number.isInteger(cost) || !Number.isInteger(blockSize) || !Number.isInteger(parallelization)) return false;
    const saltHex = parts[4];
    const hashHex = parts[5];
    if (saltHex === undefined || hashHex === undefined) return false;
    const salt = Buffer.from(saltHex, "hex");
    const expected = Buffer.from(hashHex, "hex");
    if (salt.length !== SALT_LENGTH || expected.length !== KEY_LENGTH) return false;
    const actual = scryptSync(password, salt, KEY_LENGTH, { cost, blockSize, parallelization });
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}
