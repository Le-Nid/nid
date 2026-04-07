# Privacy

Nid includes tools to protect your privacy: tracking pixel detection, sensitive data scanner, and archive encryption.

---

## Tracking Pixel Detection

Many marketing emails contain **tracking pixels**: invisible images that notify the sender when you open the email.

### Scan Your Emails

1. Open the **Privacy** page in the sidebar
2. In the **Tracking pixels** tab, click **Scan**
3. A scan job is launched — it analyzes the HTML of your recent emails

> 📸 *Suggested screenshot: Tracking pixels tab with the Scan button and overall statistics*

### Results

After the scan, you can see:

- **Overall statistics**: number of emails containing trackers, total number of trackers detected
- **Per-email list**: each email with the number and type of trackers detected
- **Most frequent domains**: ranking of tracking domains (e.g., Mailchimp, SendGrid, HubSpot)

> 📸 *Suggested screenshot: scan results with the list of emails containing trackers and detected domains*

### Types of Trackers Detected

| Type | Description |
|---|---|
| **1×1 pixels** | Invisible images (1 pixel) loaded when the email is opened |
| **Known domains** | Over 35 identified email marketing domains (Mailchimp, SendGrid, HubSpot, Klaviyo, Brevo, etc.) |
| **UTM parameters** | Links containing tracking parameters (utm_source, utm_medium, utm_campaign) |

---

## Sensitive Data Scanner (PII)

The PII (Personally Identifiable Information) scanner analyzes your archived emails to detect sensitive data in plain text.

### Scan Your Archives

1. In the **Sensitive data** tab, click **Scan**
2. A scan job analyzes the EML files in your archives

> 📸 *Suggested screenshot: Sensitive data tab with the Scan button*

### Types of Data Detected

| Type | Example |
|---|---|
| **Credit card** | Visa, Mastercard, Amex (with separators) |
| **IBAN** | International bank account number |
| **Social security number** | French social security number |
| **Plaintext password** | Text containing "password:", "pwd=", etc. |
| **Phone number** | French number (+33, 06, 07...) |

> 📸 *Suggested screenshot: PII scan results with data type, number of affected emails, and a masked snippet*

::: info Masked data
Excerpts shown in the results are automatically masked (e.g., `****-****-****-4242`) to avoid exposing actual data in the interface.
:::

---

## Archive Encryption

Your EML archives can be encrypted on the NAS using **AES-256-GCM** encryption (the same standard used by banks and governments).

### Configure Encryption

1. In the **Encryption** tab, click **Configure**
2. Choose a **passphrase**
3. Confirm the passphrase
4. Click **Enable encryption**

> 📸 *Suggested screenshot: encryption configuration form with the passphrase field*

::: warning Keep your passphrase safe
The passphrase is **never stored** in the application — only a verification hash is kept. If you lose it, it will be impossible to decrypt your archives. Write it down in a safe place (password manager, etc.).
:::

### Encrypt Existing Archives

After configuring the passphrase:

1. Click **Encrypt archives**
2. An encryption job is launched
3. Each EML file is individually encrypted on disk

Already encrypted emails are automatically skipped (idempotent).

### Read an Encrypted Email

When you view an encrypted email on the Archives page, it is **decrypted on the fly** in server memory. The file remains encrypted on disk at all times.

### Encryption Status

The Encryption tab displays:

- Whether a passphrase is configured
- The number of encrypted / unencrypted emails
- An overall security indicator

> 📸 *Suggested screenshot: encryption status with the number of encrypted emails and percentage*
