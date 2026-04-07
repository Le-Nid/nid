# Architecture Backend

## Stack

| Librairie | Rôle |
|---|---|
| `fastify` | Framework HTTP, performant et TypeScript-first |
| `@fastify/jwt` | Auth JWT (access token sur chaque requête) |
| `@fastify/cors` | CORS configuré sur `FRONTEND_URL` uniquement |
| `@fastify/swagger` | Génération OpenAPI automatique |
| `@fastify/rate-limit` | 100 req/min par IP par défaut |
| `googleapis` | Client officiel Gmail API v1 |
| `bullmq` | Queue de jobs asynchrones (Redis-backed) |
| `postgres` | Client PostgreSQL léger et typé |
| `ioredis` | Client Redis (BullMQ + cache) |
| `zod` | Validation des inputs |
| `mailparser` | Parsing EML pour lecture archives |
| `bcrypt` | Hashage des mots de passe |
| `otplib` | Génération et vérification de codes TOTP (2FA) |
| `qrcode` | Génération de QR codes pour configuration 2FA |

---

## Structure des plugins Fastify

```
src/plugins/
├── index.ts      ← Enregistrement de tous les plugins (ordre important)
├── db.ts         ← Connexion PostgreSQL, décoration app.db
└── redis.ts      ← Connexion Redis, décoration app.redis
```

Le décorateur `app.authenticate` est défini dans `plugins/index.ts` et utilisé comme `preHandler` sur toutes les routes protégées :

```typescript
app.get('/route-protegee', { preHandler: [app.authenticate] }, async (req) => {
  const { sub: userId, role } = req.user as { sub: string; role: string }
  // ...
})
```

Deux décorateurs supplémentaires assurent l’isolation multi-utilisateurs :

- **`app.requireAccountOwnership`** — Vérifie que le paramètre `:accountId` de la route appartient bien à l’utilisateur authentifié (lookup dans `gmail_accounts`). Utilisé sur toutes les routes Gmail, archive, dashboard et rules.
- **`app.requireAdmin`** — Vérifie que `role === 'admin'` dans le payload JWT. Utilisé sur toutes les routes `/api/admin/*`.

```typescript
// Exemple : route isolée par compte
app.get('/mails/:accountId', {
  preHandler: [app.authenticate, app.requireAccountOwnership]
}, handler)

// Exemple : route admin
app.get('/admin/users', {
  preHandler: [app.authenticate, app.requireAdmin]
}, handler)
```

---

## Gestion des tokens OAuth2
Deux flux OAuth2 Google coexistent :

1. **Gmail OAuth2** — Pour connecter un compte Gmail (scopes `gmail.modify`, `gmail.labels`, `userinfo.email`). Les tokens sont stockés chiffrés dans `gmail_accounts`.
2. **Google SSO** — Pour l’authentification utilisateur (scopes `openid`, `userinfo.email`, `userinfo.profile`). Crée ou fusionne un compte utilisateur basé sur le `google_id`. Le redirect URI dédié est configuré via `GOOGLE_SSO_REDIRECT_URI`.
Les tokens Google sont stockés chiffrés en base (table `gmail_accounts`). Le refresh est automatique via l'event `tokens` du client Google :

```typescript
oauth2Client.on('tokens', async (tokens) => {
  // Mise à jour automatique access_token + expiry en base
})
```

::: warning Refresh token
Google ne retourne le `refresh_token` qu'au **premier** consentement (`prompt: 'consent'`). Si un utilisateur reconnecte le même compte, on conserve l'ancien refresh_token via `COALESCE` en SQL. Ne jamais écraser un refresh_token existant par `null`.
:::

Le Google SSO utilise `prompt: 'select_account'` pour permettre à l'utilisateur de choisir son compte sans redemander le consentement à chaque connexion.

---

## Throttling Gmail API

Le quota Gmail API est de **250 unités/user/seconde**. Chaque `messages.get` coûte 5 unités.

La configuration conservatrice retenue :

```typescript
GMAIL_BATCH_SIZE: 100,   // 100 messages.get en parallèle = 500 unités
GMAIL_THROTTLE_MS: 500,  // Pause 500ms entre chaque batch → ~1000 unités/sec max
```

