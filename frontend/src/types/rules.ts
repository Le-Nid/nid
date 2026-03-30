export type ConditionField = 'from' | 'to' | 'subject' | 'has_attachment' | 'size_gt' | 'size_lt' | 'label' | 'older_than' | 'newer_than'
export type ConditionOperator = 'contains' | 'not_contains' | 'equals' | 'not_equals' | 'gt' | 'lt' | 'is_true'
export type ActionType = 'trash' | 'delete' | 'label' | 'unlabel' | 'archive' | 'archive_nas' | 'mark_read' | 'mark_unread'

export interface RuleCondition {
  field: ConditionField
  operator: ConditionOperator
  value: string | number | boolean
}

export interface RuleAction {
  type: ActionType
  labelId?: string
}

export interface Rule {
  id: string
  gmail_account_id: string
  name: string
  description?: string
  conditions: RuleCondition[]
  action: RuleAction
  schedule?: string | null
  is_active: boolean
  last_run_at?: string | null
  created_at: string
  updated_at: string
}

export const CONDITION_FIELD_LABELS: Record<ConditionField, string> = {
  from: 'Expéditeur',
  to: 'Destinataire',
  subject: 'Sujet',
  has_attachment: 'Pièce jointe',
  size_gt: 'Taille supérieure à',
  size_lt: 'Taille inférieure à',
  label: 'Label',
  older_than: 'Plus ancien que',
  newer_than: 'Plus récent que',
}

export const CONDITION_OPERATOR_LABELS: Record<ConditionOperator, string> = {
  contains: 'contient',
  not_contains: 'ne contient pas',
  equals: 'est exactement',
  not_equals: "n'est pas",
  gt: 'supérieur à',
  lt: 'inférieur à',
  is_true: 'est vrai',
}

export const ACTION_LABELS: Record<ActionType, string> = {
  trash: 'Mettre à la corbeille',
  delete: 'Supprimer définitivement',
  label: 'Ajouter un label',
  unlabel: 'Retirer un label',
  archive: 'Archiver (retirer de INBOX)',
  archive_nas: 'Archiver sur le NAS',
  mark_read: 'Marquer comme lu',
  mark_unread: 'Marquer comme non lu',
}

export const SCHEDULE_OPTIONS = [
  { value: null, label: 'Manuel uniquement' },
  { value: 'hourly', label: 'Toutes les heures' },
  { value: 'daily', label: 'Chaque jour' },
  { value: 'weekly', label: 'Chaque semaine' },
  { value: 'monthly', label: 'Chaque mois' },
]
