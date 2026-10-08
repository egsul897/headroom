/**
 * SEC User-Agent identity — fail closed without an authorized contact.
 *
 * SEC fair-access policy requires an identifying User-Agent with a real
 * contact. This module NEVER invents or defaults to a placeholder email.
 * Operators must supply identity via configuration.
 *
 *   SEC_EDGAR_USER_AGENT="HeadroomHistoricalBackfill/1.0 (contact: you@example.org; research)"
 *
 * Or separately:
 *   SEC_EDGAR_CONTACT_EMAIL=you@example.org
 *   SEC_EDGAR_USER_AGENT_NAME=HeadroomHistoricalBackfill/1.0
 */

export class SecUserAgentConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SecUserAgentConfigError";
  }
}

const PLACEHOLDER_EMAIL_RE =
  /@(?:example\.(?:com|org|net)|test\.|invalid|localhost)|engineering@headroom-app\.example|noreply@|no-?reply@/i;

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;

export function looksLikePlaceholderContact(userAgent: string): boolean {
  return PLACEHOLDER_EMAIL_RE.test(userAgent) || !EMAIL_RE.test(userAgent);
}

export function assertAuthorizedSecUserAgent(userAgent: string): string {
  const ua = userAgent.trim();
  if (!ua) {
    throw new SecUserAgentConfigError(
      "SEC User-Agent is empty. Set SEC_EDGAR_USER_AGENT to an identifying string that includes a real contact email.",
    );
  }
  if (!EMAIL_RE.test(ua)) {
    throw new SecUserAgentConfigError(
      "SEC User-Agent must include a real contact email (SEC fair-access). Set SEC_EDGAR_USER_AGENT or SEC_EDGAR_CONTACT_EMAIL.",
    );
  }
  if (PLACEHOLDER_EMAIL_RE.test(ua)) {
    throw new SecUserAgentConfigError(
      "SEC User-Agent contact looks like a placeholder (example.com / *.example / noreply). Supply an authorized operator email via configuration — do not invent one.",
    );
  }
  return ua;
}

/**
 * Resolve User-Agent from process env. Never fabricates a contact.
 * Returns null when unset (callers that need live SEC must fail closed).
 */
export function resolveSecUserAgentFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  const full = env.SEC_EDGAR_USER_AGENT?.trim();
  if (full) return assertAuthorizedSecUserAgent(full);

  const email = env.SEC_EDGAR_CONTACT_EMAIL?.trim();
  if (!email) return null;
  if (PLACEHOLDER_EMAIL_RE.test(email) || !EMAIL_RE.test(email)) {
    throw new SecUserAgentConfigError(
      "SEC_EDGAR_CONTACT_EMAIL is missing or looks like a placeholder. Supply an authorized operator email — do not invent one.",
    );
  }
  const name = (env.SEC_EDGAR_USER_AGENT_NAME ?? "HeadroomHistoricalBackfill/1.0").trim();
  return assertAuthorizedSecUserAgent(`${name} (contact: ${email}; research; respectful fair-access)`);
}

/** Require a configured identity or throw. */
export function requireSecUserAgentFromEnv(env: NodeJS.ProcessEnv = process.env): string {
  const ua = resolveSecUserAgentFromEnv(env);
  if (!ua) {
    throw new SecUserAgentConfigError(
      "Live SEC access requires configuration: set SEC_EDGAR_USER_AGENT (preferred) or SEC_EDGAR_CONTACT_EMAIL. No placeholder default is provided.",
    );
  }
  return ua;
}
