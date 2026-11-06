import "server-only";
import type { TransactionSql } from "@zentro/commerce/db";
import { db } from "./db";
import { requestMeta } from "./request";
import type { StaffSession } from "./session";

export interface AuditEntry {
  action: string; // e.g. "staff.invite", "auth.login_failed"
  entityType?: string;
  entityId?: string;
  details?: Record<string, unknown>;
}

/**
 * Appends to the hash-chained, append-only audit log. Pass `tx` to record the
 * entry atomically with the change it describes.
 */
export async function audit(actor: Pick<StaffSession, "staffId" | "email"> | null, entry: AuditEntry, tx?: TransactionSql) {
  const { ip, userAgent } = await requestMeta();
  const sql = tx ?? db();
  await sql`
    insert into shop.audit_log (staff_id, staff_email, action, entity_type, entity_id, ip, user_agent, details)
    values (${actor?.staffId ?? null}, ${actor?.email ?? null}, ${entry.action}, ${entry.entityType ?? null},
            ${entry.entityId ?? null}, ${ip}, ${userAgent}, ${sql.json((entry.details ?? {}) as never)})`;
}
