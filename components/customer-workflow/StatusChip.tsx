import { Chip } from "@/components/ui";
import {
  presentCustomerStatus,
  type CustomerStatusCode,
} from "@/lib/customer-workflow/status-contract";

/** Renders a unified customer-workflow status chip. */
export function StatusChip({
  code,
  compact = false,
}: {
  code: CustomerStatusCode;
  compact?: boolean;
}) {
  const presented = presentCustomerStatus(code);
  return <Chip tone={presented.tone}>{compact ? presented.shortLabel : presented.label}</Chip>;
}
