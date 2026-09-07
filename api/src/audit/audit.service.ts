import { Injectable } from '@nestjs/common';
import type { Kysely, Transaction } from 'kysely';
import type { DB } from '../database/types';

export interface AuditEntry {
  adminId: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  details?: Record<string, unknown> | null;
  ip?: string | null;
}

/** Journal d'audit administrateur (table admin_audit_logs, lue par AuditLogs.tsx). */
@Injectable()
export class AuditService {
  async log(db: Kysely<DB> | Transaction<DB>, e: AuditEntry): Promise<void> {
    if (!e.adminId) return;
    await db
      .insertInto('admin_audit_logs')
      .values({ admin_id: e.adminId, action: e.action, entity_type: e.entityType, entity_id: e.entityId ?? null, details: e.details ? JSON.stringify(e.details) : null, ip_address: e.ip ?? null })
      .execute();
  }
}
