# API Privacy — way out of archive encryption

## Prefix: `/api/privacy`

Session only (refused to API tokens).

**Archive encryption was removed** from Nid: it only protected the EML files' content (subject, sender, recipients, snippet and attachment names stayed in clear in PostgreSQL), and it made the mail unreadable in Nid, invisible to full-text search, and impossible to restore or share. To protect archives at rest, encrypt the NAS volume (LUKS, encrypted ZFS dataset…): it covers the database too. Only the way out remains: putting already encrypted archives back in clear.

---

### `GET /:accountId/encryption/status`

How many archives of the account are still encrypted.

```json
{ "total": 1500, "encrypted": 1200, "unencrypted": 300, "percentage": 80 }
```

### `POST /:accountId/encryption/decrypt-all`

```json
{ "passphrase": "my-passphrase" }
```

Checks the passphrase (`403` otherwise), then starts a `decrypt_archives` job (**202** `{ "jobId" }`) that decrypts every EML and its attachments in place, marks the archive readable, then refills the full-text bodies (`backfill_body_text`) for search. A wrong passphrase writes nothing (GCM tag). The passphrase is neither stored in the `jobs` table nor kept in Redis after the job. Rate limit: 5/min. UI: Settings › Data › **Encrypted archives** (shown only when some remain).

---

## Encrypted file format

```
GMENC01 (7 magic bytes) | SALT (32 bytes) | IV (12 bytes) | TAG (16 bytes) | CIPHERTEXT
```

- Algorithm: AES-256-GCM
- Key derivation: PBKDF2 (SHA-512, 100,000 iterations)
- The passphrase is never stored, only a scrypt hash is kept for verification
