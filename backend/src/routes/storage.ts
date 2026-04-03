import { FastifyInstance } from 'fastify'
import { getDb } from '../db'
import { testS3Connection } from '../storage/storage.service'
import { authPresets } from '../utils/auth'

export async function storageRoutes(app: FastifyInstance) {
  const { auth } = authPresets(app)
  const db = getDb()

  // ─── Get current storage config ───────────────────────────
  app.get('/config', auth, async (request) => {
    const userId = request.user.sub

    const cfg = await db
      .selectFrom('storage_configs')
      .select(['id', 'type', 's3_endpoint', 's3_region', 's3_bucket', 's3_force_path_style', 'created_at', 'updated_at'])
      .where('user_id', '=', userId)
      .executeTakeFirst()

    return cfg ?? { type: 'local' }
  })

  // ─── Save storage config ─────────────────────────────────
  app.put('/config', auth, async (request, reply) => {
    const userId = request.user.sub
    const body = request.body as {
      type: 'local' | 's3'
      s3Endpoint?: string
      s3Region?: string
      s3Bucket?: string
      s3AccessKeyId?: string
      s3SecretAccessKey?: string
      s3ForcePathStyle?: boolean
    }

    if (body.type === 's3') {
      if (!body.s3Endpoint || !body.s3AccessKeyId || !body.s3SecretAccessKey) {
        return reply.code(400).send({ error: 'S3 endpoint, access key ID et secret access key requis' })
      }
    }

    const existing = await db
      .selectFrom('storage_configs')
      .select('id')
      .where('user_id', '=', userId)
      .executeTakeFirst()

    const values = {
      user_id: userId,
      type: body.type,
      s3_endpoint: body.s3Endpoint ?? null,
      s3_region: body.s3Region ?? 'us-east-1',
      s3_bucket: body.s3Bucket ?? 'nid-archives',
      s3_access_key_id: body.s3AccessKeyId ?? null,
      s3_secret_access_key: body.s3SecretAccessKey ?? null,
      s3_force_path_style: body.s3ForcePathStyle ?? true,
      updated_at: new Date(),
    }

    if (existing) {
      await db
        .updateTable('storage_configs')
        .set(values)
        .where('id', '=', existing.id)
        .execute()
    } else {
      await db
        .insertInto('storage_configs')
        .values(values)
        .execute()
    }

    return { success: true }
  })

  // ─── Test S3 connection ───────────────────────────────────
  app.post('/test-s3', auth, async (request) => {
    const body = request.body as {
      endpoint: string
      region?: string
      bucket?: string
      accessKeyId: string
      secretAccessKey: string
      forcePathStyle?: boolean
    }

    return testS3Connection({
      endpoint: body.endpoint,
      region: body.region ?? 'us-east-1',
      bucket: body.bucket ?? 'nid-archives',
      accessKeyId: body.accessKeyId,
      secretAccessKey: body.secretAccessKey,
      forcePathStyle: body.forcePathStyle ?? true,
    })
  })
}
