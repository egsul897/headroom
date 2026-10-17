/**
 * Short reconnect budget for Neon cold starts. Four tries, with 2s + 3s + 5s
 * of backoff (10s) between them. Only PrismaClientInitializationError and
 * connection failures are retried. Authentication and other request errors
 * propagate on the first failure.
 *
 * Prisma 5.22's library engine clears `libraryStartingPromise` after a failed
 * connect, so repeating the query on the same client opens a new connection.
 */

export const DB_COLD_START_ATTEMPTS = 4;
export const DB_COLD_START_DELAYS_MS = [2_000, 3_000, 5_000] as const;

const AUTH_CODES = new Set(["P1000", "P1010"]);
/** Init/config failures that a second attempt cannot fix. */
const NON_RETRYABLE_INIT_CODES = new Set(["P1000", "P1003", "P1010", "P1012", "P1013"]);
const CONNECTION_CODES = new Set(["P1001", "P1002", "P1017", "P2024"]);

const AUTH_MESSAGE = /authentication failed|provided database credentials|denied access|user was denied access/i;
const CONNECTION_MESSAGE =
  /Can't reach database server|Server has closed the connection|timed out fetching a new connection|ECONNREFUSED|ECONNRESET|ETIMEDOUT|Connection terminated unexpectedly|Connection timed out|the database system is (?:starting up|shutting down)|kind:\s*Closed/i;

function readCode(err: object): string | undefined {
  const rec = err as { code?: unknown; errorCode?: unknown };
  if (typeof rec.code === "string" && rec.code.length > 0) return rec.code;
  if (typeof rec.errorCode === "string" && rec.errorCode.length > 0) return rec.errorCode;
  return undefined;
}

function readMessage(err: object): string {
  const message = (err as { message?: unknown }).message;
  return typeof message === "string" ? message : "";
}

export function isRetryableDbError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const code = readCode(err);
  const message = readMessage(err);
  if ((code !== undefined && AUTH_CODES.has(code)) || AUTH_MESSAGE.test(message)) return false;
  if (code !== undefined && NON_RETRYABLE_INIT_CODES.has(code)) return false;

  const name = (err as { name?: unknown }).name;
  if (name === "PrismaClientInitializationError") return true;
  if (code !== undefined && CONNECTION_CODES.has(code)) return true;
  return CONNECTION_MESSAGE.test(message);
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export async function withDbRetry<T>(
  fn: () => Promise<T>,
  opts?: {
    attempts?: number;
    delaysMs?: readonly number[];
    sleep?: (ms: number) => Promise<void>;
  },
): Promise<T> {
  const attempts = opts?.attempts ?? DB_COLD_START_ATTEMPTS;
  const delays = opts?.delaysMs ?? DB_COLD_START_DELAYS_MS;
  const sleep = opts?.sleep ?? defaultSleep;
  let last: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      last = err;
      if (attempt >= attempts || !isRetryableDbError(err)) throw err;
      const delay = delays[attempt - 1] ?? delays[delays.length - 1] ?? 0;
      await sleep(delay);
    }
  }
  throw last;
}
