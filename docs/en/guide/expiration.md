# Email Expiration

The expiration feature lets you mark certain emails as **temporary** so they are automatically deleted after a defined period. This is particularly useful for emails that lose their value after a certain time.

## Temporary Email Types

| Category | Description | Default Duration |
|----------|-------------|:----------------:|
| **OTP Code** | Verification codes, 2FA, sign-in | 1 day |
| **Delivery** | Package tracking, shipping confirmations | 14 days |
| **Promotion** | Flash offers, promo codes, sales | 7 days |
| **Manual** | Any manually marked email | 7 days |

## Automatic Detection

Click **Detect automatically** to scan your recent emails. The application analyzes the subject and sender of each email to identify temporary emails using heuristics:

- **OTP Codes**: detection by keywords (verification, code, OTP, sign-in, security) and senders (noreply, security)
- **Deliveries**: detection by keywords (shipping, tracking, package, order) and known carriers (UPS, FedEx, DHL, Colissimo)
- **Promotions**: detection by keywords (promo, sale, discount, offer) and marketing senders

After detection, you can select which emails to mark as temporary and adjust the duration if needed.

## Manual Addition

You can also manually add an email to the expiration list:

1. Click **Add manually**
2. Enter the Gmail message ID
3. Choose the category
4. Set the number of days before expiration

## Dashboard

The page displays 4 statistics:

- **Pending**: marked emails that have not yet expired
- **Expiring soon**: emails expiring within the next 24 hours
- **Deleted**: emails already automatically deleted
- **Total**: total number of expirations created

## How It Works

The system checks expirations **every 15 minutes**. When an email reaches its expiration date, it is automatically sent to the Gmail trash (no permanent deletion, which leaves 30 days to recover).

## API

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/expiration/:accountId` | List expirations |
| `GET` | `/api/expiration/:accountId/stats` | Statistics |
| `POST` | `/api/expiration/:accountId` | Create an expiration |
| `POST` | `/api/expiration/:accountId/batch` | Batch create |
| `POST` | `/api/expiration/:accountId/detect` | Heuristic detection |
| `PATCH` | `/api/expiration/:accountId/:id` | Modify the date |
| `DELETE` | `/api/expiration/:accountId/:id` | Delete the expiration |
