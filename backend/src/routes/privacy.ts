import { FastifyInstance } from 'fastify'
import { authPresets } from '../utils/auth'
import { enqueueJob } from '../jobs/queue'
import {
  setupEncryption,
  verifyEncryptionKey,
  getEncryptionStatus,
  decryptFile,
} from '../privacy/encryption.service'
import { getDb } from '../db'

export async function privacyRoutes(app: FastifyInstance) {
  const { auth, accountAuth } = authPresets(app)

  // ═══════════════════════════════════════════════════════
  // ENCRYPTION
  // ═══════════════════════════════════════════════════════

  // GET /:accountId/encryption/status — Encryption status
  app.get('/:accountId/encryption/status', accountAuth, async (request) => {
    const { accountId } = request.params as { accountId: string }
    const userId = request.user.sub
    const db = getDb()
    const user = await db
      .selectFrom('users')
      .select('encryption_key_hash')
      .where('id', '=', userId)
      .executeTakeFirst()

    const status = await getEncryptionStatus(accountId)
    return {
      ...status,
      hasEncryptionKey: !!user?.encryption_key_hash,
    }
  })

  // POST /encryption/setup — Set encryption passphrase
  app.post('/encryption/setup', auth, async (request, reply) => {
    const userId = request.user.sub
    const { passphrase } = request.body as { passphrase: string }

    if (!passphrase || passphrase.length < 8) {
      return reply.code(400).send({ error: 'Passphrase must be at least 8 characters' })
    }

    // Check if already set up
    const db = getDb()
    const user = await db
      .selectFrom('users')
      .select('encryption_key_hash')
      .where('id', '=', userId)
      .executeTakeFirst()

    if (user?.encryption_key_hash) {
      return reply.code(409).send({ error: 'Encryption already set up. Use change-passphrase instead.' })
    }

    await setupEncryption(userId, passphrase)
    return { ok: true }
  })

  // POST /encryption/verify — Verify encryption passphrase
  app.post('/encryption/verify', auth, async (request, reply) => {
    const userId = request.user.sub
    const { passphrase } = request.body as { passphrase: string }

    if (!passphrase) {
      return reply.code(400).send({ error: 'Passphrase required' })
    }

    const valid = await verifyEncryptionKey(userId, passphrase)
    return { valid }
  })

  // POST /:accountId/encryption/encrypt — Encrypt all archives
  app.post('/:accountId/encryption/encrypt', accountAuth, async (request, reply) => {
    const { accountId } = request.params as { accountId: string }
    const userId = request.user.sub
    const { passphrase } = request.body as { passphrase: string }

    if (!passphrase) {
      return reply.code(400).send({ error: 'Passphrase required' })
    }

    const valid = await verifyEncryptionKey(userId, passphrase)
    if (!valid) {
      return reply.code(403).send({ error: 'Invalid passphrase' })
    }

    const job = await enqueueJob('encrypt_archives', {
      accountId,
      userId,
      action: 'encrypt_archives',
      passphrase,
    })
    return reply.code(202).send({ jobId: job.id, message: 'Encryption job enqueued' })
  })

  // POST /:accountId/encryption/decrypt-mail — Decrypt a single archive for viewing
  app.post('/:accountId/encryption/decrypt-mail', accountAuth, async (request, reply) => {
    const { accountId } = request.params as { accountId: string }
    const userId = request.user.sub
    const { mailId, passphrase } = request.body as { mailId: string; passphrase: string }

    if (!passphrase || !mailId) {
      return reply.code(400).send({ error: 'mailId and passphrase required' })
    }

    const valid = await verifyEncryptionKey(userId, passphrase)
    if (!valid) {
      return reply.code(403).send({ error: 'Invalid passphrase' })
    }

    const db = getDb()
    const mail = await db
      .selectFrom('archived_mails')
      .select(['eml_path', 'is_encrypted'])
      .where('id', '=', mailId)
      .where('gmail_account_id', '=', accountId)
      .executeTakeFirst()

    if (!mail) {
      return reply.code(404).send({ error: 'Mail not found' })
    }

    if (!mail.is_encrypted) {
      return reply.code(400).send({ error: 'Mail is not encrypted' })
    }

    const content = await decryptFile(mail.eml_path, passphrase)
    return { content: content.toString('utf-8') }
  })
}
