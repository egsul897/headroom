# Handoff 05 — Production identity-provider integration

**Priority:** 5  
**Owner:** next bounded remediation agent (platform / security)  
**Source:** `lib/capacity/trusted-issuer-host.ts` — production trusted-issuer authority BLOCKED until a real `HostIdentityProvider` is registered.

## Problem

Financial evidence and utilization remaining can never become `PRODUCTION_AUTHORITATIVE` without host-verified session/service-account identity. Mint surface is WeakSet-gated; structural clones are refused; no production provider is registered.

## In scope

- Implement and register a production `HostIdentityProvider` adapter (session + service account).
- Wire issuer authorization into financial-evidence + utilization-authority paths already expecting `TrustedIssuerAuthorizationContext`.
- Integration tests with mint-forgery adversarial cases (clone refusal, unregistered provider fail-closed).
- Document activation runbook; keep lab/synthetic paths explicitly non-authoritative.

## Out of scope

- Fixture-based production authority activation
- Weakening fail-closed gates to “demo AVAILABLE”
- Broad IdP product UI

## Acceptance

- With registered provider + AUTHENTIC certificate + completeness: `utilizationRemainingAuthority` can be `PRODUCTION_AUTHORITATIVE` in controlled lab.
- Without provider: unchanged fail-closed.
- Forged / cloned host identities never authorize.
