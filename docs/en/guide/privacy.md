# Privacy

Nid can encrypt your archives. Remote images (and the tracking pixels they hide) are blocked by the mail reader until you show them.

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
