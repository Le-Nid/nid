# Home Assistant

Nid et Home Assistant se parlent dans les deux sens :

- **Home Assistant lit Nid** : des capteurs REST interrogent `GET /api/summary` (comptes à reconnecter, mails archivés, stockage, jobs, notifications non lues) et des `rest_command` lancent un archivage ou une règle.
- **Nid prévient Home Assistant** : un webhook *générique* pousse les événements (compte Gmail à reconnecter, job en échec, alerte d'intégrité) vers un déclencheur `webhook` de Home Assistant, sans attendre le prochain relevé.

Les deux sont indépendants : on peut n'utiliser que l'un ou l'autre.

---

## 1. Créer les jetons d'API

Dans Nid, **Paramètres › Sécurité › Jetons d'API** :

| Jeton | Droits | Sert à |
|-------|--------|--------|
| `Home Assistant` | **Lecture seule** | les capteurs (`/api/summary`) |
| `Home Assistant actions` *(optionnel)* | **Lecture et actions** | les `rest_command` (archiver, lancer une règle) |

Copiez chaque jeton à sa création : il n'est affiché qu'une fois. Un jeton ne donne jamais les droits admin et n'accède ni à la sécurité du compte, ni à l'administration, ni au chiffrement, ni aux webhooks, ni aux liens de partage. Il se révoque d'un clic dans la même carte, qui indique aussi sa dernière utilisation.

Dans `secrets.yaml` de Home Assistant, avec le préfixe `Bearer ` :

```yaml
nid_auth: "Bearer nid_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
nid_auth_write: "Bearer nid_yyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyy"
```

Pour vérifier un jeton depuis un terminal :

```bash
curl -H "Authorization: Bearer nid_xxx…" https://nid.maison.lan/api/summary
```

La réponse donne aussi l'`id` de chaque compte Gmail, utile pour les `rest_command`.

---

## 2. Capteurs : Home Assistant lit Nid

`GET /api/summary` renvoie tout en une seule requête, en nombres simples :

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

Dans `configuration.yaml` (une seule requête alimente tous les capteurs) :

```yaml
rest:
  - resource: https://nid.maison.lan/api/summary
    headers:
      Authorization: !secret nid_auth
    scan_interval: 300          # toutes les 5 minutes suffisent
    # verify_ssl: false         # seulement pour un certificat auto-signé
    binary_sensor:
      - name: "Nid compte à reconnecter"
        unique_id: nid_needs_reauth
        device_class: problem
        value_template: "{{ value_json.needs_reauth > 0 }}"
    sensor:
      - name: "Nid mails archivés"
        unique_id: nid_archived_mails
        state_class: total
        value_template: "{{ value_json.archived_mails }}"
      - name: "Nid stockage archives"
        unique_id: nid_archived_size
        device_class: data_size
        unit_of_measurement: GB
        value_template: "{{ (value_json.archived_bytes / 1e9) | round(2) }}"
      - name: "Nid quota utilisé"
        unique_id: nid_quota_used
        unit_of_measurement: "%"
        value_template: "{{ (100 * value_json.archived_bytes / value_json.storage_quota_bytes) | round(1) }}"
      - name: "Nid jobs en cours"
        unique_id: nid_jobs_active
        value_template: "{{ value_json.jobs.active }}"
      - name: "Nid jobs en échec (24 h)"
        unique_id: nid_jobs_failed_24h
        value_template: "{{ value_json.jobs.failed_24h }}"
      - name: "Nid notifications non lues"
        unique_id: nid_unread
        value_template: "{{ value_json.unread_notifications }}"
      - name: "Nid dernière sauvegarde"
        unique_id: nid_last_backup
        device_class: timestamp
        value_template: "{{ value_json.accounts[0].last_backup_at if value_json.accounts else none }}"
```

::: v-pre
Avec plusieurs comptes Gmail, `accounts[0]` est le premier par ordre alphabétique d'adresse ; dupliquez le capteur avec `accounts[1]`, etc., ou filtrez : `{{ (value_json.accounts | selectattr('email', 'eq', 'ana@gmail.com') | first).last_backup_at }}`.
:::

---

## 3. Actions : Home Assistant pilote Nid

Avec le jeton **Lecture et actions** (`nid_auth_write`) :

```yaml
rest_command:
  nid_archive:
    # Archivage différentiel complet du compte (seuls les nouveaux mails sont téléchargés)
    url: "https://nid.maison.lan/api/archive/{{ account_id }}/archive"
    method: post
    headers:
      Authorization: !secret nid_auth_write
    content_type: application/json
    payload: "{}"
  nid_run_rule:
    url: "https://nid.maison.lan/api/rules/{{ account_id }}/{{ rule_id }}/run"
    method: post
    headers:
      Authorization: !secret nid_auth_write
    content_type: application/json
    payload: '{"delayMs": 0}'
```

Appel depuis une automatisation ou un script :

```yaml
- action: rest_command.nid_archive
  data:
    account_id: "3f1c2a7e-8a4b-4c1d-9e2f-0123456789ab"
```

L'`id` d'une règle se lit avec `curl -H "Authorization: Bearer …" https://nid.maison.lan/api/rules/<account_id>`.

---

## 4. Webhook : Nid prévient Home Assistant

### Côté Nid

1. Autoriser les webhooks vers le réseau local, dans le `.env` de Nid puis redémarrer le conteneur :

   ```bash
   WEBHOOK_ALLOW_PRIVATE_NETWORKS=true
   ```

   Sans cela, Nid refuse les adresses privées (`192.168.x.x`, `10.x.x.x`…), une protection contre les requêtes forgées vers le réseau interne.

2. **Paramètres › Notifications & webhooks › Nouveau webhook** :
   - **Type** : Générique (HMAC)
   - **URL** : `http://192.168.1.10:8123/api/webhook/nid-3b9f…` (l'IP de Home Assistant plutôt que `homeassistant.local`, que le conteneur ne résout souvent pas ; le suffixe est un identifiant long et aléatoire de votre choix)
   - **Événements** : *Compte Gmail à reconnecter*, et au choix *Tâche en échec*, *Alerte d'intégrité*, *Tâche terminée*…
   - **Envoyer un test** fait un appel d'essai ; la liste affiche le code HTTP du dernier envoi.

Corps envoyé (JSON) :

```json
{
  "event": "account.reauth_required",
  "timestamp": "2026-10-31T08:30:00.000Z",
  "data": { "category": "account_reauth", "title": "Compte Gmail à reconnecter",
            "body": "Google a refusé l'accès à ana@gmail.com : reconnectez-le dans Paramètres › Comptes Gmail." }
}
```

`account.reauth_required` n'est envoyé **qu'une fois par incident** (pas à chaque appel Gmail qui échoue ensuite), et un job en échec n'est signalé qu'après sa dernière tentative.

### Côté Home Assistant

```yaml
automation:
  - alias: "Nid — alerte"
    triggers:
      - trigger: webhook
        webhook_id: "nid-3b9f…"          # le même identifiant que dans l'URL
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
          - action: notify.mobile_app_mon_telephone
            data:
              title: "Nid : {{ trigger.json.data.title }}"
              message: "{{ trigger.json.data.body }}"
```

Nid signe les webhooks génériques (en-tête `X-Webhook-Signature`, HMAC avec un secret généré par Nid). Home Assistant ne sait pas vérifier cette signature et l'ignore : la sécurité repose sur l'identifiant aléatoire du webhook et sur `local_only: true`.

---

## Idées d'automatisations

- **NAS en veille** : réveiller le NAS (Wake-on-LAN), lancer `rest_command.nid_archive`, attendre le webhook `job.completed`, puis remettre le NAS en veille.
- **Heures creuses ou surplus solaire** : lancer les règles lourdes (rétention, archivage complet) quand l'électricité est la moins chère.
- **Retour à la maison** : annonce vocale si `binary_sensor.nid_compte_a_reconnecter` est `on`.
- **Tableau de bord** : une carte *Entities* avec les capteurs ci-dessus, la dernière sauvegarde et le quota.

---

## Dépannage

| Symptôme | Cause probable |
|----------|----------------|
| `401` | Jeton faux, expiré ou révoqué, utilisateur désactivé, ou préfixe `Bearer ` absent du secret |
| `403 Read-only API token` | Une `rest_command` utilise le jeton en lecture seule |
| `403 Not available with an API token` | Route réservée à la session (sécurité, admin, chiffrement, webhooks, partages) |
| Capteurs `unavailable` | URL ou certificat : tester avec `curl`, `verify_ssl: false` pour un certificat auto-signé |
| Webhook jamais reçu | `WEBHOOK_ALLOW_PRIVATE_NETWORKS` absent, `homeassistant.local` non résolu (mettre l'IP), événement non coché, ou `local_only` alors que Nid n'est pas sur le même réseau |

Voir aussi : [jetons d'API](../technical/api/auth.md#jetons-d-api), [webhooks](../technical/api/webhooks.md), [notifications](notifications.md).
