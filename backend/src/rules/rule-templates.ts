import { RuleCreateDTO } from './rules.types'

export interface RuleTemplate {
  id: string
  name: string
  description: string
  category: 'cleanup' | 'archive' | 'organize'
  dto: RuleCreateDTO
}

export const RULE_TEMPLATES: RuleTemplate[] = [
  // ─── Cleanup ──────────────────────────────────────────
  {
    id: 'cleanup-github-notifications',
    name: 'Nettoyer les notifications GitHub',
    description: 'Supprime les notifications GitHub lues de plus de 7 jours',
    category: 'cleanup',
    dto: {
      name: 'Nettoyer notifs GitHub',
      description: 'Supprime les notifications GitHub lues de plus de 7 jours',
      conditions: [
        { field: 'from', operator: 'contains', value: 'notifications@github.com' },
        { field: 'older_than', operator: 'gt', value: '7d' },
      ],
      action: { type: 'trash' },
      schedule: 'weekly',
      is_active: true,
    },
  },
  {
    id: 'cleanup-old-newsletters',
    name: 'Supprimer newsletters non lues > 30j',
    description: 'Met à la corbeille les newsletters non lues de plus de 30 jours',
    category: 'cleanup',
    dto: {
      name: 'Supprimer newsletters non lues > 30j',
      description: 'Met à la corbeille les newsletters non lues de plus de 30 jours',
      conditions: [
        { field: 'label', operator: 'equals', value: 'UNREAD' },
        { field: 'older_than', operator: 'gt', value: '30d' },
      ],
      action: { type: 'trash' },
      schedule: 'weekly',
      is_active: true,
    },
  },
  {
    id: 'cleanup-promotions',
    name: 'Nettoyer les promotions > 14j',
    description: 'Supprime les mails promotionnels de plus de 2 semaines',
    category: 'cleanup',
    dto: {
      name: 'Nettoyer promotions > 14j',
      description: 'Supprime les mails de la catégorie Promotions de plus de 2 semaines',
      conditions: [
        { field: 'label', operator: 'equals', value: 'CATEGORY_PROMOTIONS' },
        { field: 'older_than', operator: 'gt', value: '14d' },
      ],
      action: { type: 'trash' },
      schedule: 'weekly',
      is_active: true,
    },
  },
  {
    id: 'cleanup-social',
    name: 'Nettoyer les réseaux sociaux > 7j',
    description: 'Supprime les notifications des réseaux sociaux de plus d\'une semaine',
    category: 'cleanup',
    dto: {
      name: 'Nettoyer réseaux sociaux > 7j',
      description: 'Supprime les mails de la catégorie Réseaux sociaux de plus de 7 jours',
      conditions: [
        { field: 'label', operator: 'equals', value: 'CATEGORY_SOCIAL' },
        { field: 'older_than', operator: 'gt', value: '7d' },
      ],
      action: { type: 'trash' },
      schedule: 'daily',
      is_active: true,
    },
  },

  // ─── Archive ──────────────────────────────────────────
  {
    id: 'archive-old-mails',
    name: 'Archiver les mails > 6 mois',
    description: 'Archive automatiquement sur le NAS les mails de plus de 6 mois',
    category: 'archive',
    dto: {
      name: 'Archiver mails > 6 mois',
      description: 'Archive les mails de plus de 6 mois sur le NAS, chaque dimanche',
      conditions: [
        { field: 'older_than', operator: 'gt', value: '6m' },
      ],
      action: { type: 'archive_nas' },
      schedule: 'weekly',
      is_active: true,
    },
  },
  {
    id: 'archive-invoices',
    name: 'Archiver les factures > 3 mois',
    description: 'Archive les mails contenant "facture" dans le sujet de plus de 3 mois',
    category: 'archive',
    dto: {
      name: 'Archiver factures > 3 mois',
      description: 'Archive les mails contenant "facture" dans le sujet de plus de 3 mois',
      conditions: [
        { field: 'subject', operator: 'contains', value: 'facture' },
        { field: 'older_than', operator: 'gt', value: '3m' },
      ],
      action: { type: 'archive_nas' },
      schedule: 'monthly',
      is_active: true,
    },
  },
  {
    id: 'archive-large-mails',
    name: 'Archiver les gros mails > 10 Mo',
    description: 'Archive les mails de plus de 10 Mo pour libérer de l\'espace',
    category: 'archive',
    dto: {
      name: 'Archiver gros mails > 10 Mo',
      description: 'Archive les mails de plus de 10 Mo sur le NAS',
      conditions: [
        { field: 'size_gt', operator: 'gt', value: '10m' },
      ],
      action: { type: 'archive_nas' },
      schedule: 'monthly',
      is_active: true,
    },
  },

  // ─── Organize ─────────────────────────────────────────
  {
    id: 'organize-mark-read-old',
    name: 'Marquer comme lus les mails > 60j',
    description: 'Marque automatiquement comme lus les mails non lus de plus de 2 mois',
    category: 'organize',
    dto: {
      name: 'Marquer comme lus > 60j',
      description: 'Marque comme lus les mails non lus de plus de 60 jours',
      conditions: [
        { field: 'label', operator: 'equals', value: 'UNREAD' },
        { field: 'older_than', operator: 'gt', value: '60d' },
      ],
      action: { type: 'mark_read' },
      schedule: 'weekly',
      is_active: true,
    },
  },
  {
    id: 'organize-archive-inbox-old',
    name: 'Archiver inbox > 30j',
    description: 'Retire de la boîte de réception les mails de plus de 30 jours',
    category: 'organize',
    dto: {
      name: 'Archiver inbox > 30j',
      description: 'Retire de l\'inbox les mails de plus de 30 jours',
      conditions: [
        { field: 'label', operator: 'equals', value: 'INBOX' },
        { field: 'older_than', operator: 'gt', value: '30d' },
      ],
      action: { type: 'archive' },
      schedule: 'daily',
      is_active: true,
    },
  },
]
