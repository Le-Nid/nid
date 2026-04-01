import 'dotenv/config'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod/v4'
import { getDb, runMigrations, closeDb } from './db'
import { config } from './config'

const server = new McpServer(
  {
    name: 'gmail-manager',
    version: '1.0.0',
  },
  {
    instructions: `Serveur MCP pour Gmail Manager — une application de gestion d'emails Gmail.
Permet de consulter les mails archivés, gérer les règles, voir les statistiques,
lancer des jobs d'archivage, gérer les pièces jointes et la déduplication.
Toutes les opérations nécessitent un userId valide (UUID).`,
  },
)

// ─── Tools ──────────────────────────────────────────────────

server.registerTool(
  'list-accounts',
  {
    title: 'Lister les comptes Gmail',
    description: 'Liste tous les comptes Gmail connectés pour un utilisateur',
    inputSchema: z.object({
      userId: z.string().describe('UUID de l\'utilisateur'),
    }),
    annotations: { readOnlyHint: true },
  },
  async ({ userId }) => {
    const db = getDb()
    const accounts = await db
      .selectFrom('gmail_accounts')
      .select(['id', 'email', 'is_active', 'created_at'])
      .where('user_id', '=', userId)
      .execute()
    return { content: [{ type: 'text', text: JSON.stringify(accounts, null, 2) }] }
  },
)

server.registerTool(
  'list-users',
  {
    title: 'Lister les utilisateurs',
    description: 'Liste tous les utilisateurs de l\'application',
    inputSchema: z.object({}),
    annotations: { readOnlyHint: true },
  },
  async () => {
    const db = getDb()
    const users = await db
      .selectFrom('users')
      .select(['id', 'email', 'display_name', 'role', 'is_active', 'created_at'])
      .execute()
    return { content: [{ type: 'text', text: JSON.stringify(users, null, 2) }] }
  },
)

server.registerTool(
  'search-archived-mails',
  {
    title: 'Rechercher dans les archives',
    description: 'Recherche dans les mails archivés avec recherche full-text',
    inputSchema: z.object({
      accountId: z.string().describe('UUID du compte Gmail'),
      query: z.string().optional().describe('Texte de recherche (sujet, expéditeur, contenu)'),
      limit: z.number().optional().default(20).describe('Nombre maximum de résultats'),
      offset: z.number().optional().default(0).describe('Décalage pour pagination'),
    }),
    annotations: { readOnlyHint: true },
  },
  async ({ accountId, query, limit, offset }) => {
    const db = getDb()
    let q = db
      .selectFrom('archived_mails')
      .select(['id', 'subject', 'sender', 'recipient', 'date', 'size_bytes', 'has_attachments', 'snippet'])
      .where('gmail_account_id', '=', accountId)

    if (query) {
      q = q.where('search_vector', '@@', (eb: any) =>
        eb.fn('plainto_tsquery', ['french', query]),
      ) as any
    }

    const mails = await (q as any)
      .orderBy('date', 'desc')
      .limit(limit)
      .offset(offset)
      .execute()

    return { content: [{ type: 'text', text: JSON.stringify(mails, null, 2) }] }
  },
)

server.registerTool(
  'get-dashboard-stats',
  {
    title: 'Statistiques du dashboard',
    description: 'Récupère les statistiques d\'un compte Gmail (nombre de mails, taille, labels)',
    inputSchema: z.object({
      accountId: z.string().describe('UUID du compte Gmail'),
    }),
    annotations: { readOnlyHint: true },
  },
  async ({ accountId }) => {
    const db = getDb()

    const archiveStats = await db
      .selectFrom('archived_mails')
      .select((eb: any) => [
        eb.fn.countAll().as('total_mails'),
        eb.fn.sum('size_bytes').as('total_size'),
      ])
      .where('gmail_account_id', '=', accountId)
      .executeTakeFirstOrThrow() as any

    const attachmentCount = await db
      .selectFrom('archived_attachments')
      .innerJoin('archived_mails', 'archived_mails.id', 'archived_attachments.archived_mail_id')
      .select((eb: any) => [
        eb.fn.countAll().as('count'),
        eb.fn.sum('archived_attachments.size_bytes').as('total_size'),
      ])
      .where('archived_mails.gmail_account_id', '=', accountId)
      .executeTakeFirstOrThrow() as any

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          archivedMails: Number(archiveStats.total_mails),
          archiveSizeBytes: Number(archiveStats.total_size ?? 0),
          attachments: Number(attachmentCount.count),
          attachmentSizeBytes: Number(attachmentCount.total_size ?? 0),
        }, null, 2),
      }],
    }
  },
)

