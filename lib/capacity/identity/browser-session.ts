/**
 * Browser header for routes that verify `Authorization: Bearer <session handle>`
 * (`credentialFromRequest` / `verifyAndMintPrincipal`).
 *
 * The handle is only the one the host already put on this document as
 * `<meta name="headroom-session-handle" content="…">`. Nothing here mints or
 * hardcodes a token. With no session, the header is omitted and the API can
 * answer 401.
 */
export function readSessionHandle(): string | null {
  if (typeof document === "undefined") return null;
  const handle = document.querySelector('meta[name="headroom-session-handle"]')?.getAttribute("content")?.trim() ?? "";
  return handle.length > 0 ? handle : null;
}

export function sessionAuthorizationHeaders(): HeadersInit {
  const handle = readSessionHandle();
  if (!handle) return {};
  return { Authorization: `Bearer ${handle}` };
}
