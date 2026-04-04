import { getDb } from '../db'
import pino from 'pino'

const logger = pino({ name: 'audit' })

export type AuditAction =
  | 'user.login'
  | 'user.register'
  | 'user.login_sso'
  | 'user.login_social'
  | 'gmail.connect'
  | 'gmail.disconnect'
  | 'rule.create'
  | 'rule.update'
  | 'rule.delete'
  | 'rule.run'
  | 'rule.create_from_template'
  | 'bulk.trash'
  | 'bulk.delete'
  | 'bulk.label'
  | 'bulk.archive'
  | 'archive.trigger'
  | 'archive.export_zip'
  | 'duplicates.delete'
  | 'newsletter.delete'
  | 'admin.update_user'
  | 'user.2fa_enable'
  | 'user.2fa_disable'

export async function logAudit(
  userId: string,
  action: AuditAction,
  opts: {
    targetType?: string
    targetId?: string
    details?: Record<string, any>
    ipAddress?: string
  } = {}
) {
  try {
    const db = getDb()
    await db
      .insertInto('audit_logs')
      .values({
        user_id: userId,
        action,
        target_type: opts.targetType ?? null,
        target_id: opts.targetId ?? null,
        details: opts.details ? JSON.stringify(opts.details) : null,
        ip_address: opts.ipAddress ?? null,
      })
      .execute()
  } catch (err) {
    // Audit logging should never break the main flow
    logger.error({ err }, 'Failed to write audit log')
  }
}
