# Archive Sharing

The sharing feature lets you generate **temporary links** to share an archived email with someone who doesn't have an account on the application.

## Create a Share Link

From the **Sharing** page (Tools menu):

1. Click on an archived email
2. Choose the **validity period** (1 hour to 30 days)
3. Optionally, set a **maximum number of accesses**
4. The link is generated and can be copied to the clipboard

## Share Parameters

| Parameter | Description | Default Value |
|-----------|-------------|:-------------:|
| **Duration** | How long the link is valid | 24 hours |
| **Max accesses** | Number of times the link can be used | Unlimited |

## Security

- Links use a **64-character cryptographic token** (256 bits of entropy)
- Links expire automatically — cleanup runs every hour
- **Encrypted** emails cannot be shared
- Content is served in a **sandboxed iframe** (no script execution)
- Each access is tracked

## Link Management

The sharing page displays all your active links with:

- The subject and sender of the shared email
- The expiration date
- The access count

You can **revoke** a link at any time by clicking the delete icon.

## Public View

People who receive the link access a clean public page displaying:

- The subject, sender, and date of the email
- The HTML or text content of the email
- A "Mail shared via temporary link" badge

No authentication is required to view a valid link.

## API

| Method | Endpoint | Auth | Description |
|--------|----------|:----:|-------------|
| `GET` | `/api/shares` | Yes | List my shares |
| `POST` | `/api/shares` | Yes | Create a link |
| `DELETE` | `/api/shares/:id` | Yes | Revoke a link |
| `GET` | `/api/shares/public/:token` | No | Access the shared email |
