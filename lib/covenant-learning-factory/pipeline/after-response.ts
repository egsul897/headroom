/**
 * Run work after the response without blocking it. Next 14 has no `after()`; on Vercel the request context exposes
 * `waitUntil` (the same hook @vercel/functions uses), which keeps the function alive until the task settles. Elsewhere
 * (long-running Node server, tests) the task simply continues detached. Errors are reported to `onError`, never thrown.
 */
type WaitUntil = (p: Promise<unknown>) => void;

function platformWaitUntil(): WaitUntil | null {
  const ctx = (globalThis as Record<symbol, unknown>)[Symbol.for("@vercel/request-context")] as { get?: () => { waitUntil?: WaitUntil } | undefined } | undefined;
  const w = ctx?.get?.()?.waitUntil;
  return typeof w === "function" ? w : null;
}

export function runAfterResponse(task: () => Promise<unknown>, onError: (err: unknown) => void | Promise<void> = () => {}, waitUntil: WaitUntil | null = platformWaitUntil()): void {
  // Deferred to a macrotask so nothing in the task runs inside the caller's (response) path.
  const p = new Promise<void>((resolve) => setTimeout(resolve, 0)).then(task).then(() => undefined, async (err) => { try { await onError(err); } catch { /* never throw */ } });
  if (waitUntil) {
    try { waitUntil(p); } catch { /* detached */ }
  }
}
