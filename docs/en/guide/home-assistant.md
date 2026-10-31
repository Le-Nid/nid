# Home Assistant

Nid and Home Assistant talk both ways:

- **Home Assistant reads Nid**: REST sensors poll `GET /api/summary` (accounts to reconnect, archived mails, storage, jobs, unread notifications) and `rest_command`s start an archive or a rule.
- **Nid alerts Home Assistant**: a *generic* webhook pushes events (Gmail account to reconnect, failed job, integrity alert) to a Home Assistant `webhook` trigger, without waiting for the next poll.

Both are independent: use either one alone.

---

## 1. Create the API tokens

In Nid, **Settings › Security › API tokens**:

| Token | Permissions | Used for |
|-------|-------------|----------|
| `Home Assistant` | **Read only** | the sensors (`/api/summary`) |
| `Home Assistant actions` *(optional)* | **Read and actions** | the `rest_command`s (archive, run a rule) |

Copy each token when it is created: it is shown only once. A token never grants admin rights and never reaches account security, administration, encryption, webhooks or share links. Revoke it in one click in the same card, which also shows when it was last used.

In Home Assistant's `secrets.yaml`, with the `Bearer ` prefix:

```yaml
nid_auth: "Bearer nid_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
nid_auth_write: "Bearer nid_yyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyy"
```

To check a token from a terminal:

```bash
curl -H "Authorization: Bearer nid_xxx…" https://nid.home.lan/api/summary
```

The answer also gives each Gmail account's `id`, needed by the `rest_command`s.

---

## 2. Sensors: Home Assistant reads Nid

`GET /api/summary` returns everything in one request, as plain numbers:

```json
{
  "accounts": [{ "id": "…", "email": "ana@gmail.com", "is_active": true, "needs_reauth": false,
                 "last_backup_at": "…", "archived_mails": 24106, "archived_bytes": 1830000000, "last_archived_at": "…" }],
  "needs_reauth": 0,
  "archived_mails": 24106,
  "archived_bytes": 1830000000,
  "storage_quota_bytes": 5368709120,
  "jobs": { "active": 0, "failed_24h": 0 },
  "unread_notifications": 3
}
```

In `configuration.yaml` (one request feeds every sensor):

```yaml
rest:
  - resource: https://nid.home.lan/api/summary
    headers:
      Authorization: !secret nid_auth
    scan_interval: 300          # every 5 minutes is plenty
    # verify_ssl: false         # only for a self-signed certificate
    binary_sensor:
      - name: "Nid account to reconnect"
        unique_id: nid_needs_reauth
        device_class: problem
        value_template: "{{ value_json.needs_reauth > 0 }}"
    sensor:
      - name: "Nid archived mails"
        unique_id: nid_archived_mails
        state_class: total
        value_template: "{{ value_json.archived_mails }}"
      - name: "Nid archive size"
        unique_id: nid_archived_size
        device_class: data_size
        unit_of_measurement: GB
        value_template: "{{ (value_json.archived_bytes / 1e9) | round(2) }}"
      - name: "Nid quota used"
        unique_id: nid_quota_used
        unit_of_measurement: "%"
        value_template: "{{ (100 * value_json.archived_bytes / value_json.storage_quota_bytes) | round(1) }}"
      - name: "Nid running jobs"
        unique_id: nid_jobs_active
        value_template: "{{ value_json.jobs.active }}"
      - name: "Nid failed jobs (24 h)"
        unique_id: nid_jobs_failed_24h
        value_template: "{{ value_json.jobs.failed_24h }}"
      - name: "Nid unread notifications"
        unique_id: nid_unread
        value_template: "{{ value_json.unread_notifications }}"
      - name: "Nid last backup"
        unique_id: nid_last_backup
        device_class: timestamp
        value_template: "{{ value_json.accounts[0].last_backup_at if value_json.accounts else none }}"
```

::: v-pre
With several Gmail accounts, `accounts[0]` is the first by address; copy the sensor with `accounts[1]`, and so on, or filter: `{{ (value_json.accounts | selectattr('email', 'eq', 'ana@gmail.com') | first).last_backup_at }}`.
:::

---

## 3. Actions: Home Assistant drives Nid

With the **Read and actions** token (`nid_auth_write`):