Avec le throttling, on reste à ~1 000 unités/sec ce qui dépasse le quota si plusieurs users sont actifs simultanément. En production avec plusieurs comptes, réduire `GMAIL_BATCH_SIZE` à 50 ou augmenter `GMAIL_THROTTLE_MS` à 1000ms.

---

## Démarrage du worker unifié

Un **worker unifié** (`unified.worker.ts`) écoute la queue `nid` et dispatche chaque job par `job.name` via un `switch`. Cela évite que plusieurs workers écoutant la même queue se volent mutuellement les jobs.

Chaque worker injecte le `user_id` dans la table `jobs` pour assurer l'isolation des données par utilisateur.

```typescript
import { startUnifiedWorker } from './jobs/workers/unified.worker'

// Dans bootstrap()
startUnifiedWorker()
```

Les types de jobs gérés : `bulk_operation`, `archive_mails`, `run_rule`, `scan_unsubscribe`, `scan_tracking`, `scan_pii`, `encrypt_archives`.

---

## Module Vie privée & Sécurité

Le module privacy (`src/privacy/`) contient trois services indépendants :

```
src/privacy/
├── tracking.service.ts    ← Détection de pixels espions
├── pii.service.ts         ← Scanner de données sensibles (PII)
└── encryption.service.ts  ← Chiffrement AES-256-GCM des archives
```

### Détecteur de pixels espions

Le service analyse le corps HTML des messages Gmail pour identifier trois types de trackers :

1. **Pixels 1×1** — images avec `width=1 height=1`, `display:none` ou `visibility:hidden`
2. **Domaines connus** — base de 35+ domaines ESP (Mailchimp, SendGrid, HubSpot, Klaviyo, Brevo…)
3. **Paramètres UTM** — liens contenant `utm_source`, `utm_medium`, `utm_campaign`, etc.

Le scan est lancé en job asynchrone (BullMQ). Les résultats sont stockés dans `tracking_pixels` avec le détail JSON de chaque tracker détecté.

### Scanner PII

Le service scanne les fichiers EML archivés sur disque pour détecter les données sensibles via regex :

| Type | Description |
|---|---|
| `credit_card` | Carte Visa, Mastercard, Amex (avec séparateurs) |
| `iban` | Numéro IBAN international |
| `french_ssn` | Numéro de sécurité sociale français |
| `password_plain` | Mot de passe en clair (`password:`, `mdp=`, etc.) |
| `phone_fr` | Numéro de téléphone français (+33 / 06…) |

Les snippets stockés sont automatiquement masqués (ex: `****-****-****-4242`) pour ne pas exposer les données réelles.

### Chiffrement des archives

Le chiffrement utilise `crypto` natif Node.js, sans dépendance externe :

- **Algorithme** : AES-256-GCM (confidentialité + intégrité)
- **Dérivation de clé** : PBKDF2 (SHA-512, 100 000 itérations, salt aléatoire 32 octets)
- **Stockage** : seul un hash scrypt de la phrase secrète est conservé en base (`users.encryption_key_hash`), jamais la phrase elle-même
- **Idempotence** : les fichiers déjà chiffrés sont détectés par magic bytes `GMENC01` et ignorés
- **Déchiffrement à la volée** : via l'endpoint `decrypt-mail`, le fichier reste chiffré sur le disque

---

## Décodage EML et MIME

Le service d'archivage récupère les mails au format `raw` (EML complet encodé en base64 URL-safe). Comme ce format ne remplit pas `payload.headers`, les en-têtes (Subject, From, To, Date) sont parsés directement depuis le contenu EML brut.

Les sujets utilisant l'encodage RFC 2047 (`=?UTF-8?B?...?=`, `=?UTF-8?Q?...?=`) sont décodés par la fonction `decodeMimeWords()` qui gère :

- **Base64** (`?B?`) — décodage standard
- **Quoted-Printable** (`?Q?`) — remplacement des `=XX` et `_` (espace)
- **Charsets multiples** — via `TextDecoder` (UTF-8, ISO-8859-1, etc.)
