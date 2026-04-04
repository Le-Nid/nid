import 'dotenv/config'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod/v4'
import { getDb, runMigrations, closeDb } from './db'
import { config } from './config'
import { createLogger } from './logger'

const logger = createLogger('mcp')

const server = new McpServer(
  {
    name: 'nid',
    version: '1.0.0',
  },
  {
    instructions: `Serveur MCP pour Nid — une application de gestion d'emails Gmail.
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

// ─── Création de règles ─────────────────────────────────────

server.registerTool(
  'create-rule',
  {
    title: 'Créer une règle automatique',
    description: `Crée une nouvelle règle automatique pour un compte Gmail.
Les conditions filtrent les mails (from, to, subject, label, has_attachment, size_gt, size_lt, older_than, newer_than).
Les opérateurs possibles : contains, not_contains, equals, not_equals, gt, lt, is_true.
Les actions possibles : trash, delete, label, unlabel, archive, archive_nas, mark_read, mark_unread.
Le schedule est une fréquence optionnelle : hourly, daily, weekly, monthly (null = exécution manuelle uniquement).`,
    inputSchema: z.object({
      accountId: z.string().describe('UUID du compte Gmail'),
      name: z.string().describe('Nom de la règle'),
      description: z.string().optional().describe('Description de la règle'),
      conditions: z.array(z.object({
        field: z.enum(['from', 'to', 'subject', 'has_attachment', 'size_gt', 'size_lt', 'label', 'older_than', 'newer_than']).describe('Champ à tester'),
        operator: z.enum(['contains', 'not_contains', 'equals', 'not_equals', 'gt', 'lt', 'is_true']).describe('Opérateur de comparaison'),
        value: z.union([z.string(), z.number(), z.boolean()]).describe('Valeur à comparer'),
      })).describe('Liste des conditions à appliquer'),
      action: z.object({
        type: z.enum(['trash', 'delete', 'label', 'unlabel', 'archive', 'archive_nas', 'mark_read', 'mark_unread']).describe('Type d\'action'),
        labelId: z.string().optional().describe('ID du label Gmail (requis pour label/unlabel)'),
      }).describe('Action à exécuter sur les mails matchés'),
      schedule: z.enum(['hourly', 'daily', 'weekly', 'monthly']).optional().describe('Fréquence d\'exécution automatique'),
      isActive: z.boolean().optional().default(true).describe('Activer immédiatement la règle'),
    }),
  },
  async ({ accountId, name, description, conditions, action, schedule, isActive }) => {
    const { createRule } = await import('./rules/rules.service')
    const rule = await createRule(accountId, {
      name,
      description,
      conditions,
      action,
      schedule: schedule ?? undefined,
      is_active: isActive,
    })
    return { content: [{ type: 'text', text: JSON.stringify(rule, null, 2) }] }
  },
)

server.registerTool(
  'update-rule',
  {
    title: 'Modifier une règle',
    description: 'Modifie une règle automatique existante (nom, conditions, action, schedule, statut)',
    inputSchema: z.object({
      ruleId: z.string().describe('UUID de la règle à modifier'),
      accountId: z.string().describe('UUID du compte Gmail propriétaire'),
      name: z.string().optional().describe('Nouveau nom'),
      description: z.string().optional().describe('Nouvelle description'),
      conditions: z.array(z.object({
        field: z.enum(['from', 'to', 'subject', 'has_attachment', 'size_gt', 'size_lt', 'label', 'older_than', 'newer_than']),
        operator: z.enum(['contains', 'not_contains', 'equals', 'not_equals', 'gt', 'lt', 'is_true']),
        value: z.union([z.string(), z.number(), z.boolean()]),
      })).optional().describe('Nouvelles conditions'),
      action: z.object({
        type: z.enum(['trash', 'delete', 'label', 'unlabel', 'archive', 'archive_nas', 'mark_read', 'mark_unread']),
        labelId: z.string().optional(),
      }).optional().describe('Nouvelle action'),
      schedule: z.enum(['hourly', 'daily', 'weekly', 'monthly']).nullable().optional().describe('Nouvelle fréquence (null pour manuel)'),
      isActive: z.boolean().optional().describe('Activer ou désactiver'),
    }),
  },
  async ({ ruleId, accountId, name, description, conditions, action, schedule, isActive }) => {
    const { updateRule } = await import('./rules/rules.service')
    const dto: Record<string, unknown> = {}
    if (name !== undefined) dto.name = name
    if (description !== undefined) dto.description = description
    if (conditions !== undefined) dto.conditions = conditions
    if (action !== undefined) dto.action = action
    if (schedule !== undefined) dto.schedule = schedule
    if (isActive !== undefined) dto.is_active = isActive
    const rule = await updateRule(ruleId, accountId, dto as any)
    return { content: [{ type: 'text', text: JSON.stringify(rule, null, 2) }] }
  },
)

server.registerTool(
  'delete-rule',
  {
    title: 'Supprimer une règle',
    description: 'Supprime définitivement une règle automatique',
    inputSchema: z.object({
      ruleId: z.string().describe('UUID de la règle à supprimer'),
      accountId: z.string().describe('UUID du compte Gmail propriétaire'),
    }),
    annotations: { destructiveHint: true },
  },
  async ({ ruleId, accountId }) => {
    const { deleteRule } = await import('./rules/rules.service')
    await deleteRule(ruleId, accountId)
    return { content: [{ type: 'text', text: `Règle ${ruleId} supprimée.` }] }
  },
)

server.registerTool(
  'run-rule',
  {
    title: 'Exécuter une règle',
    description: 'Exécute immédiatement une règle sur les mails du compte Gmail. Retourne le nombre de mails matchés et l\'ID du job créé.',
    inputSchema: z.object({
      ruleId: z.string().describe('UUID de la règle à exécuter'),
      accountId: z.string().describe('UUID du compte Gmail'),
    }),
  },
  async ({ ruleId, accountId }) => {
    const { getRule, runRule } = await import('./rules/rules.service')
    const rule = await getRule(ruleId, accountId)
    if (!rule) return { content: [{ type: 'text', text: `Règle ${ruleId} introuvable pour ce compte.` }], isError: true }
    const result = await runRule(rule, accountId)
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
  },
)

// ─── Notifications / Alertes ────────────────────────────────

server.registerTool(
  'create-notification',
  {
    title: 'Créer une notification / alerte',
    description: `Crée une notification in-app pour un utilisateur et déclenche les webhooks configurés.
Catégories disponibles : weekly_report, job_completed, job_failed, rule_executed, quota_warning, integrity_alert.
La notification respecte les préférences de l'utilisateur (in-app et webhooks).`,
    inputSchema: z.object({
      userId: z.string().describe('UUID de l\'utilisateur destinataire'),
      category: z.enum(['weekly_report', 'job_completed', 'job_failed', 'rule_executed', 'quota_warning', 'integrity_alert']).describe('Catégorie de la notification'),
      title: z.string().describe('Titre de la notification'),
      body: z.string().optional().describe('Corps / description détaillée'),
      data: z.record(z.string(), z.unknown()).optional().describe('Données additionnelles (JSON libre)'),
    }),
  },
  async ({ userId, category, title, body, data }) => {
    const { notify } = await import('./notifications/notify')
    await notify({ userId, category, title, body, data })
    return { content: [{ type: 'text', text: `Notification "${title}" créée pour l'utilisateur ${userId} (catégorie: ${category}).` }] }
  },
)

