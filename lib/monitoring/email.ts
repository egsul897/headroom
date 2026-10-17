/**
 * Optional email delivery for CFO alerts. OFF unless BOTH
 * HEADROOM_ALERT_EMAIL_API_KEY (Resend-compatible HTTP API key) and
 * HEADROOM_ALERT_EMAIL_FROM are set. Never throws; returns the status to
 * record on the notification.
 */
export type EmailStatus = "NOT_SENT_DISABLED" | "NOT_SENT_NO_RECIPIENTS" | "SENT" | "FAILED";

type Env = Record<string, string | undefined>;
type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body: string }) => Promise<{ ok: boolean; status: number }>;

export function emailConfig(env: Env = process.env): { apiKey: string; from: string; endpoint: string } | null {
  const apiKey = env.HEADROOM_ALERT_EMAIL_API_KEY?.trim();
  const from = env.HEADROOM_ALERT_EMAIL_FROM?.trim();
  if (!apiKey || !from || !/^[^@\s<>]+@[^@\s<>]+\.[^@\s<>]+$|<[^@\s<>]+@[^@\s<>]+\.[^@\s<>]+>$/.test(from)) return null;
  return { apiKey, from, endpoint: env.HEADROOM_ALERT_EMAIL_ENDPOINT?.trim() || "https://api.resend.com/emails" };
}

export async function sendAlertEmail(
  msg: { to: string[]; subject: string; text: string },
  opts: { env?: Env; fetchImpl?: FetchLike } = {},
): Promise<EmailStatus> {
  const cfg = emailConfig(opts.env);
  if (!cfg) return "NOT_SENT_DISABLED";
  const to = msg.to.filter((e) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e));
  if (!to.length) return "NOT_SENT_NO_RECIPIENTS";
  try {
    const f = opts.fetchImpl ?? (globalThis.fetch as unknown as FetchLike);
    const res = await f(cfg.endpoint, {
      method: "POST",
      headers: { Authorization: `Bearer ${cfg.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: cfg.from, to, subject: msg.subject.slice(0, 200), text: msg.text.slice(0, 10_000) }),
    });
    return res.ok ? "SENT" : "FAILED";
  } catch {
    return "FAILED";
  }
}
