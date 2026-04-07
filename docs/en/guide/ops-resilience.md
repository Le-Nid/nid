# Ops & Resilience

Nid provides operations and resilience tools to manage storage, archive retention, Gmail API quota tracking, and mail import/export.

---

## Accessing the Page

In the sidebar, open the **System** group and click **Ops & Resilience**.

The page is organized into 4 tabs:

| Tab | Feature |
|---|---|
| **S3 Storage** | Remote storage configuration (S3, MinIO, Backblaze B2) |
| **Retention** | Automatic deletion policies for old archives |
| **API Quota** | Real-time tracking of Gmail API quota usage |
| **Import / Export** | Mbox and IMAP import, mbox export |

---

## Remote Storage (S3 / MinIO)

By default, Nid stores EML archives on the local file system (NAS). You can configure S3-compatible storage to:

- **Geo-replicate** your archives to a remote cloud
- Use services such as **AWS S3**, **MinIO**, **Backblaze B2**, **Wasabi**, etc.
- Separate storage from the application

### Configure S3 Storage

1. In the **S3 Storage** tab, select the **S3-compatible** type
2. Fill in the connection details:
   - **Endpoint**: URL of your S3 server (e.g., `https://s3.amazonaws.com` or `https://minio.local:9000`)
   - **Region**: S3 region (e.g., `us-east-1`, `eu-west-1`)
   - **Bucket**: storage bucket name
   - **Access Key ID** and **Secret Access Key**: access credentials
   - **Path-style**: enable for MinIO (disable for AWS S3)
3. Click **Test Connection** to verify that the credentials are correct
4. Click **Save**

> 📸 *Suggested screenshot: S3 configuration form with endpoint, region, bucket fields and test/save buttons*

::: tip Global vs. per-user configuration
S3 storage can be configured in two ways:

- **Globally** via environment variables (`S3_ENDPOINT`, `S3_ACCESS_KEY_ID`, etc.) — all users share the same storage
- **Per user** via the interface — each user can configure their own S3 storage

Per-user configuration takes priority over the global configuration.
:::

::: info MinIO
To use MinIO (self-hosted), enable **Path-style** and point the endpoint to your MinIO instance (e.g., `http://minio:9000`).
:::

### Revert to Local Storage

Select the **Local (NAS / disk)** type and save.

---

## Retention Policies

Retention policies automatically delete archives older than a configurable duration. This allows you to:

- Free up disk space
- Comply with data retention policies
- Automatically clean up old archives

### Create a Policy

1. In the **Retention** tab, click **New Policy**
2. Fill in:
   - **Name**: descriptive name (e.g., "Archives > 2 years")
   - **Account**: optional — to target a specific Gmail account, or all
   - **Label**: optional — to target only emails with a particular label
   - **Retention days**: maximum duration in days (e.g., 365 for 1 year, 730 for 2 years)
3. Click **Create**

> 📸 *Suggested screenshot: retention policy creation form*

### Manage Policies

- **Enable / Disable**: use the switch to enable or disable a policy without deleting it
- **Delete**: permanently deletes the policy
- **Run Now**: manually triggers the application of all active policies

The table displays for each policy:

| Column | Description |
|---|---|
| Name | Policy name |
| Account | Targeted Gmail account (or "All") |
| Label | Targeted Gmail label (or "—") |
| Max Duration | Maximum age of archives |
| Deleted | Total number of archives deleted since creation |
| Last Run | Date of the last application |
| Active | Policy status |

::: warning Irreversible Deletion
Archives deleted by a retention policy are permanently erased (EML file + database entry). This action is irreversible.
:::

---

## Gmail API Quota Dashboard

Google imposes a quota of **250 units per user per second** on the Gmail API. Each call consumes a variable number of units (e.g., `messages.get` = 5 units, `messages.send` = 100 units).

The quota dashboard allows you to:

