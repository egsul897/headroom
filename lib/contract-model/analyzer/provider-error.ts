/**
 * ONE normalized provider error for every model call Headroom makes.
 *
 * Why this exists: the SDK raises APIError with a structured `.status` and `.error` body, and the
 * legacy callers reduced that to `err.message` text ("402 {json}"), so a gateway credit exhaustion
 * reached the harness only as a string under unresolvedIssues and had to be rediscovered by a
 * response sentinel. Nothing in the certified path may throw or record a provider failure except
 * as a ProviderError. The class preserves the HTTP status, the provider's own error code, whether
 * the failure is retryable under Headroom's single retry policy, and what is known about billing.
 */
export type ProviderErrorKind =
  | "CREDIT_EXHAUSTED"     // HTTP 402 / insufficient_funds - terminal for the whole run
  | "RATE_LIMITED"         // HTTP 429 - retryable once under the transport policy
  | "SERVER_ERROR"         // HTTP 5xx - retryable (bounded)
  | "CLIENT_ERROR"         // other 4xx - never retried
  | "ABORTED"              // AbortSignal fired (deadline) - never retried
  | "NETWORK"              // connection / DNS / reset - retryable (bounded)
  | "SCHEMA"               // the provider answered but not with a schema-valid result - never retried at transport level
  | "UNKNOWN";

export interface ProviderUsage { inputTokens: number; outputTokens: number; cachedInputTokens: number | null; cacheCreationInputTokens: number | null }

export interface ProviderErrorFields {
  provider: string;
  model: string;
  kind: ProviderErrorKind;
  httpStatus: number | null;
  providerCode: string | null;
  message: string;
  retryable: boolean;
  /** true when the provider is known NOT to have billed (a refusal before any model work) or to have billed a known usage. */
  billingKnown: boolean;
  usageIfKnown: ProviderUsage | null;
  rawCauseClass: string;
}

export class ProviderError extends Error implements ProviderErrorFields {
  readonly provider: string; readonly model: string; readonly kind: ProviderErrorKind; readonly httpStatus: number | null; readonly providerCode: string | null;
  readonly retryable: boolean; readonly billingKnown: boolean; readonly usageIfKnown: ProviderUsage | null; readonly rawCauseClass: string;
  constructor(fields: ProviderErrorFields, options?: { cause?: unknown }) {
    super(fields.message, options);
    this.name = "ProviderError";
    this.provider = fields.provider; this.model = fields.model; this.kind = fields.kind; this.httpStatus = fields.httpStatus; this.providerCode = fields.providerCode;
    this.retryable = fields.retryable; this.billingKnown = fields.billingKnown; this.usageIfKnown = fields.usageIfKnown; this.rawCauseClass = fields.rawCauseClass;
  }
  /** A plain, serializable record for evidence and telemetry. */
  toRecord(): ProviderErrorFields { return { provider: this.provider, model: this.model, kind: this.kind, httpStatus: this.httpStatus, providerCode: this.providerCode, message: this.message, retryable: this.retryable, billingKnown: this.billingKnown, usageIfKnown: this.usageIfKnown, rawCauseClass: this.rawCauseClass }; }
}

export function isProviderError(err: unknown): err is ProviderError { return err instanceof ProviderError; }

export function isAbortError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { name?: unknown; code?: unknown; message?: unknown };
  return e.name === "AbortError" || e.code === "ABORT_ERR" || (typeof e.message === "string" && /aborted|abort signal/i.test(e.message) && e.name !== "ProviderError");
}

/** The gateway's error body: {error:{message,type}} - the exact structure the provider demonstrated. */
function providerCodeOf(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const error = (body as { error?: unknown }).error;
  if (!error || typeof error !== "object") return null;
  const type = (error as { type?: unknown }).type;
  return typeof type === "string" ? type : null;
}

/**
 * Normalize anything a provider call can throw. Structured fields are read from the SDK error
 * (`status`, `error`); text is never pattern-matched for a status. A 402 or the provider code
 * `insufficient_funds` is CREDIT_EXHAUSTED; abort is ABORTED; 429 RATE_LIMITED; 5xx SERVER_ERROR;
 * other 4xx CLIENT_ERROR; a thrown non-HTTP error is NETWORK when it looks like transport, else UNKNOWN.
 */
export function normalizeProviderError(err: unknown, ctx: { provider: string; model: string }): ProviderError {
  if (err instanceof ProviderError) return err;
  const rawCauseClass = err instanceof Error ? err.constructor.name : typeof err;
  const message = err instanceof Error ? err.message : String(err);
  const status = typeof (err as { status?: unknown })?.status === "number" ? ((err as { status: number }).status) : null;
  const providerCode = providerCodeOf((err as { error?: unknown })?.error);
  const base = { provider: ctx.provider, model: ctx.model, message, rawCauseClass, usageIfKnown: null as ProviderUsage | null };
  if (isAbortError(err)) return new ProviderError({ ...base, kind: "ABORTED", httpStatus: null, providerCode: null, retryable: false, billingKnown: false }, { cause: err });
  if ((err as { name?: unknown })?.name === "SchemaFailure" || rawCauseClass === "ZodError") return new ProviderError({ ...base, kind: "SCHEMA", httpStatus: null, providerCode: null, retryable: false, billingKnown: false }, { cause: err });
  if (status === 402 || providerCode === "insufficient_funds") return new ProviderError({ ...base, kind: "CREDIT_EXHAUSTED", httpStatus: status ?? 402, providerCode: providerCode ?? "insufficient_funds", retryable: false, billingKnown: true, usageIfKnown: { inputTokens: 0, outputTokens: 0, cachedInputTokens: 0, cacheCreationInputTokens: 0 } }, { cause: err });
  if (status === 429) return new ProviderError({ ...base, kind: "RATE_LIMITED", httpStatus: status, providerCode, retryable: true, billingKnown: true, usageIfKnown: { inputTokens: 0, outputTokens: 0, cachedInputTokens: 0, cacheCreationInputTokens: 0 } }, { cause: err });
  if (status !== null && status >= 500) return new ProviderError({ ...base, kind: "SERVER_ERROR", httpStatus: status, providerCode, retryable: true, billingKnown: false }, { cause: err });
  if (status !== null && status >= 400) return new ProviderError({ ...base, kind: "CLIENT_ERROR", httpStatus: status, providerCode, retryable: false, billingKnown: true, usageIfKnown: { inputTokens: 0, outputTokens: 0, cachedInputTokens: 0, cacheCreationInputTokens: 0 } }, { cause: err });
  if (/econnreset|econnrefused|enotfound|socket|network|fetch failed|connection/i.test(message) || rawCauseClass === "APIConnectionError" || rawCauseClass === "APIConnectionTimeoutError") return new ProviderError({ ...base, kind: "NETWORK", httpStatus: null, providerCode: null, retryable: true, billingKnown: false }, { cause: err });
  return new ProviderError({ ...base, kind: "UNKNOWN", httpStatus: status, providerCode, retryable: false, billingKnown: false }, { cause: err });
}
