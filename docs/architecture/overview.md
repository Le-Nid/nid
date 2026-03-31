# Vue d'ensemble de l'architecture

## Diagramme général

```mermaid
graph TB
    subgraph Frontend["Frontend (React 19 + Ant Design + i18n)"]
        UI[Interface web :3000]
    end

    subgraph Backend["Backend (Fastify + TypeScript)"]
        API[API REST :4000]
        Workers[BullMQ Workers]
    end

    subgraph Storage["Stockage"]
        PG[(PostgreSQL\nMétadonnées + index)]
        Redis[(Redis\nQueue BullMQ)]
        NAS[📁 NAS\nArchives EML]
    end

    subgraph External["Externe"]
        Gmail[Gmail API\nOAuth2]
    end

    UI -->|HTTP + JWT| API
    API -->|OAuth2| Gmail
    API --> PG
    API --> Redis
    Workers --> PG
    Workers --> Redis
    Workers -->|Écriture EML| NAS
    Workers -->|Gmail API| Gmail
```

---

## Flux d'une opération bulk

```mermaid
sequenceDiagram
    participant UI as Frontend
    participant API as Backend API
    participant Queue as BullMQ
    participant Worker as Worker
    participant Gmail as Gmail API

    UI->>API: POST /api/gmail/:id/messages/bulk
    API->>Queue: enqueueJob("bulk_operation", payload)
    API-->>UI: 202 Accepted {jobId}
    
    UI->>API: GET /api/jobs/events (SSE)
    loop Événements temps réel
        API-->>UI: SSE {jobId, status, progress, processed/total}
    end

    Queue->>Worker: Job dépilé
    loop Par batch de 100 (throttlé 500ms)
        Worker->>Gmail: messages.trash() / modify()
    end
    Worker->>API: Job completed
```

---

## Flux d'archivage différentiel

```mermaid
sequenceDiagram
    participant UI as Frontend
    participant API as Backend API
    participant Worker as Archive Worker
    participant Gmail as Gmail API
    participant PG as PostgreSQL
    participant NAS as NAS (EML)

    UI->>API: POST /api/archive/:id/archive {query, differential:true}
    API->>Worker: enqueueJob("archive_mails")
    
    Worker->>Gmail: messages.list(query) → IDs
    Worker->>PG: SELECT gmail_message_id WHERE account=... → IDs déjà archivés
    Note over Worker: Diff = nouveaux IDs seulement
    
    loop Pour chaque nouvel ID
        Worker->>Gmail: messages.get(id, format=raw)
        Worker->>NAS: Écriture {id}.eml
        Worker->>NAS: Écriture pièces jointes
        Worker->>PG: INSERT archived_mails + archived_attachments
    end
```

---

## Flux de scan vie privée

```mermaid
sequenceDiagram
    participant UI as Frontend
    participant API as Backend API
    participant Queue as BullMQ
    participant Worker as Privacy Worker
    participant Gmail as Gmail API
    participant PG as PostgreSQL
    participant NAS as NAS (EML)

    Note over UI,NAS: Détection de pixels espions
    UI->>API: POST /api/privacy/:id/tracking/scan
    API->>Queue: enqueueJob("scan_tracking")
    API-->>UI: 202 {jobId}
    Queue->>Worker: Job dépilé
    loop Pour chaque message récent
        Worker->>Gmail: messages.get(id, format=full)
        Worker->>Worker: detectTrackingPixels(html)
        alt Trackers détectés
            Worker->>PG: INSERT tracking_pixels
        end
    end

    Note over UI,NAS: Scanner PII dans les archives
    UI->>API: POST /api/privacy/:id/pii/scan
    API->>Queue: enqueueJob("scan_pii")
    Queue->>Worker: Job dépilé
    loop Pour chaque EML archivé
        Worker->>NAS: Lecture fichier .eml
        Worker->>Worker: detectPii(contenu)
        alt PII détectées
            Worker->>PG: INSERT pii_findings
        end
    end

    Note over UI,NAS: Chiffrement des archives
    UI->>API: POST /api/privacy/:id/encryption/encrypt
    API->>Queue: enqueueJob("encrypt_archives")
    Queue->>Worker: Job dépilé
    loop Pour chaque EML non chiffré
        Worker->>NAS: Lecture → chiffrement AES-256-GCM → écriture
        Worker->>PG: UPDATE archived_mails SET is_encrypted=true
    end
```

---

## Décisions d'architecture

### EML plutôt que mbox

Le format mbox stocke tous les mails dans un seul fichier par dossier. Cela rend le différentiel complexe (besoin d'un index externe) et fragilise les archives (un fichier corrompu = tout le dossier perdu).

EML (1 fichier par mail) permet :

- Un diff simple par comparaison d'IDs dans PostgreSQL
- La lecture directe d'un mail sans parser le reste
- La résistance à la corruption
- Un stockage des pièces jointes proprement séparé

### BullMQ pour toutes les opérations longues

Gmail API avec 5 000 mails implique potentiellement plusieurs minutes de traitement. Faire ça en synchrone HTTP (timeout à 30s) est impossible.

BullMQ permet :

- La progression temps réel (polling frontend)
- La reprise en cas d'erreur (retry avec backoff exponentiel)
- L'annulation d'un job en cours
- La concurrence contrôlée (max 3 jobs bulk en parallèle, 1 pour l'archivage)

### PostgreSQL pour les métadonnées

Les métadonnées des mails archivés (expéditeur, sujet, date, taille) sont indexées dans PostgreSQL avec un index `tsvector` pour la recherche full-text. Cela évite de parser les fichiers EML pour chaque recherche.

### Chiffrement au repos des archives

Les archives EML peuvent être chiffrées sur le NAS avec AES-256-GCM. La clé est dérivée de la phrase secrète de l'utilisateur via PBKDF2 (SHA-512, 100 000 itérations). À aucun moment la phrase secrète n'est stockée — seul un hash scrypt de vérification est conservé en base.

Format binaire du fichier chiffré :

```
GMENC01 (7 B) | SALT (32 B) | IV (12 B) | AUTH_TAG (16 B) | CIPHERTEXT
```

Ce format permet le déchiffrement à la volée sans fichier temporaire, et la détection immédiate d'un fichier chiffré (magic bytes `GMENC01`).
