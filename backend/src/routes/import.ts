import { FastifyInstance } from 'fastify'
import { enqueueJob } from '../jobs/queue'
import { authPresets } from '../utils/auth'
import { getDb } from '../db'
import { getLocalStorage } from '../storage/storage.service'
import { importSingleEml, looksLikeEml } from '../archive/import.service'
import { invalidateDashboardCache } from '../dashboard/cache.service'
import { createLogger } from '../logger'

const logger = createLogger('import-routes')
const EML_MAX_FILES = 200
const EML_MAX_BYTES = 50 * 1024 * 1024

export async function importRoutes(app: FastifyInstance) {
  const { accountAuth } = authPresets(app)

  // ─── Import mbox file (upload) ────────────────────────────
  app.post('/:accountId/mbox', accountAuth, async (request, reply) => {
    const { accountId } = request.params as { accountId: string }
    const userId = request.user.sub

    const data = await (request as any).file()
    if (!data) return reply.code(400).send({ error: 'Fichier mbox requis' })

    const chunks: Buffer[] = []
    for await (const chunk of data.file) {
      chunks.push(chunk)
    }
    const buffer = Buffer.concat(chunks)

    // Write to a temp file
    const fs = await import('node:fs/promises')
    const path = await import('node:path')
    const os = await import('node:os')
    const tmpPath = path.join(os.tmpdir(), `mbox-import-${Date.now()}.mbox`)
    await fs.writeFile(tmpPath, buffer)

    const job = await enqueueJob('import_mbox', {
      accountId,
      userId,
      filePath: tmpPath,
    })

    return reply.code(202).send({ jobId: job.id })
  })

  // ─── Import .eml files (upload, archived at once) ─────────
  app.post('/:accountId/eml', accountAuth, async (request, reply) => {
    const { accountId } = request.params as { accountId: string }
    const result = { imported: 0, skipped: 0, errors: 0 }
    const parts = request.files({ limits: { files: EML_MAX_FILES, fileSize: EML_MAX_BYTES }, throwFileSizeLimit: false })
    // One file after the other: each is written to the NAS and deduplicated against the previous ones
    for await (const part of parts) {
      const raw = await part.toBuffer()
      try {
        if (part.file.truncated || !looksLikeEml(raw)) throw new Error(part.file.truncated ? 'too large' : 'not an EML')
        const outcome = await importSingleEml(getDb(), getLocalStorage(), accountId, raw) // NOSONAR
        result[outcome]++
      } catch (err) {
        result.errors++
        logger.warn({ err, accountId, filename: part.filename }, 'EML not imported')
      }
    }
    if (result.imported + result.skipped + result.errors === 0) return reply.code(400).send({ error: 'Fichier .eml requis' })
    if (result.imported) await invalidateDashboardCache(accountId)
    return result
  })

  // ─── Import from IMAP server ─────────────────────────────
  app.post('/:accountId/imap', accountAuth, async (request, reply) => {
    const { accountId } = request.params as { accountId: string }
    const userId = request.user.sub
    const body = request.body as {
      host: string
      port: number
      secure?: boolean
      user: string
      pass: string
      folder?: string
      maxMessages?: number
    }

    if (!body.host || !body.user || !body.pass) {
      return reply.code(400).send({ error: 'host, user et pass requis' })
    }

    const job = await enqueueJob('import_imap', {
      accountId,
      userId,
      imapConfig: {
        host: body.host,
        port: body.port ?? 993,
        secure: body.secure ?? true,
        user: body.user,
        pass: body.pass,
        folder: body.folder,
        maxMessages: body.maxMessages,
      },
    })

    return reply.code(202).send({ jobId: job.id })
  })

  // ─── Export archive as mbox ───────────────────────────────
  app.post('/:accountId/export-mbox', accountAuth, async (request, reply) => {
    const { accountId } = request.params as { accountId: string }
    const userId = request.user.sub
    const { mailIds } = request.body as { mailIds?: string[] }

    const { exportMbox } = await import('../archive/import.service')
    const stream = await exportMbox(userId, accountId, mailIds)

    const filename = `archive-export-${new Date().toISOString().slice(0, 10)}.mbox`
    reply.raw.writeHead(200, {
      'Content-Type': 'application/mbox',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Transfer-Encoding': 'chunked',
    })

    stream.pipe(reply.raw)
    return reply
  })
}
