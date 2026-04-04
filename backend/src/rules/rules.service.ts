import { getDb } from '../db'
import { listMessages } from '../gmail/gmail.service'
import { enqueueJob } from '../jobs/queue'
import { config } from '../config'
import { createLogger } from '../logger'
import {
  RuleCondition, RuleAction, RuleCreateDTO, RuleRunResult,
} from './rules.types'

const logger = createLogger('rules')

// ─── CRUD ─────────────────────────────────────────────────

export async function getRules(accountId: string) {
  return getDb()
    .selectFrom('rules')
    .selectAll()
    .where('gmail_account_id', '=', accountId)
    .orderBy('created_at', 'desc')
    .execute()
}

export async function getRule(id: string, accountId: string) {
  return getDb()
    .selectFrom('rules')
    .selectAll()
    .where('id', '=', id)
    .where('gmail_account_id', '=', accountId)
    .executeTakeFirst() ?? null
}

export async function createRule(accountId: string, dto: RuleCreateDTO) {
  logger.info({ accountId, name: dto.name }, 'creating rule')
  return getDb()
    .insertInto('rules')
    .values({
      gmail_account_id: accountId,
      name:             dto.name,
      description:      dto.description ?? null,
      conditions:       JSON.stringify(dto.conditions),
      action:           JSON.stringify(dto.action),
      schedule:         dto.schedule ?? null,
      is_active:        dto.is_active ?? true,
    })
    .returningAll()
    .executeTakeFirstOrThrow()
}

export async function updateRule(id: string, accountId: string, dto: Partial<RuleCreateDTO>) {
  const updates: Record<string, any> = { updated_at: new Date() }
  if (dto.name        !== undefined) updates.name        = dto.name
  if (dto.description !== undefined) updates.description = dto.description ?? null
  if (dto.conditions  !== undefined) updates.conditions  = JSON.stringify(dto.conditions)
  if (dto.action      !== undefined) updates.action      = JSON.stringify(dto.action)
  if (dto.schedule    !== undefined) updates.schedule    = dto.schedule ?? null
  if (dto.is_active   !== undefined) updates.is_active   = dto.is_active

  return getDb()
    .updateTable('rules')
    .set(updates)
    .where('id', '=', id)
    .where('gmail_account_id', '=', accountId)
    .returningAll()
    .executeTakeFirstOrThrow()
}

export async function deleteRule(id: string, accountId: string) {
  logger.info({ id, accountId }, 'deleting rule')
  await getDb()
    .deleteFrom('rules')
    .where('id', '=', id)
    .where('gmail_account_id', '=', accountId)
    .execute()
}

// ─── Conversion conditions → query Gmail native ───────────

export function buildGmailQuery(conditions: RuleCondition[]): string {
  const parts: string[] = []

  for (const cond of conditions) {
    switch (cond.field) {
      case 'from':
        if (cond.operator === 'contains' || cond.operator === 'equals')
          parts.push(`from:(${cond.value})`)
        else if (cond.operator === 'not_contains' || cond.operator === 'not_equals')
          parts.push(`-from:(${cond.value})`)
        break
      case 'to':
        if (cond.operator === 'contains' || cond.operator === 'equals')
          parts.push(`to:(${cond.value})`)
        else if (cond.operator === 'not_contains' || cond.operator === 'not_equals')
          parts.push(`-to:(${cond.value})`)
        break
      case 'subject':
        if (cond.operator === 'contains' || cond.operator === 'equals')
          parts.push(`subject:(${cond.value})`)
        else if (cond.operator === 'not_contains' || cond.operator === 'not_equals')
          parts.push(`-subject:(${cond.value})`)
        break
      case 'has_attachment':
        parts.push(cond.value === true || cond.value === 'true' ? 'has:attachment' : '-has:attachment')
        break
      case 'size_gt': parts.push(`larger:${cond.value}`);  break
      case 'size_lt': parts.push(`smaller:${cond.value}`); break
      case 'older_than': parts.push(`older_than:${cond.value}`); break
      case 'newer_than': parts.push(`newer_than:${cond.value}`); break
      case 'label':
        if (cond.operator === 'equals')     parts.push(`label:${cond.value}`)
        else if (cond.operator === 'not_equals') parts.push(`-label:${cond.value}`)
        break
    }
  }

  return parts.join(' ')
}

// ─── Exécution d'une règle ────────────────────────────────

export async function runRule(rule: any, accountId: string): Promise<RuleRunResult> {
  const conditions: RuleCondition[] = Array.isArray(rule.conditions)
    ? rule.conditions
    : JSON.parse(rule.conditions as string)

  const action: RuleAction = typeof rule.action === 'object'
    ? rule.action
    : JSON.parse(rule.action as string)

  const gmailQuery = buildGmailQuery(conditions)
  logger.info({ ruleId: rule.id, accountId, gmailQuery, action: action.type }, 'executing rule')
  const messageIds: string[] = []
  let pageToken: string | null = null

  do {
    const res = await listMessages(accountId, {
      query:    gmailQuery,
      maxResults: 500,
      pageToken:  pageToken ?? undefined,
    })
    messageIds.push(...(res.messages ?? []).map((m: any) => m.id))
    pageToken = res.nextPageToken
    if (pageToken) await new Promise((r) => setTimeout(r, config.GMAIL_THROTTLE_MS))
  } while (pageToken)

  const matched = messageIds.length

  if (matched === 0) {
    logger.info({ ruleId: rule.id }, 'rule matched 0 messages')
    await getDb()
      .updateTable('rules')
      .set({ last_run_at: new Date() })
      .where('id', '=', rule.id)
      .execute()
    return { ruleId: rule.id, matched: 0, processed: 0, errors: [] }
  }

  let jobId: string | undefined

  if (action.type === 'archive_nas') {
    const job = await enqueueJob('archive_mails', { accountId, messageIds, differential: true })
    jobId = job.id as string
  } else {
    const job = await enqueueJob('bulk_operation', {
      accountId,
      action:   action.type,
      messageIds,
      labelId:  action.labelId,
    })
    jobId = job.id as string
  }

  await getDb()
    .updateTable('rules')
    .set({ last_run_at: new Date() })
    .where('id', '=', rule.id)
    .execute()

  logger.info({ ruleId: rule.id, matched, jobId }, 'rule executed, job enqueued')
  return { ruleId: rule.id, matched, processed: matched, jobId, errors: [] }
}
