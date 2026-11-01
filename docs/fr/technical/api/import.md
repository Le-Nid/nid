# API — Import / Export mbox

Import de mails dans les archives Nid (fichier mbox, fichiers .eml ou serveur IMAP) et export des archives au format mbox.

Toutes les routes nécessitent JWT + propriété du compte Gmail `:accountId` (les mails importés sont rattachés à ce compte).

---

## Importer un fichier mbox

### POST /api/import/:accountId/mbox

Importe un fichier mbox (par exemple un export Google Takeout) dans les archives. Le fichier est uploadé en multipart (500 Mo max) puis traité par un job `import_mbox`.

**Content-Type :** `multipart/form-data`

**Body :** le fichier `.mbox` (premier champ fichier du formulaire, par ex. `file`).

**Réponse 202**
```json
{ "jobId": "import_mbox-<uuid>" }
```

**Erreurs** : `400` aucun fichier.

Le job s'exécute en arrière-plan. Suivez la progression via `/api/jobs/:jobId/events` (voir [jobs.md](jobs.md)).

---

## Importer des fichiers .eml

### POST /api/import/:accountId/eml

Archive tout de suite (sans job) un ou plusieurs fichiers `.eml`, par le même chemin que l'import mbox : EML et pièces jointes écrits sur le NAS, texte du corps indexé, doublon (même Message-ID sur ce compte) ignoré.

**Content-Type :** `multipart/form-data`, un champ fichier par `.eml` (par ex. `files`), 200 fichiers et 50 Mo par fichier au plus.

**Réponse 200**
```json
{ "imported": 2, "skipped": 1, "errors": 0 }
```

Un fichier qui ne commence pas par un en-tête (`Nom: valeur`, RFC 5322), tronqué (> 50 Mo) ou dont l'archivage échoue compte dans `errors` ; les autres fichiers continuent.

**Erreurs** : `400` aucun fichier.

---

## Importer depuis un serveur IMAP

### POST /api/import/:accountId/imap

Lance un job `import_imap`.

**Body**
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

**Réponse 202**
```json
{ "jobId": "import_imap-<uuid>" }
```

**Erreurs** : `400` `host`, `user` ou `pass` manquant.

::: info Identifiants
Le mot de passe IMAP est retiré du payload enregistré en base : un job `import_imap` ne peut pas être relancé par `POST /api/jobs/:jobId/retry` (`409`), il faut le relancer depuis sa page.
:::

---

## Exporter en mbox

### POST /api/import/:accountId/export-mbox

Exporte les archives du compte au format mbox.

**Body (optionnel)**
```json
{ "mailIds": ["uuid1", "uuid2"] }
```

Si `mailIds` est omis, tous les mails archivés du compte sont exportés.

**Réponse 200** : fichier `application/mbox` en téléchargement (streaming).

```
Content-Type: application/mbox
Content-Disposition: attachment; filename="archive-export-2026-03-20.mbox"
Transfer-Encoding: chunked
```
