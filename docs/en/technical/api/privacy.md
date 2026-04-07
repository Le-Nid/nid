# API Privacy & Security

## Prefix: `/api/privacy`

All routes require JWT authentication.

---

## Tracking pixel detection

### `GET /:accountId/tracking/stats`

Tracking pixel detection statistics.

**Response:**
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

Paginated list of emails containing trackers.

**Query params:** `page`, `limit`

**Response:**
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

Launches an asynchronous scan of recent emails to detect tracking pixels.

**Body (optional):**
```json
{ "maxMessages": 200 }
```

**Response (202):**
```json
{ "jobId": "scan_tracking-1711891234567", "message": "Tracking pixel scan enqueued" }
```

---

## PII scanner (sensitive data)

### `GET /:accountId/pii/stats`

Statistics of sensitive data found in archives.

**Response:**
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

Paginated list of PII detected in archives.

**Query params:** `page`, `limit`, `piiType` (optional, filter by type)

**Supported PII types:** `credit_card`, `iban`, `french_ssn`, `password_plain`, `phone_fr`

**Response:**
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

Launches an asynchronous scan of EML archives to detect sensitive data.

**Response (202):**
```json
{ "jobId": "scan_pii-1711891234567", "message": "PII scan enqueued" }
```

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

## Detected PII patterns

| Type | Description | Masked example |
|------|-------------|----------------|
| `credit_card` | Visa, Mastercard, Amex | `****-****-****-4242` |
| `iban` | IBAN number | `FR76****...` |
| `french_ssn` | French social security number | `1 9*-**-***-***-**` |
| `password_plain` | Plaintext password | `********` |
| `phone_fr` | French phone number | `06 12 34 ****` |

## Known tracking domains

The scanner automatically detects images from 35+ known ESP domains, including: Mailchimp, SendGrid, HubSpot, Klaviyo, Brevo, Campaign Monitor, ConvertKit, etc.

Complementary detection:
- **1×1 pixels**: images with `width=1 height=1` or `display:none`
- **UTM parameters**: links containing `utm_source`, `utm_medium`, etc.
