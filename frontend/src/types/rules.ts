export type ConditionField = 'from' | 'to' | 'subject' | 'has_attachment' | 'size_gt' | 'size_lt' | 'label' | 'older_than' | 'newer_than'
export type ConditionOperator = 'contains' | 'not_contains' | 'equals' | 'not_equals' | 'gt' | 'lt' | 'is_true'
export type ActionType = 'trash' | 'delete' | 'label' | 'unlabel' | 'archive' | 'archive_nas' | 'mark_read' | 'mark_unread'
export type Schedule = 'hourly' | 'daily' | 'weekly' | 'monthly'

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
  account_id: string
  name: string
  description?: string
  conditions: RuleCondition[]
  action: RuleAction
  schedule?: Schedule | null
  is_active: boolean
  last_run_at?: string | null
  /** Template the rule was created from (L5), null for hand-made rules. */
  template_id?: string | null
  created_at: string
  updated_at: string
}

export interface RuleTemplate {
  id: string
  name: string
  description: string
  category: 'cleanup' | 'archive' | 'organize' | 'label' | 'expire'
  label?: { name: string }
}

/** `POST /api/rules/:id/preview` (B6). */
export interface RulePreview {
  query: string
  estimatedCount: number
  sizeBytes: number
  samples: { id: string; from: string; subject: string; date: string }[]
}
