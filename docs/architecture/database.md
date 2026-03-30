# Base de données

## Schéma ERD

```mermaid
erDiagram
    users {
        uuid id PK
        varchar email
        varchar password_hash "nullable (SSO)"
        varchar role "user | admin"
        varchar display_name
        varchar avatar_url
        varchar google_id "nullable, unique"
        boolean is_active "default true"
        integer max_gmail_accounts "default 5"
        bigint storage_quota_bytes "default 1 Go"
        varchar totp_secret "nullable"
        boolean totp_enabled "default false"
        timestamptz last_login_at
        timestamptz created_at
        timestamptz updated_at
    }

    gmail_accounts {
        uuid id PK
        uuid user_id FK
        varchar email
        text access_token
        text refresh_token
        timestamptz token_expiry
        boolean is_active
    }

    archived_mails {
        uuid id PK
        uuid gmail_account_id FK
        varchar gmail_message_id
        varchar thread_id
        text subject
        varchar sender
        text recipient
        timestamptz date
        bigint size_bytes
        boolean has_attachments
        text[] label_ids
        text eml_path
        text snippet
        tsvector search_vector
        timestamptz archived_at
    }

    archived_attachments {
        uuid id PK
        uuid archived_mail_id FK
        varchar filename
        varchar mime_type
        bigint size_bytes
        text file_path
    }

    rules {
        uuid id PK
        uuid gmail_account_id FK
        varchar name
        jsonb conditions
        jsonb action
        varchar schedule
        boolean is_active
        timestamptz last_run_at
    }

    jobs {
        uuid id PK
        varchar bullmq_id
        varchar type
        varchar status
        integer progress
        integer total
        integer processed
        uuid gmail_account_id FK
        uuid user_id FK
        jsonb payload
        text error
        timestamptz created_at
        timestamptz completed_at
    }

    users ||--o{ gmail_accounts : "possède"
    gmail_accounts ||--o{ archived_mails : "archive"
    archived_mails ||--o{ archived_attachments : "contient"
    gmail_accounts ||--o{ rules : "définit"
    gmail_accounts ||--o{ jobs : "génère"
    users ||--o{ jobs : "possède"
    users ||--o{ notifications : "reçoit"
    users ||--o{ audit_logs : "trace"
    users ||--o{ webhooks : "configure"
    users ||--|| notification_preferences : "paramètre"

    notification_preferences {
        uuid id PK
        uuid user_id FK "unique"
        boolean weekly_report "default true"
        boolean job_completed "default true"
        boolean job_failed "default true"
        boolean rule_executed "default false"
        boolean quota_warning "default true"
        boolean integrity_alert "default true"
        boolean weekly_report_toast "default false"
        boolean job_completed_toast "default true"
        boolean job_failed_toast "default true"
        boolean rule_executed_toast "default false"
        boolean quota_warning_toast "default false"
        boolean integrity_alert_toast "default false"
        timestamptz updated_at
    }

    webhooks {
        uuid id PK
        uuid user_id FK
        varchar name "max 100"
        text url
        varchar type "generic | discord | slack | ntfy"
        text[] events
        boolean is_active "default true"
        varchar secret "nullable, HMAC generic"
        timestamptz last_triggered_at
        integer last_status
        timestamptz created_at
    }

    notifications {
        uuid id PK
        uuid user_id FK
        varchar type
        varchar title
        text body
        jsonb data
        boolean is_read "default false"
        timestamptz created_at
    }

    audit_logs {
        uuid id PK
        uuid user_id FK
        varchar action "ex: user.login, rule.create"
        varchar target_type "nullable"
        varchar target_id "nullable"
        jsonb details "nullable"
        varchar ip_address "nullable"
        timestamptz created_at
    }
```

---

## Index

| Table | Index | Type | Usage |
|---|---|---|---|
| `archived_mails` | `search_vector` | GIN | Recherche full-text |
| `archived_mails` | `gmail_account_id` | BTree | Filtrage par compte |
| `archived_mails` | `sender` | BTree | Filtrage par expéditeur |
| `archived_mails` | `date DESC` | BTree | Tri par date |
| `archived_mails` | `size_bytes DESC` | BTree | Tri par taille |
| `archived_attachments` | `archived_mail_id` | BTree | Join mails ↔ PJ |
| `jobs` | `gmail_account_id` | BTree | Filtrage jobs par compte |
| `jobs` | `status` | BTree | Filtrage par statut |
| `jobs` | `created_at DESC` | BTree | Tri par date |
| `jobs` | `user_id` | BTree | Filtrage jobs par utilisateur |
| `users` | `google_id` (partiel) | Unique | Lookup SSO Google |
| `audit_logs` | `user_id + created_at` | BTree | Logs par utilisateur |
| `audit_logs` | `action + created_at` | BTree | Filtrage par action |
| `webhooks` | `user_id` | BTree | Filtrage par utilisateur |
| `notification_preferences` | `user_id` | Unique | Une ligne par utilisateur |

---

## Recherche full-text

Le champ `search_vector` est mis à jour automatiquement via un trigger PostgreSQL à chaque insert/update sur `archived_mails` :

```sql
-- Poids de recherche :
-- A (le plus fort) : sujet
-- B : expéditeur
-- C : snippet (extrait du corps)
NEW.search_vector :=
  setweight(to_tsvector('french', COALESCE(NEW.subject, '')), 'A') ||
  setweight(to_tsvector('french', COALESCE(NEW.sender, '')), 'B') ||
  setweight(to_tsvector('french', COALESCE(NEW.snippet, '')), 'C');
```

Exemple de requête de recherche :

```sql
SELECT *, ts_rank(search_vector, query) AS rank
FROM archived_mails, to_tsquery('french', 'facture & 2024') query
WHERE gmail_account_id = $1
  AND search_vector @@ query
ORDER BY rank DESC, date DESC;
```

---

## JSONB — Format des règles

### `conditions` (tableau)

```json
[
  { "field": "from", "operator": "contains", "value": "newsletter@" },
  { "field": "subject", "operator": "contains", "value": "promotion" }
]
```

Champs supportés : `from`, `to`, `subject`, `has_attachment`, `size_gt` (octets)

Opérateurs : `contains`, `equals`, `not_contains`, `gt`, `lt`

### `action` (objet)

```json
{ "type": "trash" }
{ "type": "label", "labelId": "Label_123" }
{ "type": "archive" }
{ "type": "archive_nas" }
```
