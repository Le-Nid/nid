import { getDb } from '../db'
import { createLogger } from '../logger'

const logger = createLogger('audit')

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
  | 'newsletter.delete'
  | 'admin.update_user'
  | 'admin.empty_archive_trash'
  | 'user.2fa_enable'
  | 'user.2fa_disable'
  | 'user.password_change'
  | 'user.password_reset'
  | 'user.login_passkey'
  | 'user.passkey_add'
  | 'user.passkey_remove'
  | 'user.api_token_create'
  | 'user.api_token_revoke'
  | 'user.export_data'
  | 'admin.reset_password'
  | 'admin.delete_user'

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
