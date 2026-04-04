import { getDb } from '../db'
import { getStorageForUser } from '../storage/storage.service'
import { createLogger } from '../logger'

const logger = createLogger('retention')

export async function applyRetentionPolicies(): Promise<{
  policiesRun: number
  totalDeleted: number
}> {
  const db = getDb()
  let totalDeleted = 0

  const policies = await db
    .selectFrom('retention_policies')
    .selectAll()
    .where('is_active', '=', true)
    .execute()

  for (const policy of policies) {
    try {
      const deleted = await applyPolicy(policy)
      totalDeleted += deleted

      await db
        .updateTable('retention_policies')
        .set({
          last_run_at: new Date(),
          deleted_count: policy.deleted_count + deleted,
          updated_at: new Date(),
        })
        .where('id', '=', policy.id)
        .execute()
    } catch (err) {
      logger.error(`[retention] Policy ${policy.name} (${policy.id}) failed: ${(err as Error).message}`)
    }
  }

  return { policiesRun: policies.length, totalDeleted }
}

async function applyPolicy(policy: {
  id: string
  user_id: string
  gmail_account_id: string | null
  label: string | null
  max_age_days: number
}): Promise<number> {
  const db = getDb()
  const cutoffDate = new Date()
  cutoffDate.setDate(cutoffDate.getDate() - policy.max_age_days)

  // Find archived mails matching the policy
  let query = db
    .selectFrom('archived_mails')
    .innerJoin('gmail_accounts', 'gmail_accounts.id', 'archived_mails.gmail_account_id')
    .select(['archived_mails.id', 'archived_mails.eml_path', 'archived_mails.gmail_account_id'])
    .where('gmail_accounts.user_id', '=', policy.user_id)
    .where('archived_mails.date', '<', cutoffDate)

  if (policy.gmail_account_id) {
    query = query.where('archived_mails.gmail_account_id', '=', policy.gmail_account_id)
  }

  if (policy.label) {
    query = (query as any).where(`archived_mails.label_ids`, '@>', `{${policy.label}}`)
  }

  const mails = await query.execute()

  if (mails.length === 0) return 0

  const storage = await getStorageForUser(policy.user_id)
  const mailIds = mails.map((m) => m.id)

  // Delete attachments first
  const attachments = await db
    .selectFrom('archived_attachments')
    .select(['id', 'file_path'])
    .where('archived_mail_id', 'in', mailIds)
    .execute()

  for (const att of attachments) {
    try { await storage.deleteFile(att.file_path) } catch { /* ignore */ }
  }

  await db
    .deleteFrom('archived_attachments')
    .where('archived_mail_id', 'in', mailIds)
    .execute()

  // Delete EML files
  for (const mail of mails) {
    try { await storage.deleteFile(mail.eml_path) } catch { /* ignore */ }
  }

  // Delete DB records
  await db
    .deleteFrom('archived_mails')
    .where('id', 'in', mailIds)
    .execute()

  logger.info(`[retention] Policy "${policy.id}": deleted ${mails.length} archive(s) older than ${policy.max_age_days} days`)
  return mails.length
}

export async function getRetentionPolicies(userId: string) {
  const db = getDb()
  return db
    .selectFrom('retention_policies')
    .selectAll()
    .where('user_id', '=', userId)
    .orderBy('created_at', 'desc')
    .execute()
}

export async function createRetentionPolicy(data: {
  userId: string
  gmailAccountId?: string
  name: string
  label?: string
  maxAgeDays: number
}) {
  const db = getDb()
  return db
    .insertInto('retention_policies')
    .values({
      user_id: data.userId,
      gmail_account_id: data.gmailAccountId ?? null,
      name: data.name,
      label: data.label ?? null,
      max_age_days: data.maxAgeDays,
    })
    .returningAll()
    .executeTakeFirstOrThrow()
}

export async function updateRetentionPolicy(
  policyId: string,
  userId: string,
  data: { name?: string; label?: string; maxAgeDays?: number; isActive?: boolean },
) {
  const db = getDb()
  const updates: Record<string, unknown> = { updated_at: new Date() }
  if (data.name !== undefined) updates.name = data.name
  if (data.label !== undefined) updates.label = data.label || null
  if (data.maxAgeDays !== undefined) updates.max_age_days = data.maxAgeDays
  if (data.isActive !== undefined) updates.is_active = data.isActive

  return db
    .updateTable('retention_policies')
    .set(updates)
    .where('id', '=', policyId)
    .where('user_id', '=', userId)
    .returningAll()
    .executeTakeFirstOrThrow()
}

export async function deleteRetentionPolicy(policyId: string, userId: string) {
  const db = getDb()
  await db
    .deleteFrom('retention_policies')
    .where('id', '=', policyId)
    .where('user_id', '=', userId)
    .execute()
}
