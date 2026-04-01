export interface TrackerInfo {
  type: 'pixel' | 'utm' | 'known_domain'
  domain?: string
  url?: string
  params?: string[]
}

export interface TrackedMessage {
  id: string
  gmail_message_id: string
  subject: string | null
  sender: string | null
  date: string | null
  trackers: TrackerInfo[]
  tracker_count: number
  scanned_at: string
}

export interface TrackingStats {
  trackedMessages: number
  totalTrackers: number
  topDomains: { domain: string; count: number }[]
}

export interface PiiByType {
  type: string
  count: number
}

export interface PiiStats {
  totalFindings: number
  affectedMails: number
  byType: PiiByType[]
}

export interface PiiFinding {
  id: string
  archived_mail_id: string
  pii_type: string
  count: number
  snippet: string | null
  scanned_at: string
  subject: string | null
  sender: string | null
  date: string | null
}

export interface EncryptionStatus {
  total: number
  encrypted: number
  unencrypted: number
  percentage: number
  hasEncryptionKey: boolean
}

export const PII_TYPE_LABELS: Record<string, { fr: string; en: string }> = {
  credit_card: { fr: 'Carte bancaire', en: 'Credit card' },
  iban: { fr: 'IBAN', en: 'IBAN' },
  french_ssn: { fr: 'N° Sécu. sociale', en: 'Social Security #' },
  password_plain: { fr: 'Mot de passe', en: 'Password' },
  phone_fr: { fr: 'Téléphone FR', en: 'French phone' },
}

export const TRACKER_TYPE_LABELS: Record<string, { fr: string; en: string }> = {
  pixel: { fr: 'Pixel espion', en: 'Tracking pixel' },
  utm: { fr: 'Paramètres UTM', en: 'UTM parameters' },
  known_domain: { fr: 'Domaine traqueur', en: 'Tracking domain' },
}
