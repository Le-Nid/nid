# API Vie privée & Sécurité

## Préfixe : `/api/privacy`

Toutes les routes nécessitent une authentification JWT.

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