```yaml
rest_command:
  nid_archive:
    # Full differential archive of the account (only new mails are downloaded)
    url: "https://nid.home.lan/api/archive/{{ account_id }}/archive"
    method: post
    headers:
      Authorization: !secret nid_auth_write
    content_type: application/json
    payload: "{}"
  nid_run_rule:
    url: "https://nid.home.lan/api/rules/{{ account_id }}/{{ rule_id }}/run"
    method: post
    headers:
      Authorization: !secret nid_auth_write
    content_type: application/json
    payload: '{"delayMs": 0}'
```

Call from an automation or a script:

```yaml
- action: rest_command.nid_archive
  data:
    account_id: "3f1c2a7e-8a4b-4c1d-9e2f-0123456789ab"
```

A rule's `id` comes from `curl -H "Authorization: Bearer …" https://nid.home.lan/api/rules/<account_id>`.

---

## 4. Webhook: Nid alerts Home Assistant

### In Nid

1. Allow webhooks to the local network, in Nid's `.env`, then restart the container:

   ```bash
   WEBHOOK_ALLOW_PRIVATE_NETWORKS=true
   ```

   Without it, Nid refuses private addresses (`192.168.x.x`, `10.x.x.x`…), a guard against forged requests to the internal network.

2. **Settings › Notifications & webhooks › New webhook**:
   - **Type**: Generic (HMAC)
   - **URL**: `http://192.168.1.10:8123/api/webhook/nid-3b9f…` (Home Assistant's IP rather than `homeassistant.local`, which the container often cannot resolve; the suffix is a long random id of your choice)
   - **Events**: *Gmail account to reconnect*, and as you like *Task failed*, *Integrity alert*, *Task completed*…
   - **Send a test** makes a sample call; the list shows the HTTP status of the last call.

Body sent (JSON):

```json
{
  "event": "account.reauth_required",
  "timestamp": "2026-10-31T08:30:00.000Z",
  "data": { "category": "account_reauth", "title": "Compte Gmail à reconnecter",
            "body": "Google a refusé l'accès à ana@gmail.com : reconnectez-le dans Paramètres › Comptes Gmail." }
}
```

`account.reauth_required` is sent **once per incident** (not on every Gmail call that fails afterwards), and a failed job is reported only after its last attempt.

### In Home Assistant

```yaml
automation:
  - alias: "Nid — alert"
    triggers:
      - trigger: webhook
        webhook_id: "nid-3b9f…"          # the same id as in the URL
        allowed_methods: [POST]
        local_only: true
    actions:
      - action: persistent_notification.create
        data:
          title: "{{ trigger.json.data.title }}"
          message: "{{ trigger.json.data.body }}"
      - if:
          - condition: template
            value_template: "{{ trigger.json.event == 'account.reauth_required' }}"
        then:
          - action: notify.mobile_app_my_phone
            data:
              title: "Nid: {{ trigger.json.data.title }}"
              message: "{{ trigger.json.data.body }}"
```

Nid signs generic webhooks (`X-Webhook-Signature` header, HMAC with a secret Nid generates). Home Assistant cannot check this signature and ignores it: security comes from the random webhook id and `local_only: true`.

---

## Automation ideas

- **Sleeping NAS**: wake the NAS (Wake-on-LAN), call `rest_command.nid_archive`, wait for the `job.completed` webhook, then put the NAS back to sleep.
- **Off-peak hours or solar surplus**: run heavy rules (retention, full archive) when power is cheapest.
- **Coming home**: voice announcement if `binary_sensor.nid_account_to_reconnect` is `on`.
- **Dashboard**: an *Entities* card with the sensors above, the last backup and the quota.

---

## Troubleshooting

| Symptom | Likely cause |
|---------|--------------|
| `401` | Wrong, expired or revoked token, deactivated user, or `Bearer ` prefix missing from the secret |
| `403 Read-only API token` | A `rest_command` uses the read-only token |
| `403 Not available with an API token` | Session-only route (security, admin, encryption, webhooks, shares) |
| Sensors `unavailable` | URL or certificate: test with `curl`, `verify_ssl: false` for a self-signed certificate |
| Webhook never received | `WEBHOOK_ALLOW_PRIVATE_NETWORKS` missing, `homeassistant.local` not resolved (use the IP), event not ticked, or `local_only` while Nid is not on the same network |

See also: [API tokens](../technical/api/auth.md#api-tokens), [webhooks](../technical/api/webhooks.md), [notifications](notifications.md).