server.registerTool(
  'list-rules',
  {
    title: 'Lister les règles',
    description: 'Liste les règles automatiques configurées pour un compte Gmail',
    inputSchema: z.object({
      accountId: z.string().describe('UUID du compte Gmail'),
    }),
    annotations: { readOnlyHint: true },
  },
  async ({ accountId }) => {
    const db = getDb()
    const rules = await db
      .selectFrom('rules')
      .selectAll()
      .where('gmail_account_id', '=', accountId)
      .execute()
    return { content: [{ type: 'text', text: JSON.stringify(rules, null, 2) }] }
  },
)

server.registerTool(
  'toggle-rule',
  {
    title: 'Activer/désactiver une règle',
    description: 'Active ou désactive une règle automatique',
    inputSchema: z.object({
      ruleId: z.string().describe('UUID de la règle'),
      isActive: z.boolean().describe('true pour activer, false pour désactiver'),
    }),
  },
  async ({ ruleId, isActive }) => {
    const db = getDb()
    await db
      .updateTable('rules')
      .set({ is_active: isActive, updated_at: new Date() })
      .where('id', '=', ruleId)
      .execute()
    return { content: [{ type: 'text', text: `Règle ${ruleId} ${isActive ? 'activée' : 'désactivée'}.` }] }
  },
)

server.registerTool(
  'list-jobs',
  {
    title: 'Lister les jobs',
    description: 'Liste les jobs récents (archivage, règles, etc.)',
    inputSchema: z.object({
      userId: z.string().optional().describe('Filtrer par utilisateur'),
      status: z.string().optional().describe('Filtrer par statut (pending, active, completed, failed)'),
      limit: z.number().optional().default(20),
    }),
    annotations: { readOnlyHint: true },
  },
  async ({ userId, status, limit }) => {
    const db = getDb()
    let q = db
      .selectFrom('jobs')
      .select(['id', 'type', 'status', 'progress', 'total', 'processed', 'error', 'created_at', 'completed_at'])

    if (userId) q = q.where('user_id', '=', userId) as any
    if (status) q = q.where('status', '=', status) as any

    const jobs = await (q as any).orderBy('created_at', 'desc').limit(limit).execute()
    return { content: [{ type: 'text', text: JSON.stringify(jobs, null, 2) }] }
  },
)

server.registerTool(
  'get-dedup-stats',
  {
    title: 'Statistiques de déduplication',
    description: 'Récupère les statistiques de déduplication des pièces jointes pour un utilisateur',
    inputSchema: z.object({
      userId: z.string().describe('UUID de l\'utilisateur'),
    }),
    annotations: { readOnlyHint: true },
  },
  async ({ userId }) => {
    const { getDeduplicationStats } = await import('./archive/dedup.service')
    const stats = await getDeduplicationStats(userId)
    return { content: [{ type: 'text', text: JSON.stringify(stats, null, 2) }] }
  },
)

server.registerTool(
  'list-notifications',
  {
    title: 'Lister les notifications',
    description: 'Liste les notifications non lues d\'un utilisateur',
    inputSchema: z.object({
      userId: z.string().describe('UUID de l\'utilisateur'),
      limit: z.number().optional().default(20),
    }),
    annotations: { readOnlyHint: true },
  },
  async ({ userId, limit }) => {
    const db = getDb()
    const notifs = await db
      .selectFrom('notifications')
      .selectAll()
      .where('user_id', '=', userId)
      .where('is_read', '=', false)
      .orderBy('created_at', 'desc')
      .limit(limit)
      .execute()
    return { content: [{ type: 'text', text: JSON.stringify(notifs, null, 2) }] }
  },
)

server.registerTool(
  'get-sender-scores',
  {
    title: 'Scores des expéditeurs',
    description: 'Récupère les scores d\'encombrement par expéditeur (top pollueurs)',
    inputSchema: z.object({
      accountId: z.string().describe('UUID du compte Gmail'),
      limit: z.number().optional().default(20),
    }),
    annotations: { readOnlyHint: true },
  },
  async ({ accountId, limit }) => {
    const db = getDb()
    const scores = await db
      .selectFrom('sender_scores')
      .selectAll()
      .where('gmail_account_id', '=', accountId)
      .orderBy('clutter_score', 'desc')
      .limit(limit)
      .execute()
    return { content: [{ type: 'text', text: JSON.stringify(scores, null, 2) }] }
  },
)

