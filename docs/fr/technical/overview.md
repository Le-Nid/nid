# Vue d'ensemble de l'architecture

## Diagramme général

```mermaid
graph TB
    subgraph Container["Conteneur nid (image Docker unifiée)"]
        Nginx[Nginx :3000\nfrontend statique + proxy /api]
        subgraph Backend["Backend Node (Fastify) :4000"]
            API[API REST + SSE]
            Worker[Worker BullMQ unifié]
            Sched[Schedulers]
        end
    end

    UI[Frontend React 19\nshadcn/Tailwind + React Query] -->|HTTP + cookie JWT| Nginx
    Nginx --> API

    subgraph Storage["Stockage"]
        PG[(PostgreSQL\nMétadonnées + index)]
        Redis[(Redis\nQueue BullMQ + pub/sub)]
        NAS[📁 NAS\nArchives EML]
    end

    subgraph External["Externe"]
        Gmail[Gmail API\nOAuth2]
    end

    API -->|OAuth2| Gmail
    API --> PG
    API --> Redis
    Sched -->|enqueueJob| Redis
    Worker --> PG
    Worker --> Redis
    Worker -->|Écriture EML| NAS
    Worker -->|Gmail API| Gmail
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

    UI->>API: POST /api/gmail/:accountId/messages/bulk {action, messageIds | query, delayMs}
    API->>Queue: enqueueJob("bulk_operation", payload, {delay: delayMs})
    API-->>UI: 202 Accepted {jobId, runAt}

    Note over UI,Queue: Fenêtre d'annulation (10 s par défaut) :<br/>DELETE /api/jobs/:jobId retire le job

    UI->>API: GET /api/jobs/:jobId/events (SSE)
    Queue->>Worker: Job dépilé (après le délai)
    loop Par lot de 50 ids, ou page de 500 résultats de la requête
        Worker->>Gmail: messages.trash() / batchModify()
        Worker-->>API: progress (QueueEvents)
        API-->>UI: SSE {status, progress, processed, total}
    end
    Worker-->>API: completed
    API-->>UI: SSE état final
```

---

## Flux d'archivage différentiel

```mermaid
sequenceDiagram
    participant UI as Frontend
    participant API as Backend API
    participant Worker as Worker
    participant Gmail as Gmail API
    participant PG as PostgreSQL
    participant NAS as NAS (EML)

    UI->>API: POST /api/archive/:accountId/archive {query, differential:true}
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
    Note over Worker: Plus de BULK_QUERY_MAX nouveaux mails :<br/>suite différentielle ré-enfilée après ARCHIVE_CONTINUE_DELAY_MIN
```

Le même job sert à la sauvegarde NAS automatique : le scheduler l'enfile pour chaque compte dont `backup_enabled` est actif, selon `backup_interval`.

---

## Flux de chiffrement des archives

```mermaid
sequenceDiagram
    participant UI as Frontend
    participant API as Backend API
    participant Queue as BullMQ
    participant Worker as Worker
    participant PG as PostgreSQL
    participant NAS as NAS (EML)

    Note over UI,NAS: Chiffrement des archives
    UI->>API: POST /api/privacy/:accountId/encryption/encrypt
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

- La progression temps réel (SSE alimenté par les `QueueEvents` BullMQ)
- La reprise en cas d'erreur (retry avec backoff exponentiel)
- Une fenêtre d'annulation avant exécution (jobs différés), et l'annulation d'un job pas encore démarré
- La concurrence contrôlée (un worker unifié, 3 jobs en parallèle, tous types confondus)

Voir [Jobs & Queue](jobs.md).

### PostgreSQL pour les métadonnées

Les métadonnées des mails archivés (expéditeur, sujet, date, taille) sont indexées dans PostgreSQL avec un index `tsvector` pour la recherche full-text. Cela évite de parser les fichiers EML pour chaque recherche.

### Chiffrement au repos des archives

Les archives EML peuvent être chiffrées sur le NAS avec AES-256-GCM. La clé est dérivée de la phrase secrète de l'utilisateur via PBKDF2 (SHA-512, 100 000 itérations). À aucun moment la phrase secrète n'est stockée — seul un hash scrypt de vérification est conservé en base.

Format binaire du fichier chiffré :

```
GMENC01 (7 B) | SALT (32 B) | IV (12 B) | AUTH_TAG (16 B) | CIPHERTEXT
```

Ce format permet le déchiffrement à la volée sans fichier temporaire, et la détection immédiate d'un fichier chiffré (magic bytes `GMENC01`).
