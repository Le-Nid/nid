import { getDb } from '../db'
import { deleteArchivedMails } from './trash.service'
import { createLogger } from '../logger'

const logger = createLogger('retention')

/** `userId`: only that user's policies (manual run); omitted = every user's (scheduled run). */
export async function applyRetentionPolicies(userId?: string): Promise<{
  policiesRun: number
  totalDeleted: number
}> {
  const db = getDb()
  let totalDeleted = 0

  let query = db
    .selectFrom('retention_policies')
    .selectAll()
    .where('is_active', '=', true)
  if (userId) query = query.where('user_id', '=', userId)
  const policies = await query.execute()

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
  account_id: string | null
  label: string | null
  max_age_days: number
}): Promise<number> {
  const db = getDb()
  const cutoffDate = new Date()
  cutoffDate.setDate(cutoffDate.getDate() - policy.max_age_days)

  // Find archived mails matching the policy
  let query = db
    .selectFrom('archived_mails')
    .innerJoin('mail_accounts', 'mail_accounts.id', 'archived_mails.account_id')
    .select(['archived_mails.id', 'archived_mails.eml_path', 'archived_mails.account_id'])
    .where('mail_accounts.user_id', '=', policy.user_id)
    .where('archived_mails.date', '<', cutoffDate)

  if (policy.account_id) {
    query = query.where('archived_mails.account_id', '=', policy.account_id)
  }

  if (policy.label) {
    query = (query as any).where(`archived_mails.label_ids`, '@>', `{${policy.label}}`)
  }

  const mails = await query.execute()

  if (mails.length === 0) return 0

  await deleteArchivedMails(mails)

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
      account_id: data.gmailAccountId ?? null,
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

/**
 * A policy label must be a Gmail label id synced for the policy's account
 * (any of the user's accounts when the policy targets all of them, or `policyId`'s account on update).
 */
export async function isKnownPolicyLabel(
  userId: string,
  label: string,
  scope: { accountId?: string; policyId?: string },
): Promise<boolean> {
  const db = getDb()
  let accountId = scope.accountId
  if (scope.policyId) {
    const policy = await db
      .selectFrom('retention_policies')
      .select('account_id')
      .where('id', '=', scope.policyId)
      .where('user_id', '=', userId)
      .executeTakeFirst()
    accountId = policy?.account_id ?? undefined
  }
  let query = db
    .selectFrom('gmail_labels')
    .innerJoin('mail_accounts', 'mail_accounts.id', 'gmail_labels.account_id')
    .select('gmail_labels.id')
    .where('mail_accounts.user_id', '=', userId)
    .where('gmail_labels.id', '=', label)
  if (accountId) query = query.where('gmail_labels.account_id', '=', accountId)
  return (await query.executeTakeFirst()) !== undefined
}

export async function deleteRetentionPolicy(policyId: string, userId: string) {
  const db = getDb()
  await db
    .deleteFrom('retention_policies')
    .where('id', '=', policyId)
    .where('user_id', '=', userId)
    .execute()
}
