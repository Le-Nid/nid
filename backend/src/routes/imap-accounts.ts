import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { getDb } from '../db'
import { logAudit } from '../audit/audit.service'
import { sql } from 'kysely'
import { listImapFolders, testImapLogin, type ImapSettings } from '../imap/imap.service'
import { discoverImap } from '../imap/autoconfig'
import { sealSecret } from '../utils/secret'
import { authPresets } from '../utils/auth'

const settingsSchema = z.object({
  host: z.string().trim().min(1).max(255),
  port: z.number().int().min(1).max(65535).default(993),
  secure: z.boolean().default(true),
  user: z.string().trim().min(1).max(255),
  password: z.string().min(1).max(1024),
})
const createSchema = settingsSchema.extend({ email: z.string().trim().toLowerCase().email().max(255) })
const scopeSchema = z.object({
  // null: every folder but junk, trash and All Mail
  folders: z.array(z.string().min(1).max(1000)).min(1).max(1000).nullable(),
  since: z.iso.date().nullable(),
})

/** The server's reason when it refuses the login, so the form can say what to fix. */
async function checkLogin(s: ImapSettings): Promise<string | null> {
  try {
    await testImapLogin(s)
    return null
  } catch (err) {
    return (err as { responseText?: string; message?: string }).responseText ?? (err as Error).message ?? 'IMAP connection failed'
  }
}

// Mounted under /api/auth: session only, an API token can never send or replace IMAP credentials
export function imapAccountRoutes(app: FastifyInstance, _opts: unknown, done: () => void) {
  const db = getDb()
  const { auth, accountAuth } = authPresets(app)
  const rateLimit = { rateLimit: { max: 5, timeWindow: '1 minute' } }
  const sealed = (s: ImapSettings) => ({
    imap_host: s.host, imap_port: s.port, imap_secure: s.secure, imap_user: s.user, imap_password: sealSecret(s.password),
  })

  // Server settings to prefill the form from the address (ISPDB, the domain's autoconfig, else a guess)
  app.get('/autoconfig', { ...auth, config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async (request) => {
    const { email } = z.object({ email: z.string().trim().toLowerCase().email().max(255) }).parse(request.query)
    return discoverImap(email)
  })

  // Archive-only account: the login is checked before anything is stored
  app.post('/', { ...auth, config: rateLimit }, async (request, reply) => {
    const body = createSchema.parse(request.body)
    const userId = request.user.sub
    const user = await db.selectFrom('users').select('max_gmail_accounts').where('id', '=', userId).executeTakeFirst()
    const { count } = await db.selectFrom('mail_accounts').select((eb) => eb.fn.countAll<number>().as('count'))
      .where('user_id', '=', userId).executeTakeFirstOrThrow()
    const max = user?.max_gmail_accounts ?? 3
    if (Number(count) >= max) return reply.code(403).send({ error: `Maximum ${max} accounts allowed` })

    const refused = await checkLogin(body)
    if (refused) return reply.code(400).send({ error: refused })

    const account = await db.insertInto('mail_accounts')
      .values({ user_id: userId, email: body.email, provider: 'imap', ...sealed(body) })
      .onConflict((oc) => oc.constraint('mail_accounts_user_email_unique').doNothing())
      .returning(['id', 'email']).executeTakeFirst()
    if (!account) return reply.code(409).send({ error: 'This address is already connected' })
    await logAudit(userId, 'imap.connect', { targetType: 'mail_account', targetId: account.id, ipAddress: request.ip })
    return reply.code(201).send(account)
  })

  // New password or server: checked, then « Action requise » and a disconnection are cleared
  app.put('/:accountId', { ...accountAuth, config: rateLimit }, async (request, reply) => {
    const { accountId } = request.params as { accountId: string }
    const body = settingsSchema.parse(request.body)
    const refused = await checkLogin(body)
    if (refused) return reply.code(400).send({ error: refused })
    const updated = await db.updateTable('mail_accounts')
      .set({ ...sealed(body), auth_error_at: null, is_active: true, updated_at: new Date() })
      .where('id', '=', accountId).where('provider', '=', 'imap')
      .returning('id').executeTakeFirst()
    if (!updated) return reply.code(404).send({ error: 'IMAP account not found' })
    await logAudit(request.user.sub, 'imap.update', { targetType: 'mail_account', targetId: accountId, ipAddress: request.ip })
    return { ok: true }
  })

  // Folders on the server and what the backup covers (session: it logs in to the server)
  app.get('/:accountId/folders', accountAuth, async (request, reply) => {
    const { accountId } = request.params as { accountId: string }
    const scope = await db.selectFrom('mail_accounts')
      .select(['imap_folders', sql<string | null>`imap_since::text`.as('since')])
      .where('id', '=', accountId).where('provider', '=', 'imap').executeTakeFirst()
    if (!scope) return reply.code(404).send({ error: 'IMAP account not found' })
    try {
      return { folders: await listImapFolders(accountId), chosen: scope.imap_folders, since: scope.since }
    } catch (err) {
      return reply.code(502).send({ error: (err as { responseText?: string }).responseText ?? (err as Error).message })
    }
  })

  // A new start date restarts every folder (older mails were passed over); already archived ones are skipped by Message-ID
  app.put('/:accountId/scope', accountAuth, async (request, reply) => {
    const { accountId } = request.params as { accountId: string }
    const { folders, since } = scopeSchema.parse(request.body)
    const before = await db.selectFrom('mail_accounts').select(sql<string | null>`imap_since::text`.as('since'))
      .where('id', '=', accountId).where('provider', '=', 'imap').executeTakeFirst()
    if (!before) return reply.code(404).send({ error: 'IMAP account not found' })
    await db.updateTable('mail_accounts').set({ imap_folders: folders, imap_since: since, updated_at: new Date() })
      .where('id', '=', accountId).execute()
    if (before.since !== since) await db.deleteFrom('imap_folder_state').where('account_id', '=', accountId).execute()
    await logAudit(request.user.sub, 'imap.scope', {
      targetType: 'mail_account', targetId: accountId, details: { folders: folders?.length ?? null, since }, ipAddress: request.ip,
    })
    return { folders, since }
  })

  done()
}
