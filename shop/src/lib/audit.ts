import "server-only";

import { db } from "@/db";
import { auditLog } from "@/db/schema";

/** Append-only Protokoll wichtiger Adminaktionen (Punkt 14). */
export async function logAudit(entry: {
  adminUserId?: string | null;
  adminName?: string | null;
  entityType: string;
  entityId?: string | null;
  action: string;
  field?: string | null;
  oldValue?: unknown;
  newValue?: unknown;
  reason?: string | null;
  ipAddress?: string | null;
}): Promise<void> {
  const asText = (value: unknown) =>
    value === null || value === undefined ? null : typeof value === "string" ? value : JSON.stringify(value);

  await db.insert(auditLog).values({
    adminUserId: entry.adminUserId ?? null,
    adminName: entry.adminName ?? null,
    entityType: entry.entityType,
    entityId: entry.entityId ?? null,
    action: entry.action,
    field: entry.field ?? null,
    oldValue: asText(entry.oldValue),
    newValue: asText(entry.newValue),
    reason: entry.reason ?? null,
    ipAddress: entry.ipAddress ?? null,
  });
}
