import { getDb } from '../db'
import { listMessages } from '../gmail/gmail.service'
import { enqueueJob } from '../jobs/queue'
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

export async function getRuleByTemplate(accountId: string, templateId: string) {
  const rule = await getDb()
    .selectFrom('rules')
    .selectAll()
    .where('gmail_account_id', '=', accountId)
    .where('template_id', '=', templateId)
    .executeTakeFirst()
  return rule ?? null
}

export function createRule(accountId: string, dto: RuleCreateDTO, templateId?: string) {
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
      template_id:      templateId ?? null,
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
    const before = parts.length
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
    // An ignored condition widens the query, up to the whole mailbox: refuse it
    if (parts.length === before) throw new Error(`Unsupported rule condition: ${cond.field} ${cond.operator}`)
  }

  if (!parts.length) throw new Error('A rule needs at least one condition')
  return parts.join(' ')
}

// ─── Exécution d'une règle ────────────────────────────────

export async function runRule(rule: any, accountId: string, userId?: string): Promise<RuleRunResult> {
  const conditions: RuleCondition[] = Array.isArray(rule.conditions)
    ? rule.conditions
    : JSON.parse(rule.conditions as string)

  const action: RuleAction = typeof rule.action === 'object'
    ? rule.action
    : JSON.parse(rule.action as string)

  const gmailQuery = buildGmailQuery(conditions)
  logger.info({ ruleId: rule.id, accountId, gmailQuery, action: action.type }, 'executing rule')
  // B5: the job pages the query itself under BULK_QUERY_MAX; listing every id here made 80k-id payloads
  const res = await listMessages(accountId, { query: gmailQuery, maxResults: 1 })
  const matched = res.resultSizeEstimate ?? 0

  let jobId: string | undefined
  if (res.messages.length > 0) {
    const job = action.type === 'archive_nas'
      ? await enqueueJob('archive_mails', { accountId, userId, query: gmailQuery, differential: true })
      : await enqueueJob('bulk_operation', { accountId, userId, action: action.type, query: gmailQuery, labelId: action.labelId })
    jobId = job.id as string
  }

  await getDb()
    .updateTable('rules')
    .set({ last_run_at: new Date() })
    .where('id', '=', rule.id)
    .execute()

  logger.info({ ruleId: rule.id, matched, jobId }, jobId ? 'rule executed, job enqueued' : 'rule matched 0 messages')
  return { ruleId: rule.id, matched, processed: jobId ? matched : 0, jobId, errors: [] }
}
