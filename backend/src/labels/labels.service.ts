import { sql } from 'kysely'
import type { gmail_v1 } from 'googleapis'
import { getDb } from '../db'
import type { GmailLabelType } from '../db/types'
import { listLabels, createLabel } from '../gmail/gmail.service'
import { createLogger } from '../logger'

const logger = createLogger('labels')

function labelType(label: gmail_v1.Schema$Label): GmailLabelType {
  // Gmail reports categories as type 'system'; the UI translates and colors them separately (L2)
  if (label.id!.startsWith('CATEGORY_')) return 'category'
  return label.type === 'system' ? 'system' : 'user'
}

/** Insert or refresh labels as returned by the Gmail API (also un-deletes a label seen again). */
export async function upsertLabels(accountId: string, labels: gmail_v1.Schema$Label[]) {
  const rows = labels.filter((l) => l.id && l.name)
  if (rows.length === 0) return
  const now = new Date()
  await getDb()
    .insertInto('gmail_labels')
    .values(rows.map((l) => ({
      account_id: accountId,
      id: l.id!,
      name: l.name!,
      color_bg: l.color?.backgroundColor ?? null,
      color_text: l.color?.textColor ?? null,
      type: labelType(l),
      messages_total: l.messagesTotal ?? null,
      deleted_at: null,
      updated_at: now,
    })))
    .onConflict((oc) => oc.columns(['account_id', 'id']).doUpdateSet((eb) => ({
      name: eb.ref('excluded.name'),
      color_bg: eb.ref('excluded.color_bg'),
      color_text: eb.ref('excluded.color_text'),
      type: eb.ref('excluded.type'),
      messages_total: eb.ref('excluded.messages_total'),
      deleted_at: null,
      updated_at: now,
    })))
    .execute()
}

/** Id of the user label with this exact name, created in Gmail (and mirrored) when missing. */
export async function findOrCreateLabel(accountId: string, name: string): Promise<string> {
  const find = () => getDb()
    .selectFrom('gmail_labels')
    .select('id')
    .where('account_id', '=', accountId)
    .where('name', '=', name)
    .where('deleted_at', 'is', null)
    .executeTakeFirst()
  const existing = await find()
  if (existing) return existing.id
  try {
    const label = await createLabel(accountId, name)
    await upsertLabels(accountId, [label])
    return label.id!
  } catch (err: any) {
    // 409: created in Gmail since the last sync; resync and use it
    if ((err?.code ?? err?.response?.status ?? err?.status) !== 409) throw err
    await syncLabels(accountId)
    const synced = await find()
    if (!synced) throw err
    return synced.id
  }
}

/** Soft delete only: archives keep resolving the name of a label deleted in Gmail. */
export async function markLabelsDeleted(accountId: string, ids: { only: string } | { except: string[] }) {
  const now = new Date()
  const query = getDb()
    .updateTable('gmail_labels')
    .set({ deleted_at: now, updated_at: now })
    .where('account_id', '=', accountId)
    .where('deleted_at', 'is', null)
    .where('type', '!=', 'imported')
  await ('only' in ids ? query.where('id', '=', ids.only) : query.where('id', 'not in', ids.except)).execute()
}

export async function syncLabels(accountId: string): Promise<{ synced: number }> {
  const labels = (await listLabels(accountId)).filter((l) => l.id && l.name)
  // Gmail always returns system labels: an empty list is an anomaly, never a reason to delete everything
  if (labels.length === 0) return { synced: 0 }
  await upsertLabels(accountId, labels)
  await markLabelsDeleted(accountId, { except: labels.map((l) => l.id!) })
  return { synced: labels.length }
}

/** Daily scheduler pass; one failing account does not stop the others. */
export async function syncAllLabels() {
  const accounts = await getDb().selectFrom('mail_accounts').select('id').where('is_active', '=', true).execute()
  for (const account of accounts) {
    try {
      await syncLabels(account.id)
    } catch (err) {
      logger.error({ err, accountId: account.id }, 'Label sync failed')
    }
  }
}

/** Labels of the account (deleted ones included, `deleted_at` set) with their archived mail count. */
export async function getLabelsWithCounts(accountId: string) {
  const db = getDb()
  const [labels, counts] = await Promise.all([
    db.selectFrom('gmail_labels').selectAll().where('account_id', '=', accountId).orderBy('name').execute(),
    sql<{ label_id: string; count: string }>`
      SELECT unnest(label_ids) AS label_id, COUNT(*) AS count
      FROM archived_mails
      WHERE account_id = ${accountId} AND deleted_at IS NULL
      GROUP BY 1`.execute(db),
  ])
  const countById = new Map(counts.rows.map((r) => [r.label_id, Number(r.count)]))
  return labels.map((l) => ({ ...l, archived_count: countById.get(l.id) ?? 0 }))
}

/** Gmail ids of the given label names (Takeout `X-Gmail-Labels`), creating `imported` rows for unknown names. */
export async function resolveImportedLabelIds(accountId: string, names: string[]): Promise<string[]> {
  if (names.length === 0) return []
  const db = getDb()
  const known = await db
    .selectFrom('gmail_labels')
    .select(['id', 'name', 'type'])
    .where('account_id', '=', accountId)
    .execute()
  const idByName = new Map<string, string>()
  for (const l of known) {
    idByName.set(l.name.toLowerCase(), l.id)
    // Takeout writes system labels as "Inbox", "Category Promotions" while their Gmail ids are INBOX, CATEGORY_PROMOTIONS
    if (l.type !== 'user') idByName.set(l.id.toLowerCase().replaceAll('_', ' '), l.id)
  }
  const missing = names.filter((n) => !idByName.has(n.toLowerCase()))
  if (missing.length > 0) {
    await db
      .insertInto('gmail_labels')
      .values(missing.map((name) => ({
        account_id: accountId, id: `imported:${name}`, name, color_bg: null, color_text: null,
        type: 'imported' as const, messages_total: null, deleted_at: null,
      })))
      .onConflict((oc) => oc.doNothing())
      .execute()
  }
  return names.map((n) => idByName.get(n.toLowerCase()) ?? `imported:${n}`)
}
