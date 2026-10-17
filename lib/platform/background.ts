/**
 * Run work after the response is sent WITHOUT it being cut off.
 *
 * Root cause this fixes: the large-upload path did
 * `void reanalyzeCustomerDocumentFromStorage(...)` — a bare floating promise.
 * On Vercel (and any serverless host) the function instance is frozen or
 * torn down as soon as the response is returned, so a floating promise is
 * silently killed mid-analysis and the document stays STAGED forever.
 *
 * `runInBackground` registers the promise with the platform's lifetime hook
 * (`waitUntil` from `@vercel/functions`) so the instance stays alive until
 * it settles (bounded by the route's `maxDuration`). Off Vercel the hook is
 * a harmless no-op and the promise simply runs in the long-lived process.
 *
 * Failures are never swallowed: they are logged, passed to the caller's
 * `onError` (e.g. to stamp FAILED_RETRYABLE), and reported to the env-gated
 * error tracker.
 */
import { waitUntil as vercelWaitUntil } from "@vercel/functions";
import { captureError } from "./error-tracking";

export type WaitUntil = (p: Promise<unknown>) => void;

export interface BackgroundTaskOptions {
  /** Stable label used in logs and error reports. */
  label: string;
  /** Called with the error when the task rejects. Its own errors are logged, never rethrown. */
  onError?: (err: unknown) => Promise<void> | void;
  /** Called after the task resolves. */
  onSuccess?: () => Promise<void> | void;
  /** Injected in tests; defaults to `@vercel/functions` waitUntil. */
  waitUntil?: WaitUntil;
  tags?: Record<string, string>;
}

export function runInBackground(task: () => Promise<unknown>, opts: BackgroundTaskOptions): Promise<void> {
  const settled = (async () => {
    try {
      await task();
      if (opts.onSuccess) await opts.onSuccess();
    } catch (err) {
      console.error(`[background:${opts.label}] failed`, err);
      try {
        if (opts.onError) await opts.onError(err);
      } catch (hookErr) {
        console.error(`[background:${opts.label}] onError hook failed`, hookErr);
      }
      await captureError(err, { where: opts.label, tags: opts.tags });
    }
  })();
  const register = opts.waitUntil ?? vercelWaitUntil;
  try {
    register(settled);
  } catch (err) {
    // Registration itself must never fail the request; the promise still runs.
    console.error(`[background:${opts.label}] waitUntil registration failed`, err);
  }
  return settled;
}
