import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { authPresets } from '../utils/auth'
import { enqueueJob } from '../jobs/queue'
import { getEncryptionStatus, verifyEncryptionKey } from '../privacy/encryption.service'

const decryptSchema = z.object({ passphrase: z.string().min(1).max(1024) })

// Archive encryption was removed (metadata stayed in clear, search and restore broke): only the way out remains.
// Mounted under /api/privacy, refused to API tokens.
export function privacyRoutes(app: FastifyInstance, _opts: unknown, done: () => void) {
  const { accountAuth } = authPresets(app)

  // How many archives of the account are still encrypted
  app.get('/:accountId/encryption/status', accountAuth, async (request) => {
    const { accountId } = request.params as { accountId: string }
    return getEncryptionStatus(accountId)
  })

  // Puts every encrypted archive of the account back in clear (job), the passphrase checked first
  app.post('/:accountId/encryption/decrypt-all', { ...accountAuth, config: { rateLimit: { max: 5, timeWindow: '1 minute' } } }, async (request, reply) => {
    const { accountId } = request.params as { accountId: string }
    const userId = request.user.sub
    const { passphrase } = decryptSchema.parse(request.body)
    if (!(await verifyEncryptionKey(userId, passphrase))) return reply.code(403).send({ error: 'Invalid passphrase' })
    // passphrase: redacted from the stored payload, job removed from Redis once done (enqueueJob)
    const job = await enqueueJob('decrypt_archives', { accountId, userId, passphrase })
    return reply.code(202).send({ jobId: job.id })
  })

  done()
}
