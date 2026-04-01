import { FastifyInstance } from 'fastify'
import { enqueueJob } from '../jobs/queue'
import { authPresets } from '../utils/auth'

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
    const fs = await import('fs/promises')
    const path = await import('path')
    const os = await import('os')
    const tmpPath = path.join(os.tmpdir(), `mbox-import-${Date.now()}.mbox`)
    await fs.writeFile(tmpPath, buffer)

    const job = await enqueueJob('import_mbox', {
      accountId,
      userId,
      filePath: tmpPath,
    })

    return reply.code(202).send({ jobId: job.id })
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