- **Monitor** your usage in real time
- **Identify** the most resource-consuming endpoints
- **Anticipate** quota overruns

### Reading the Dashboard

The **API Quota** tab displays:

| Block | Description |
|---|---|
| **Last minute** | Units consumed + percentage of the limit (colored progress bar) |
| **Last hour** | Total units and requests over the past hour |
| **Last 24 hours** | Total units and requests over the past day |
| **Top endpoints** | Ranking of the most resource-consuming endpoints (24h) |
| **Hourly history** | Detailed hour-by-hour table (24h) |

> 📸 *Suggested screenshot: quota dashboard with the 3 statistics at the top, the endpoints table in the middle, and the hourly history at the bottom*

::: info Automatic Refresh
Quota data is automatically refreshed **every 30 seconds**.
:::

### Gmail API Endpoint Costs

| Endpoint | Units |
|---|---|
| `messages.get` | 5 |
| `messages.list` | 5 |
| `messages.send` | 100 |
| `messages.modify` | 5 |
| `messages.trash` | 5 |
| `messages.delete` | 10 |
| `messages.batchModify` | 50 |
| `messages.batchDelete` | 50 |
| `labels.list` / `labels.get` | 1 |

---

## Mail Import

Nid lets you import emails from external sources into your archives.

### Mbox Import

The **mbox** format is a standard used by Google Takeout, Thunderbird, Apple Mail, and other email clients. It groups multiple emails into a single file.

1. In the **Import / Export** tab, **Mbox Import** section, drop your `.mbox` file
2. An import job is created — track its progress on the **Jobs** page
3. Each email from the mbox file is converted to an individual EML and added to your archives

The process:

- Parses each message from the mbox file
- Extracts metadata (subject, sender, date, attachments)
- Checks for duplicates (skips if the Message-ID already exists)
- Stores the EML file + attachments separately
- Indexes the email in PostgreSQL (full-text search)

> 📸 *Suggested screenshot: drag & drop zone for the mbox file*

::: tip Google Takeout
To export your emails from Gmail:

1. Go to [takeout.google.com](https://takeout.google.com)
2. Select only **Gmail**
3. Choose the **mbox** format
4. Download the archive and import the `.mbox` file into Nid
:::

### IMAP Import

Import emails directly from an IMAP server (Outlook, ProtonMail, Yahoo, etc.):

1. In the **IMAP Import** section, fill in:
   - **IMAP Server**: server address (e.g., `imap.outlook.com`)
   - **Port**: server port (default: 993)
   - **Username**: your email login
   - **Password**: your password or app-specific password
   - **Folder**: IMAP folder to import (default: `INBOX`)
   - **Max messages**: optional — limit the number of imported emails
   - **Secure connection**: TLS enabled by default
2. Click **Start Import**
3. A job is created — track its progress on the **Jobs** page

> 📸 *Suggested screenshot: IMAP import form with server, port, username, and password fields*

::: warning App-specific Password
Many providers (Google, Outlook, Yahoo) require a specific **app password** rather than your regular password. Check your email provider's documentation.
:::

::: info Common IMAP Servers
| Provider | Server | Port |
|---|---|---|
| Outlook / Hotmail | `imap-mail.outlook.com` | 993 |
| Yahoo | `imap.mail.yahoo.com` | 993 |
| ProtonMail (Bridge) | `127.0.0.1` | 1143 |
| OVH | `ssl0.ovh.net` | 993 |
| Free | `imap.free.fr` | 993 |
:::

---

## Mbox Export

Export your archives in mbox format, compatible with most email clients:

1. In the **Mbox Export** section, click **Export as .mbox**
2. The file is generated and downloaded automatically

The mbox file contains all your archived emails for the selected account, in standard RFC 4155 format.

::: tip Re-importing
The exported mbox file can be imported into Thunderbird, Apple Mail, or any other compatible application. This is a good way to back up your archives in a universal format.
:::