server.registerTool(
  'search-attachments',
  {
    title: 'Rechercher des pièces jointes',
    description: 'Recherche dans les pièces jointes archivées par nom, type ou sujet du mail',
    inputSchema: z.object({
      accountId: z.string().describe('UUID du compte Gmail'),
      query: z.string().optional().describe('Texte de recherche'),
      sort: z.enum(['size', 'date']).optional().default('size'),
      limit: z.number().optional().default(20),
    }),
    annotations: { readOnlyHint: true },
  },
  async ({ accountId, query, sort, limit }) => {
    const db = getDb()
    let q = db
      .selectFrom('archived_attachments')
      .innerJoin('archived_mails', 'archived_mails.id', 'archived_attachments.archived_mail_id')
      .select([
        'archived_attachments.id',
        'archived_attachments.filename',
        'archived_attachments.mime_type',
        'archived_attachments.size_bytes',
        'archived_attachments.content_hash',
        'archived_mails.subject as mail_subject',
        'archived_mails.sender as mail_sender',
        'archived_mails.date as mail_date',
      ])
      .where('archived_mails.gmail_account_id', '=', accountId)

    if (query) {
      q = q.where((eb: any) =>
        eb.or([
          eb('archived_attachments.filename', 'ilike', `%${query}%`),
          eb('archived_mails.subject', 'ilike', `%${query}%`),
        ]),
      ) as any
    }

    const sortCol = sort === 'date' ? 'archived_mails.date' as any : 'archived_attachments.size_bytes' as any
    const results = await (q as any).orderBy(sortCol, 'desc').limit(limit).execute()
    return { content: [{ type: 'text', text: JSON.stringify(results, null, 2) }] }
  },
)

server.registerTool(
  'get-audit-log',
  {
    title: 'Journal d\'audit',
    description: 'Récupère le journal d\'audit pour un utilisateur',
    inputSchema: z.object({
      userId: z.string().describe('UUID de l\'utilisateur'),
      limit: z.number().optional().default(50),
    }),
    annotations: { readOnlyHint: true },
  },
  async ({ userId, limit }) => {
    const db = getDb()
    const logs = await db
      .selectFrom('audit_logs')
      .selectAll()
      .where('user_id', '=', userId)
      .orderBy('created_at', 'desc')
      .limit(limit)
      .execute()
    return { content: [{ type: 'text', text: JSON.stringify(logs, null, 2) }] }
  },
)

server.registerTool(
  'get-inbox-zero-progress',
  {
    title: 'Progression Inbox Zero',
    description: 'Historique de la progression vers inbox zero pour un compte',
    inputSchema: z.object({
      accountId: z.string().describe('UUID du compte Gmail'),
      limit: z.number().optional().default(30),
    }),
    annotations: { readOnlyHint: true },
  },
  async ({ accountId, limit }) => {
    const db = getDb()
    const snapshots = await db
      .selectFrom('inbox_zero_snapshots')
      .selectAll()
      .where('gmail_account_id', '=', accountId)
      .orderBy('recorded_at', 'desc')
      .limit(limit)
      .execute()
    return { content: [{ type: 'text', text: JSON.stringify(snapshots, null, 2) }] }
  },
)

server.registerTool(
  'get-cleanup-suggestions',
  {
    title: 'Suggestions de nettoyage',
    description: 'Récupère les suggestions de nettoyage intelligent pour un compte',
    inputSchema: z.object({
      accountId: z.string().describe('UUID du compte Gmail'),
    }),
    annotations: { readOnlyHint: true },
  },
  async ({ accountId }) => {
    const db = getDb()
    const suggestions = await db
      .selectFrom('cleanup_suggestions')
      .selectAll()
      .where('gmail_account_id', '=', accountId)
      .where('is_dismissed', '=', false)
      .orderBy('total_size_bytes', 'desc')
      .execute()
    return { content: [{ type: 'text', text: JSON.stringify(suggestions, null, 2) }] }
  },
)

// ─── Resources ──────────────────────────────────────────────

server.registerResource(
  'app-config',
  'config://app',
  {
    title: 'Configuration de l\'application',
    description: 'Paramètres de configuration de Gmail Manager (sans secrets)',
    mimeType: 'application/json',
  },
  async (uri) => ({
    contents: [{
      uri: uri.href,
      text: JSON.stringify({
        archivePath: config.ARCHIVE_PATH,
        allowRegistration: config.ALLOW_REGISTRATION,
        gmailBatchSize: config.GMAIL_BATCH_SIZE,
        gmailConcurrency: config.GMAIL_CONCURRENCY,
        s3Configured: !!config.S3_ENDPOINT,
      }, null, 2),
    }],
  }),
)

// ─── Start ──────────────────────────────────────────────────

async function main() {
  await runMigrations()
  const transport = new StdioServerTransport()
  await server.connect(transport)
}

main().catch((err) => {
  console.error('MCP server error:', err)
  process.exit(1)
})

process.on('SIGINT', async () => {
  await closeDb()
  process.exit(0)
})