server.registerTool(
  'mark-notifications-read',
  {
    title: 'Marquer les notifications comme lues',
    description: 'Marque une ou toutes les notifications d\'un utilisateur comme lues',
    inputSchema: z.object({
      userId: z.string().describe('UUID de l\'utilisateur'),
      notificationId: z.string().optional().describe('UUID d\'une notification spécifique (si omis, marque toutes comme lues)'),
    }),
  },
  async ({ userId, notificationId }) => {
    const db = getDb()
    let q = db
      .updateTable('notifications')
      .set({ is_read: true })
      .where('user_id', '=', userId)
    if (notificationId) q = q.where('id', '=', notificationId) as any
    const result = await (q as any).executeTakeFirst()
    const count = Number(result.numUpdatedRows ?? 0)
    return { content: [{ type: 'text', text: `${count} notification(s) marquée(s) comme lue(s).` }] }
  },
)

// ─── Recherches sauvegardées ────────────────────────────────

server.registerTool(
  'list-saved-searches',
  {
    title: 'Lister les recherches sauvegardées',
    description: 'Liste toutes les recherches sauvegardées d\'un utilisateur',
    inputSchema: z.object({
      userId: z.string().describe('UUID de l\'utilisateur'),
    }),
    annotations: { readOnlyHint: true },
  },
  async ({ userId }) => {
    const db = getDb()
    const searches = await db
      .selectFrom('saved_searches')
      .selectAll()
      .where('user_id', '=', userId)
      .orderBy('sort_order', 'asc')
      .orderBy('created_at', 'asc')
      .execute()
    return { content: [{ type: 'text', text: JSON.stringify(searches, null, 2) }] }
  },
)

