# API Privacy & Security

## Prefix: `/api/privacy`

All routes require JWT authentication.

---

## Archive encryption

### `GET /:accountId/encryption/status`

Encryption status for an account.

**Response:**
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

Configures the encryption passphrase (one-time only).

**Body:**
```json
{ "passphrase": "ma-phrase-secrete-longue" }
```

**Response:**
```json
{ "ok": true }
```

**Errors:**
- `400` — Passphrase too short (< 8 characters)
- `409` — Encryption already configured

### `POST /encryption/verify`

Verifies that the passphrase is correct.

**Body:**
```json
{ "passphrase": "ma-phrase-secrete-longue" }
```

**Response:**
```json
{ "valid": true }
```

### `POST /:accountId/encryption/encrypt`

Launches AES-256-GCM encryption of all unencrypted archives.

**Body:**
```json
{ "passphrase": "ma-phrase-secrete-longue" }
```

**Response (202):**
```json
{ "jobId": "encrypt_archives-1711891234567", "message": "Encryption job enqueued" }
```

**Errors:**
- `403` — Invalid passphrase

### `POST /:accountId/encryption/decrypt-mail`

Decrypts an archived email on-the-fly for viewing.

**Body:**
```json
{
  "mailId": "uuid-du-mail",
  "passphrase": "ma-phrase-secrete-longue"
}
```

**Response:**
```json
{ "content": "From: sender@example.com\nTo: ...\n\nContenu du mail EML déchiffré" }
```

**Errors:**
- `400` — Email not encrypted or missing parameters
- `403` — Invalid passphrase
- `404` — Email not found

---

## Encrypted file format

Encrypted EML files use the following format:

```
GMENC01 (7 bytes magic) | SALT (32 bytes) | IV (12 bytes) | TAG (16 bytes) | CIPHERTEXT
```

- Algorithm: AES-256-GCM
- Key derivation: PBKDF2 (SHA-512, 100,000 iterations)
- The passphrase is never stored; only a scrypt hash is kept for verification
