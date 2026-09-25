/**
 * P-6 - gateway credit exhaustion as an explicit, structurally detected terminal run condition.
 *
 * What the population run showed (run-continuation-2, 7.9(a)(i) onward): the Vercel AI Gateway
 * answered HTTP 402 with the body {"error":{"message":"A positive credit balance is required ...",
 * "type":"insufficient_funds"}}. The SDK raises an APIError carrying `.status === 402` and
 * `.error === <that body>`. The frozen compiler's caller catches it at
 * lib/contract-model/compiler/semantic/caller.ts:373-376 and keeps ONLY `err.message`
 * ("402 {json}"), which reaches the harness as failureReasons PROVIDER_FAILURE plus that string under
 * compilation.unresolvedIssues (errorDetail is null). The HTTP status and the error body are
 * destroyed at that line; the compiler is frozen, so the harness recovers them two ways:
 *
 *   1. GatewayResponseSentinel - a fetch wrapper handed to the Anthropic client the harness itself
 *      constructs (compile-run.ts callerFor). It sees every HTTP response before the SDK or the
 *      compiler touches it and records the status and the parsed error type. Structured, primary.
 *   2. detectCreditExhaustionInError - for callers whose errors reach the harness intact (the stage
 *      analyzer rethrows the APIError: anthropic-analyzer.ts:132), `.status` and `.error` are read
 *      directly. Structured.
 *   3. detectCreditExhaustionInResult - corroboration from the compiler result: the `NNN {json}`
 *      string is parsed strictly (three-digit status, space, a JSON object) and the parsed body must
 *      carry error.type === "insufficient_funds" or the status must be 402. No substring matching.
 *
 * Only the two signatures the provider demonstrated are recognised: HTTP 402, and the error type
 * "insufficient_funds" inside the gateway's {error:{type}} structure. A 500, a 429, a schema failure,
 * a timeout, or prose that happens to contain "fund" never matches.
 *
 * Harness only. Nothing in the production pipeline imports it.
 */

export const GATEWAY_CREDIT_EXHAUSTED_HTTP_STATUS = 402;
export const GATEWAY_CREDIT_EXHAUSTED_ERROR_TYPE = "insufficient_funds";
export const GATEWAY_CREDIT_EXHAUSTED = "GATEWAY_CREDIT_EXHAUSTED" as const;

export interface CreditExhaustionSignal {
  detected: true;
  source: "RESPONSE_SENTINEL" | "SDK_ERROR_STATUS" | "SDK_ERROR_BODY" | "RESULT_ISSUE_TEXT";
  httpStatus: number | null;
  errorType: string | null;
  message: string | null;
  at: string;
}

/** The gateway's error body: {error:{message,type}}. Anything else is not the demonstrated structure. */
export function parseGatewayErrorBody(body: unknown): { type: string | null; message: string | null } | null {
  if (!body || typeof body !== "object") return null;
  const error = (body as { error?: unknown }).error;
  if (!error || typeof error !== "object") return null;
  const type = (error as { type?: unknown }).type;
  const message = (error as { message?: unknown }).message;
  return { type: typeof type === "string" ? type : null, message: typeof message === "string" ? message : null };
}

function signal(source: CreditExhaustionSignal["source"], httpStatus: number | null, parsed: { type: string | null; message: string | null } | null): CreditExhaustionSignal | null {
  const byStatus = httpStatus === GATEWAY_CREDIT_EXHAUSTED_HTTP_STATUS;
  const byType = parsed?.type === GATEWAY_CREDIT_EXHAUSTED_ERROR_TYPE;
  if (!byStatus && !byType) return null;
  return { detected: true, source, httpStatus, errorType: parsed?.type ?? null, message: parsed?.message ?? null, at: new Date().toISOString() };
}

/** Structured detection on an error object as the SDK raises it (APIError: `.status`, `.error`). */
export function detectCreditExhaustionInError(err: unknown): CreditExhaustionSignal | null {
  if (!err || typeof err !== "object") return null;
  const status = (err as { status?: unknown }).status;
  const httpStatus = typeof status === "number" ? status : null;
  const parsed = parseGatewayErrorBody((err as { error?: unknown }).error);
  if (httpStatus === GATEWAY_CREDIT_EXHAUSTED_HTTP_STATUS) return signal("SDK_ERROR_STATUS", httpStatus, parsed);
  if (parsed?.type === GATEWAY_CREDIT_EXHAUSTED_ERROR_TYPE) return signal("SDK_ERROR_BODY", httpStatus, parsed);
  return null;
}

/** Strict parse of the SDK message shape `NNN {json}`. Anything else (prose, a bare status, non-JSON) is null. */
export function parseProviderIssueText(text: string): { status: number; body: unknown } | null {
  const m = /^(\d{3}) (\{[\s\S]*\})$/.exec(text.trim());
  if (!m) return null;
  try { return { status: Number(m[1]), body: JSON.parse(m[2]!) }; } catch { return null; }
}

/**
 * Corroborating detection on a compiler result. Consulted only when the compiler itself reported a
 * provider failure; the text must parse strictly and carry one of the two demonstrated signatures.
 */
export function detectCreditExhaustionInResult(result: { failureReasons?: readonly string[] | null; unresolvedIssues?: readonly string[] | null; errorDetail?: unknown } | null | undefined): CreditExhaustionSignal | null {
  if (!result) return null;
  if (!(result.failureReasons ?? []).includes("PROVIDER_FAILURE")) return null;
  const texts: string[] = [...(result.unresolvedIssues ?? [])];
  if (typeof result.errorDetail === "string") texts.push(result.errorDetail);
  for (const t of texts) {
    const parsed = parseProviderIssueText(t);
    if (!parsed) continue;
    const s = signal("RESULT_ISSUE_TEXT", parsed.status, parseGatewayErrorBody(parsed.body));
    if (s) return s;
  }
  return null;
}

/**
 * A fetch wrapper for the Anthropic client the harness constructs. Records every non-2xx response's
 * status and parsed gateway error type before the SDK raises and before the compiler reduces the
 * error to text. The response body is cloned, never consumed.
 */
export class GatewayResponseSentinel {
  readonly responses: { status: number; errorType: string | null; message: string | null; at: string }[] = [];
  readonly fetch: typeof globalThis.fetch;

  constructor(base: typeof globalThis.fetch = globalThis.fetch) {
    this.fetch = async (input, init) => {
      const res = await base(input, init);
      if (!res.ok) {
        let parsed: { type: string | null; message: string | null } | null = null;
        try { parsed = parseGatewayErrorBody(await res.clone().json()); } catch { parsed = null; }
        this.responses.push({ status: res.status, errorType: parsed?.type ?? null, message: parsed?.message ?? null, at: new Date().toISOString() });
      }
      return res;
    };
  }

  /** The first credit-exhaustion response seen, if any. */
  creditExhaustion(): CreditExhaustionSignal | null {
    for (const r of this.responses) { const s = signal("RESPONSE_SENTINEL", r.status, { type: r.errorType, message: r.message }); if (s) return s; }
    return null;
  }

  /** Forget responses seen so far (called between candidates so a signal is attributed to the request that raised it). */
  reset(): void { this.responses.length = 0; }
}
