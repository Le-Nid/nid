import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { getDb } from '../db'
import { logAudit } from '../audit/audit.service'
import { notFound } from '../utils/db'
import { authPresets } from '../utils/auth'

const params = z.object({ accountId: z.string().uuid() })
const shareParams = params.extend({ userId: z.string().uuid() })
const addSchema = z.object({ email: z.string().trim().toLowerCase().email().max(255) })

// Mounted under /api/auth: session only, an API token never grants access to an account
export function accountShareRoutes(app: FastifyInstance, _opts: unknown, done: () => void) {
  const db = getDb()
  const { auth } = authPresets(app)
  const owned = (accountId: string, userId: string) =>
    db.selectFrom('mail_accounts').select('id').where('id', '=', accountId).where('user_id', '=', userId).executeTakeFirst()

  // Who the owner shares this account with
  app.get('/:accountId/shares', auth, async (request, reply) => {
    const { accountId } = params.parse(request.params)
    if (!(await owned(accountId, request.user.sub))) return notFound(reply)
    return db.selectFrom('account_shares')
      .innerJoin('users', 'users.id', 'account_shares.user_id')
      .select(['users.id as user_id', 'users.email', 'users.display_name', 'account_shares.created_at'])
      .where('account_shares.account_id', '=', accountId)
      .orderBy('users.email')
      .execute()
  })

  // Read-only access for another Nid user, by email
  app.post('/:accountId/shares', { ...auth, config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (request, reply) => {
    const { accountId } = params.parse(request.params)
    const { email } = addSchema.parse(request.body)
    const ownerId = request.user.sub
    if (!(await owned(accountId, ownerId))) return notFound(reply)
    const user = await db.selectFrom('users').select(['id', 'email', 'display_name'])
      .where((eb) => eb(eb.fn('lower', ['email']), '=', email)).where('is_active', '=', true).executeTakeFirst()
    if (!user) return reply.code(404).send({ error: 'No Nid user with this address' })
    if (user.id === ownerId) return reply.code(400).send({ error: 'This account is already yours' })
    const added = await db.insertInto('account_shares').values({ account_id: accountId, user_id: user.id })
      .onConflict((oc) => oc.columns(['account_id', 'user_id']).doNothing())
      .returning('created_at').executeTakeFirst()
    if (!added) return reply.code(409).send({ error: 'Already shared with this user' })
    await logAudit(ownerId, 'account.share', { targetType: 'mail_account', targetId: accountId, details: { with: user.email }, ipAddress: request.ip })
    return reply.code(201).send({ user_id: user.id, email: user.email, display_name: user.display_name, created_at: added.created_at })
  })

  // The owner revokes a share, or the user it was given to leaves it
  app.delete('/:accountId/shares/:userId', auth, async (request, reply) => {
    const { accountId, userId } = shareParams.parse(request.params)
    const me = request.user.sub
    if (userId !== me && !(await owned(accountId, me))) return notFound(reply)
    const removed = await db.deleteFrom('account_shares').where('account_id', '=', accountId).where('user_id', '=', userId)
      .executeTakeFirst()
    if (!Number(removed.numDeletedRows)) return notFound(reply)
    await logAudit(me, 'account.unshare', { targetType: 'mail_account', targetId: accountId, details: { user_id: userId }, ipAddress: request.ip })
    return reply.code(204).send()
  })

  done()
}