server.registerTool(
  'create-saved-search',
  {
    title: 'Créer une recherche sauvegardée',
    description: `Crée une recherche sauvegardée (dossier intelligent) pour un utilisateur.
La query utilise la syntaxe Gmail native (ex: "from:github.com is:unread", "has:attachment larger:5M", "label:factures older_than:3m").`,
    inputSchema: z.object({
      userId: z.string().describe('UUID de l\'utilisateur'),
      name: z.string().describe('Nom de la recherche (ex: "Factures ce mois", "Mails volumineux non archivés")'),
      query: z.string().describe('Requête Gmail native'),
      icon: z.string().optional().describe('Nom d\'icône (ex: "Search", "Mail", "FileText")'),
      color: z.string().optional().describe('Couleur CSS (ex: "#1890ff", "blue")'),
    }),
  },
  async ({ userId, name, query, icon, color }) => {
    if (!name?.trim() || !query?.trim()) {
      return { content: [{ type: 'text', text: 'Le nom et la requête sont obligatoires.' }], isError: true }
    }
    const db = getDb()
    const search = await db
      .insertInto('saved_searches')
      .values({
        user_id: userId,
        name: name.trim().slice(0, 255),
        query: query.trim().slice(0, 2000),
        icon: icon?.slice(0, 64) ?? null,
        color: color?.slice(0, 32) ?? null,
      })
      .returningAll()
      .executeTakeFirstOrThrow()
    return { content: [{ type: 'text', text: JSON.stringify(search, null, 2) }] }
  },
)

server.registerTool(
  'update-saved-search',
  {
    title: 'Modifier une recherche sauvegardée',
    description: 'Modifie le nom, la requête, l\'icône ou la couleur d\'une recherche sauvegardée',
    inputSchema: z.object({
      userId: z.string().describe('UUID de l\'utilisateur propriétaire'),
      searchId: z.string().describe('UUID de la recherche à modifier'),
      name: z.string().optional().describe('Nouveau nom'),
      query: z.string().optional().describe('Nouvelle requête Gmail'),
      icon: z.string().optional().describe('Nouvelle icône'),
      color: z.string().optional().describe('Nouvelle couleur'),
    }),
  },
  async ({ userId, searchId, name, query, icon, color }) => {
    const db = getDb()
    const existing = await db
      .selectFrom('saved_searches')
      .select('id')
      .where('id', '=', searchId)
      .where('user_id', '=', userId)
      .executeTakeFirst()
    if (!existing) return { content: [{ type: 'text', text: `Recherche ${searchId} introuvable.` }], isError: true }

    const updates: Record<string, unknown> = { updated_at: new Date() }
    if (name !== undefined) updates.name = name.trim().slice(0, 255)
    if (query !== undefined) updates.query = query.trim().slice(0, 2000)
    if (icon !== undefined) updates.icon = icon?.slice(0, 64) ?? null
    if (color !== undefined) updates.color = color?.slice(0, 32) ?? null

    const updated = await db
      .updateTable('saved_searches')
      .set(updates)
      .where('id', '=', searchId)
      .where('user_id', '=', userId)
      .returningAll()
      .executeTakeFirstOrThrow()
    return { content: [{ type: 'text', text: JSON.stringify(updated, null, 2) }] }
  },
)

server.registerTool(
  'delete-saved-search',
  {
    title: 'Supprimer une recherche sauvegardée',
    description: 'Supprime définitivement une recherche sauvegardée',
    inputSchema: z.object({
      userId: z.string().describe('UUID de l\'utilisateur propriétaire'),
      searchId: z.string().describe('UUID de la recherche à supprimer'),
    }),
    annotations: { destructiveHint: true },
  },
  async ({ userId, searchId }) => {
    const db = getDb()
    const result = await db
      .deleteFrom('saved_searches')
      .where('id', '=', searchId)
      .where('user_id', '=', userId)
      .executeTakeFirst()
    if (!result.numDeletedRows) return { content: [{ type: 'text', text: `Recherche ${searchId} introuvable.` }], isError: true }
    return { content: [{ type: 'text', text: `Recherche ${searchId} supprimée.` }] }
  },
)

// ─── Resources ──────────────────────────────────────────────

server.registerResource(
  'app-config',
  'config://app',
  {
    title: 'Configuration de l\'application',
    description: 'Paramètres de configuration de Nid (sans secrets)',
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
  logger.error({ err }, 'MCP server error')
  process.exit(1)
})

process.on('SIGINT', async () => {
  await closeDb()
  process.exit(0)
})
