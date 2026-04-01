# API Vie privée & Sécurité

## Préfixe : `/api/privacy`

Toutes les routes nécessitent une authentification JWT.

---

## Détection de pixels espions (Tracking Pixels)

### `GET /:accountId/tracking/stats`

Statistiques des pixels espions détectés.

**Réponse :**
```json
{
  "trackedMessages": 42,
  "totalTrackers": 87,
  "topDomains": [
    { "domain": "mailchimp.com", "count": 15 },
    { "domain": "sendgrid.net", "count": 12 }
  ]
}
```

### `GET /:accountId/tracking`

Liste paginée des mails contenant des trackers.

**Query params :** `page`, `limit`

**Réponse :**
```json
{
  "items": [
    {
      "id": "uuid",
      "gmail_message_id": "abc123",
      "subject": "Newsletter Mars",
      "sender": "news@example.com",
      "date": "2026-03-15T10:00:00Z",
      "trackers": [
        { "type": "pixel", "domain": "mailchimp.com", "url": "https://..." },
        { "type": "utm", "domain": "example.com", "params": ["utm_source", "utm_medium"] }
      ],
      "tracker_count": 2,
      "scanned_at": "2026-03-20T08:00:00Z"
    }
  ],
  "total": 42,
  "page": 1,
  "limit": 20
}
```

### `POST /:accountId/tracking/scan`

Lance un scan asynchrone des mails récents pour détecter les pixels espions.

**Body (optionnel) :**
```json
{ "maxMessages": 200 }
```

**Réponse (202) :**
```json
{ "jobId": "scan_tracking-1711891234567", "message": "Tracking pixel scan enqueued" }
```

---

## Scanner PII (données sensibles)

### `GET /:accountId/pii/stats`

Statistiques des données sensibles trouvées dans les archives.

**Réponse :**
```json
{
  "totalFindings": 5,
  "affectedMails": 3,
  "byType": [
    { "type": "credit_card", "count": 2 },
    { "type": "iban", "count": 1 },
    { "type": "password_plain", "count": 2 }
  ]
}
```

### `GET /:accountId/pii`

Liste paginée des PII détectées dans les archives.

**Query params :** `page`, `limit`, `piiType` (optionnel, filtrer par type)

**Types PII supportés :** `credit_card`, `iban`, `french_ssn`, `password_plain`, `phone_fr`

**Réponse :**
```json
{
  "items": [
    {
      "id": "uuid",
      "archived_mail_id": "uuid",
      "pii_type": "credit_card",
      "count": 1,
      "snippet": "****-****-****-4242",
      "scanned_at": "2026-03-20T08:00:00Z",
      "subject": "Confirmation de commande",
      "sender": "shop@example.com",
      "date": "2026-01-15T14:00:00Z"
    }
  ],
  "total": 5,
  "page": 1,
  "limit": 20
}
```

### `POST /:accountId/pii/scan`

Lance un scan asynchrone des archives EML pour détecter les données sensibles.

**Réponse (202) :**
```json
{ "jobId": "scan_pii-1711891234567", "message": "PII scan enqueued" }
```

---

## Chiffrement des archives

### `GET /:accountId/encryption/status`

Statut du chiffrement pour un compte.

**Réponse :**
```json
{
  "total": 1500,
  "encrypted": 1200,
  "unencrypted": 300,
  "percentage": 80,
  "hasEncryptionKey": true
}
```

### `POST /encryption/setup`

Configure la phrase secrète de chiffrement (une seule fois).

**Body :**
```json
{ "passphrase": "ma-phrase-secrete-longue" }
```

**Réponse :**
```json
{ "ok": true }
```

**Erreurs :**
- `400` — Phrase secrète trop courte (< 8 caractères)
- `409` — Chiffrement déjà configuré

### `POST /encryption/verify`

Vérifie que la phrase secrète est correcte.

**Body :**
```json
{ "passphrase": "ma-phrase-secrete-longue" }
```

**Réponse :**
```json
{ "valid": true }
```

### `POST /:accountId/encryption/encrypt`

Lance le chiffrement AES-256-GCM de toutes les archives non chiffrées.

**Body :**
```json
{ "passphrase": "ma-phrase-secrete-longue" }
```

**Réponse (202) :**
```json
{ "jobId": "encrypt_archives-1711891234567", "message": "Encryption job enqueued" }
```

**Erreurs :**
- `403` — Phrase secrète invalide

### `POST /:accountId/encryption/decrypt-mail`

Déchiffre un mail archivé à la volée pour consultation.

**Body :**
```json
{
  "mailId": "uuid-du-mail",
  "passphrase": "ma-phrase-secrete-longue"
}
```

**Réponse :**
```json
{ "content": "From: sender@example.com\nTo: ...\n\nContenu du mail EML déchiffré" }
```

**Erreurs :**
- `400` — Mail non chiffré ou paramètres manquants
- `403` — Phrase secrète invalide
- `404` — Mail non trouvé

---

## Format du fichier chiffré

Les fichiers EML chiffrés utilisent le format suivant :

```
GMENC01 (7 octets magic) | SALT (32 octets) | IV (12 octets) | TAG (16 octets) | CIPHERTEXT
```

- Algorithme : AES-256-GCM
- Dérivation de clé : PBKDF2 (SHA-512, 100 000 itérations)
- La phrase secrète n'est jamais stockée, seul un hash scrypt est conservé pour vérification

## Patterns PII détectés

| Type | Description | Exemple masqué |
|------|-------------|----------------|
| `credit_card` | Visa, Mastercard, Amex | `****-****-****-4242` |
| `iban` | Numéro IBAN | `FR76****...` |
| `french_ssn` | N° sécurité sociale FR | `1 9*-**-***-***-**` |
| `password_plain` | Mot de passe en clair | `********` |
| `phone_fr` | Téléphone français | `06 12 34 ****` |

## Domaines de tracking connus

Le scanner détecte automatiquement les images provenant de 35+ domaines d'ESP connus, dont : Mailchimp, SendGrid, HubSpot, Klaviyo, Brevo, Campaign Monitor, ConvertKit, etc.

Détection complémentaire :
- **Pixels 1×1** : images avec `width=1 height=1` ou `display:none`
- **Paramètres UTM** : liens contenant `utm_source`, `utm_medium`, etc.
