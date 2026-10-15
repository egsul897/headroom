import { createHash } from "node:crypto";
import type { NeonHttpsExecutor } from "../covenant-learning-factory/store/neon-transport";

function id(parts: string[]): string {
  return createHash("sha256").update(parts.join("|")).digest("hex").slice(0, 24);
}

export async function writeFlywheelAlert(
  executor: NeonHttpsExecutor,
  args: {
    kind: string;
    severity?: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
    message: string;
    runId?: string;
    detail?: Record<string, unknown>;
  },
): Promise<string> {
  const alertId = id(["alert", args.kind, args.runId ?? "", args.message.slice(0, 80), String(Date.now())]);
  await executor.execute(
    `INSERT INTO flywheel_alerts
       (id, "alertId", severity, kind, message, "runId", "detailJson", "createdAt")
     VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8)
     ON CONFLICT ("alertId") DO NOTHING`,
    [
      alertId,
      alertId,
      args.severity ?? "HIGH",
      args.kind,
      args.message.slice(0, 2000),
      args.runId ?? null,
      JSON.stringify({
        authorityStatus: "COMPUTED_NOT_CERTIFIED",
        ...(args.detail ?? {}),
      }),
      new Date(),
    ],
  );
  return alertId;
}
