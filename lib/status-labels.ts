/**
 * Customer-facing status language (task "UNIVERSAL HEADROOM PRODUCT
 * EXPERIENCE" §57 - "Use customer-friendly labels. Do not expose raw
 * internal enums where awkward... Preserve actual semantics."). One shared
 * mapping layer, not a per-page ad-hoc string; the covenant-overview row
 * labels (components/CovenantOverview.tsx's statusLabel/bindingLabel/
 * reviewLabel) already do the equivalent for their own enums and are left
 * where they are since they're presentation-local to that one component -
 * this module is for the labels used OUTSIDE that component, starting with
 * onboarding status, which was previously rendered as a raw Prisma enum
 * value (e.g. "ACTIVE_WITH_LIMITATIONS") directly in a Chip.
 */
import type { OnboardingStatus } from "@prisma/client";

export function onboardingStatusLabel(status: OnboardingStatus): string {
  switch (status) {
    case "ONBOARDING":
      return "Onboarding";
    case "ACTIVE_WITH_LIMITATIONS":
      return "Active — limited coverage";
    case "ACTIVE":
      return "Active";
  }
}
