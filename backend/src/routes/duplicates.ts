import { FastifyInstance } from 'fastify'
import { getDb } from '../db'
import { sql } from 'kysely'
import { enqueueJob } from '../jobs/queue'

export async function duplicatesRoutes(app: FastifyInstance) {
  const auth = { preHandler: [app.authenticate, app.requireAccountOwnership] }

  // ─── Detect duplicates in archives ────────────────────
  app.get('/:accountId/archived', auth, async (request) => {
    const { accountId } = request.params as { accountId: string }
    const { min_count = '2' } = request.query as { min_count?: string }

    const db = getDb()

    // Group by subject + sender + date (truncated to minute)
    const duplicates = await db
      .selectFrom('archived_mails')
      .select((eb: any) => [
        'subject',
        'sender',
        sql<string>`date_trunc('minute', date)`.as('date_group'),
        eb.fn.countAll<number>().as('count'),
        eb.fn.sum<number>('size_bytes').as('total_size'),
        sql<string[]>`array_agg(id ORDER BY archived_at DESC)`.as('mail_ids'),
      ])
      .where('gmail_account_id', '=', accountId)
      .where('subject', 'is not', null)
      .where('sender', 'is not', null)
      .groupBy(['subject', 'sender', sql`date_trunc('minute', date)`])
      .having((eb: any) => eb.fn.countAll(), '>=', Number.parseInt(min_count))
      .orderBy(sql`count(*) DESC`)
      .limit(200)
      .execute()

    const totalDuplicateMails = duplicates.reduce((s, d) => s + (Number(d.count) - 1), 0)
    const totalDuplicateSize = duplicates.reduce((s, d) => {
      // Estimate: (count-1)/count * total_size for duplicates
      const count = Number(d.count)
      return s + Math.round(Number(d.total_size) * (count - 1) / count)
    }, 0)

    return {
      groups: duplicates.map((d) => ({
        subject: d.subject,
        sender: d.sender,
        dateGroup: d.date_group,
        count: Number(d.count),
        totalSizeBytes: Number(d.total_size),
        mailIds: d.mail_ids,
      })),
      totalDuplicateGroups: duplicates.length,
      totalDuplicateMails,
      totalDuplicateSizeBytes: totalDuplicateSize,
    }
  })

  // ─── Delete duplicates (keep newest) ──────────────────
  app.post('/:accountId/archived/delete', auth, async (request, reply) => {
    const { accountId } = request.params as { accountId: string }
    const { mailIds } = request.body as { mailIds: string[] }

    if (!mailIds?.length) return reply.code(400).send({ error: 'mailIds requis' })

    const db = getDb()

    // Delete from archived_attachments first, then archived_mails
    await db
      .deleteFrom('archived_attachments')
      .where('archived_mail_id', 'in', mailIds)
      .execute()

    const result = await db
      .deleteFrom('archived_mails')
      .where('id', 'in', mailIds)
      .where('gmail_account_id', '=', accountId)
      .execute()

    return { deleted: Number((result as any)[0]?.numDeletedRows ?? mailIds.length) }
  })

  // ─── Detect duplicates in live Gmail ──────────────────
  app.get('/:accountId/live', auth, async (request) => {
    const { accountId } = request.params as { accountId: string }
    // Uses Gmail search — limited approach, only finds same-subject mails
    // For a full scan, we'd need to fetch all messages which is expensive
    return { message: 'Use the archived duplicates endpoint for reliable detection' }
  })
}
