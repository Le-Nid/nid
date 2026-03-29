// ─── Conditions ───────────────────────────────────────────

export type ConditionField = 'from' | 'to' | 'subject' | 'has_attachment' | 'size_gt' | 'size_lt' | 'label'
export type ConditionOperator = 'contains' | 'not_contains' | 'equals' | 'not_equals' | 'gt' | 'lt' | 'is_true'

export interface RuleCondition {
  field: ConditionField
  operator: ConditionOperator
  value: string | number | boolean
}

// ─── Actions ──────────────────────────────────────────────

export type ActionType = 'trash' | 'delete' | 'label' | 'unlabel' | 'archive' | 'archive_nas' | 'mark_read' | 'mark_unread'

export interface RuleAction {
  type: ActionType
  labelId?: string   // requis pour label / unlabel
}

// ─── Règle complète ───────────────────────────────────────

export interface Rule {
  id: string
  gmail_account_id: string
  name: string
  description?: string
  conditions: RuleCondition[]
  action: RuleAction
  schedule?: string         // cron string, null = manuel seulement
  is_active: boolean
  last_run_at?: string
  created_at: string
  updated_at: string
}

export interface RuleCreateDTO {
  name: string
  description?: string
  conditions: RuleCondition[]
  action: RuleAction
  schedule?: string
  is_active?: boolean
}

// ─── Résultat d'exécution ─────────────────────────────────

export interface RuleRunResult {
  ruleId: string
  matched: number    // nombre de mails matchés
  processed: number  // nombre d'actions effectuées
  jobId?: string     // si opération bulk asynchrone
  errors: string[]
}
