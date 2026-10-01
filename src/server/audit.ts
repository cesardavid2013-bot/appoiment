import "server-only";
import { db, type Executor } from "./db/client";
import { auditLogs } from "./db/schema";
import { log } from "./logger";

export type AuditEntry = {
  actorUserId: string | null;
  actorType: "customer" | "business" | "system" | "admin";
  businessId?: string | null;
  action: string;
  targetType?: string;
  targetId?: string;
  metadata?: Record<string, unknown>;
  ipHash?: string | null;
};

/** Records a security- or money-relevant action. Pass `tx` to make it atomic with the change. */
export async function audit(entry: AuditEntry, tx: Executor = db) {
  try {
    await tx.insert(auditLogs).values({
      actorUserId: entry.actorUserId,
      actorType: entry.actorType,
      businessId: entry.businessId ?? null,
      action: entry.action,
      targetType: entry.targetType,
      targetId: entry.targetId,
      metadata: entry.metadata,
      ipHash: entry.ipHash ?? null,
    });
  } catch (err) {
    // Inside a transaction we must surface the failure so the change rolls back.
    if (tx !== db) throw err;
    log.error("audit.write_failed", { action: entry.action, err });
  }
}
