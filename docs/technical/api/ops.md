# API Ops & Résilience

## Stockage (S3/MinIO)

### Préfixe : `/api/storage`

Toutes les routes nécessitent une authentification JWT.

---

### `GET /config`

Récupère la configuration de stockage de l'utilisateur.

**Réponse :**
```json
{
  "id": "uuid",
  "type": "s3",
  "s3_endpoint": "https://minio.local:9000",
  "s3_region": "us-east-1",
  "s3_bucket": "gmail-manager-archives",
  "s3_force_path_style": true,
  "created_at": "2026-03-01T10:00:00Z",
  "updated_at": "2026-03-15T14:30:00Z"
}
```

Si aucune configuration n'existe :
```json
{ "type": "local" }
```

---

### `PUT /config`

Sauvegarde la configuration de stockage.

**Body :**
```json
{
  "type": "s3",
  "s3Endpoint": "https://minio.local:9000",
  "s3Region": "us-east-1",
  "s3Bucket": "gmail-manager-archives",
  "s3AccessKeyId": "myaccesskey",
  "s3SecretAccessKey": "mysecretkey",
  "s3ForcePathStyle": true
}
```

| Champ | Type | Requis | Description |
|---|---|---|---|
| `type` | `"local"` \| `"s3"` | Oui | Type de stockage |
| `s3Endpoint` | string | Si S3 | URL du serveur S3 |
| `s3Region` | string | Non | Région (défaut : `us-east-1`) |
| `s3Bucket` | string | Non | Nom du bucket (défaut : `gmail-manager-archives`) |
| `s3AccessKeyId` | string | Si S3 | Access Key ID |
| `s3SecretAccessKey` | string | Si S3 | Secret Access Key |
| `s3ForcePathStyle` | boolean | Non | Path-style (défaut : `true`) |

**Réponse (200) :**
```json
{ "success": true }
```

---

### `POST /test-s3`

Teste la connexion S3 avec les identifiants fournis (écrit puis supprime un fichier de test).

**Body :**
```json
{
  "endpoint": "https://minio.local:9000",
  "region": "us-east-1",
  "bucket": "gmail-manager-archives",
  "accessKeyId": "myaccesskey",
  "secretAccessKey": "mysecretkey",
  "forcePathStyle": true
}
```

**Réponse (succès) :**
```json
{ "success": true }
```

**Réponse (échec) :**
```json
{ "success": false, "error": "The specified bucket does not exist" }
```

---

## Politiques de rétention

### Préfixe : `/api/retention`

Toutes les routes nécessitent une authentification JWT.

---

### `GET /`

Liste les politiques de rétention de l'utilisateur.

**Réponse :**
```json
[
  {
    "id": "uuid",
    "user_id": "uuid",
    "gmail_account_id": null,
    "name": "Archives > 2 ans",
    "label": null,
    "max_age_days": 730,
    "is_active": true,
    "last_run_at": "2026-03-20T02:00:00Z",
    "deleted_count": 142,
    "created_at": "2026-01-15T10:00:00Z",
    "updated_at": "2026-03-20T02:00:00Z"
  }
]
```

---

### `POST /`

Crée une nouvelle politique de rétention.

**Body :**
```json
{
  "name": "Newsletters > 6 mois",
  "gmailAccountId": "uuid",
  "label": "CATEGORY_PROMOTIONS",
  "maxAgeDays": 180
}
```

| Champ | Type | Requis | Description |
|---|---|---|---|
| `name` | string | Oui | Nom descriptif de la politique |
| `gmailAccountId` | string | Non | Cibler un compte spécifique (tous si omis) |
| `label` | string | Non | Cibler un label Gmail spécifique |
| `maxAgeDays` | number | Oui | Âge maximum en jours (>= 1) |

**Réponse (201) :** la politique créée.

---

### `PUT /:policyId`

Met à jour une politique de rétention.

**Body (partiel) :**
```json
{
  "name": "Newsletters > 3 mois",
  "maxAgeDays": 90,
  "isActive": false
}
```

**Réponse (200) :** la politique mise à jour.

---

### `DELETE /:policyId`

Supprime une politique de rétention.

**Réponse :** `204 No Content`

---

### `POST /run`

Exécute immédiatement toutes les politiques de rétention actives de l'utilisateur.

**Réponse :**
```json
{
  "policiesRun": 2,
  "totalDeleted": 47
}
```

---

## Quota Gmail API

### Préfixe : `/api/quota`

---

### `GET /:accountId`

Statistiques de consommation du quota Gmail API pour un compte.

**Auth :** JWT + ownership du compte.

**Réponse :**
```json
{
  "limits": {
    "perSecond": 250,
    "perMinute": 15000
  },
  "usage": {
    "lastMinute": {
      "units": 120,
      "calls": 24,
      "percentOfLimit": 1
    },
    "lastHour": {
      "units": 3450,
      "calls": 690
    },
    "last24h": {
      "units": 28700,
      "calls": 5740
    }
  },
  "topEndpoints": [
    { "endpoint": "messages.get", "units": 15000, "calls": 3000 },
    { "endpoint": "messages.list", "units": 8500, "calls": 1700 }
  ],
  "hourlyBreakdown": [
    { "hour": "2026-03-20T08:00:00Z", "units": 1200, "calls": 240 },
    { "hour": "2026-03-20T09:00:00Z", "units": 890, "calls": 178 }
  ]
}
```

---

### `POST /cleanup` *(admin uniquement)*

Supprime les données de suivi de quota de plus de 30 jours.

**Auth :** JWT + rôle admin.

**Réponse :**
```json
{ "deleted": 15420 }
```

---

## Import / Export

### Préfixe : `/api/import`

Toutes les routes nécessitent JWT + ownership du compte.

---

### `POST /:accountId/mbox`

Importe un fichier mbox dans les archives. Le fichier est uploadé en multipart.

**Content-Type :** `multipart/form-data`

**Body :** fichier `.mbox` en champ `file`.

**Réponse (202) :**
```json
{ "jobId": "import_mbox-1711891234567" }
```

Le job s'exécute en arrière-plan. Suivez la progression via la page Jobs ou SSE.

---

### `POST /:accountId/imap`

Lance un import depuis un serveur IMAP.

**Body :**
```json
{
  "host": "imap.outlook.com",
  "port": 993,
  "secure": true,
  "user": "user@outlook.com",
  "pass": "mot_de_passe_application",
  "folder": "INBOX",
  "maxMessages": 500
}
```

| Champ | Type | Requis | Description |
|---|---|---|---|
| `host` | string | Oui | Serveur IMAP |
| `port` | number | Non | Port (défaut : 993) |
| `secure` | boolean | Non | TLS (défaut : `true`) |
| `user` | string | Oui | Identifiant |
| `pass` | string | Oui | Mot de passe |
| `folder` | string | Non | Dossier IMAP (défaut : `INBOX`) |
| `maxMessages` | number | Non | Limite le nombre de mails importés |

**Réponse (202) :**
```json
{ "jobId": "import_imap-1711891234567" }
```

---

### `POST /:accountId/export-mbox`

Exporte les archives au format mbox.

**Body (optionnel) :**
```json
{ "mailIds": ["uuid1", "uuid2"] }
```

Si `mailIds` est omis, tous les mails archivés du compte sont exportés.

**Réponse :** fichier binaire `application/mbox` en téléchargement (chunked transfer encoding).

**Headers de réponse :**
```
Content-Type: application/mbox
Content-Disposition: attachment; filename="archive-export-2026-03-20.mbox"
Transfer-Encoding: chunked
```
