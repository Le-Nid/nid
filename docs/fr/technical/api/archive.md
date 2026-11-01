# API — Archives

Toutes les routes `/:accountId/...` exigent le JWT et la propriété du compte Gmail (`403` sinon).

---

## Lister les mails archivés

### GET /api/archive/:accountId/mails

**Query params**

| Param | Description |
|---|---|
| `q` | Recherche full-text (PostgreSQL tsvector) |
| `sender` | Filtrer par expéditeur (ILIKE) |
| `from_date` | Date de début (ISO 8601) |
| `to_date` | Date de fin (ISO 8601) |
| `has_attachments` | Filtrer par présence de pièces jointes (`true` / `false`) |
| `label` | Id de libellé Gmail que le mail doit porter (ex. `INBOX`, `Label_12`) ; pour un compte IMAP, son dossier (`imported:<chemin>`, ex. `imported:INBOX`) |
| `tag` | Tag Nid que le mail doit porter (voir [Tags](#tags)) |
| `size_min` / `size_max` | Taille de l'EML en octets, bornes incluses |
| `attachment_type` | Une pièce jointe au moins de ce type : extension (`pdf`, `.docx`, insensible à la casse) ou type MIME (`application/pdf`, ou `image/` / `image/*` pour la famille) |
| `page` | Page (défaut : 1) |
| `limit` | Résultats par page (défaut : 50, max : 100) |

Avec `q`, les résultats sont triés par pertinence puis par date, et chaque mail porte un champ `highlight` (extrait HTML avec les termes trouvés en `<mark>`). Les mails à la corbeille sont exclus. `body_text`, `search_vector` et `eml_path` ne sont jamais renvoyés.

**Réponse**
```json
{
  "mails": [
    {
      "id": "uuid",
      "gmail_message_id": "abc123",
      "subject": "Facture mars 2024",
      "sender": "factures@exemple.com",
      "date": "2024-03-01T10:00:00Z",
      "size_bytes": 45678,
      "has_attachments": true,
      "label_ids": ["INBOX"],
      "archived_at": "2024-03-15T12:00:00Z"
    }
  ],
  "total": 4823,
  "page": 1,
  "limit": 50,
  "tookMs": 12
}
```

`total` : nombre total de résultats ; `tookMs` : durée de la recherche en millisecondes.

---

## Lire un mail archivé

### GET /api/archive/:accountId/mails/:mailId

Retourne les colonnes du mail (sauf `body_text` et `eml_path`), son corps décodé depuis l'EML (`html` et `text`, chaînes vides si le mail est chiffré ou illisible) et ses pièces jointes. `404` si le mail n'existe pas pour ce compte.

```json
{
  "id": "uuid",
  "subject": "...",
  "html": "<p>Corps du mail...</p>",
  "text": "Corps du mail...",
  "attachments": [
    {
      "id": "uuid",
      "filename": "facture.pdf",
      "mime_type": "application/pdf",
      "size_bytes": 123456,
      "file_path": "/archives/..."
    }
  ]
}
```

---

## Télécharger une pièce jointe archivée

### GET /api/archive/:accountId/attachments/:attachmentId/download

Retourne le fichier en téléchargement direct (`Content-Disposition: attachment`). `404` si la pièce jointe n'appartient pas à ce compte.

---

## Déclencher un archivage

### POST /api/archive/:accountId/archive

Lance un job d'archivage asynchrone.

**Body**
```json
{
  "messageIds": ["id1", "id2"],
  "differential": true
}
```

Ou via requête Gmail :

```json
{
  "query": "older_than:1y has:attachment",
  "differential": true
}
```

Avec une `query`, un job sauvegarde au plus `BULK_QUERY_MAX` nouveaux mails (les mails déjà archivés sont écartés avant). S'il s'arrête là, il met en file une suite différentielle (même compte, même requête) différée de `ARCHIVE_CONTINUE_DELAY_MIN` minutes (statut `scheduled`, annulable) et notifie « Sauvegarde partielle : N mails sauvegardés, la suite reprend automatiquement dans 15 min » (`data.capped`, `data.continuationJobId`). La chaîne s'arrête quand une exécution n'a rien sauvegardé de nouveau ou après `ARCHIVE_CHAIN_MAX` suites ; la notification invite alors à relancer la sauvegarde.

| Champ | Description |
|---|---|
| `messageIds` | Liste d'IDs Gmail à archiver (optionnel si `query` fourni) |
| `query` | Requête Gmail native — récupère tous les IDs correspondants |
| `differential` | Si `true` (défaut), skip les mails déjà archivés |

**Réponse 202**
```json
{ "jobId": "archive_mails-1234567890" }
```

---

## Export ZIP

### POST /api/archive/:accountId/export-zip

Exporte une sélection de mails archivés en fichier ZIP (streaming chunked).

**Body**
```json
{
  "mailIds": ["uuid-1", "uuid-2", "uuid-3"]
}
```

**Réponse 200** — Fichier ZIP en téléchargement (`Content-Type: application/zip`). `400` si `mailIds` est vide.

---

## Threads / Conversations

### Lister les conversations archivées

#### GET /api/archive/:accountId/threads

Retourne les mails archivés groupés par `thread_id` (conversation Gmail). Pour chaque thread, le mail le plus récent est retourné avec des métadonnées de résumé.

**Query params**

| Param | Description |
|---|---|
| `q` | Recherche full-text (PostgreSQL tsvector) |
| `sender` | Filtrer par expéditeur (ILIKE) |
| `from_date` | Date de début (ISO 8601) |
| `to_date` | Date de fin (ISO 8601) |
| `has_attachments` | Filtrer par présence de pièces jointes (`true` / `false`) |
| `page` | Page (défaut : 1) |
| `limit` | Résultats par page (défaut : 50, max : 100) |

**Réponse 200**
```json
{
  "threads": [
    {
      "thread_id": "gmail-thread-id",
      "message_count": 5,
      "latest_date": "2026-03-20T14:30:00Z",
      "senders": ["alice@example.com", "bob@example.com"],
      "total_size": 234567,
      "has_attachments": true,
      "id": "uuid-latest-mail",
      "subject": "Re: Projet Q1",
      "sender": "alice@example.com",
      "snippet": "OK, on valide le budget...",
      "date": "2026-03-20T14:30:00Z",
      "archived_at": "2026-03-21T08:00:00Z"
    }
  ],
  "total": 342,
  "page": 1,
  "limit": 50
}
```

::: tip Champs de résumé par thread
- `message_count` — Nombre de mails dans la conversation
- `senders` — Liste des expéditeurs uniques
- `total_size` — Taille cumulée de tous les mails du thread
- `latest_date` — Date du mail le plus récent
:::

---

### Lire une conversation complète

#### GET /api/archive/:accountId/threads/:threadId

Retourne tous les mails d'un thread, triés par date croissante (ordre chronologique), avec leurs pièces jointes.

**Réponse 200**
```json
[
  {
    "id": "uuid-mail-1",
    "gmail_message_id": "abc123",
    "thread_id": "gmail-thread-id",
    "subject": "Projet Q1",
    "sender": "bob@example.com",
    "recipient": "alice@example.com",
    "date": "2026-03-15T10:00:00Z",
    "size_bytes": 12345,
    "has_attachments": false,
    "in_reply_to": null,
    "references_header": null,
    "attachments": []
  },
  {
    "id": "uuid-mail-2",
    "gmail_message_id": "def456",
    "thread_id": "gmail-thread-id",
    "subject": "Re: Projet Q1",
    "sender": "alice@example.com",
    "date": "2026-03-20T14:30:00Z",
    "size_bytes": 45678,
    "has_attachments": true,
    "in_reply_to": "<abc123@mail.gmail.com>",
    "references_header": "<abc123@mail.gmail.com>",
    "attachments": [
      {
        "id": "uuid-att-1",
        "filename": "budget.xlsx",
        "mime_type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "size_bytes": 34567
      }
    ]
  }
]
```

---

## Restaurer dans la boîte mail

### POST /api/archive/:accountId/mails/restore-mailbox

Remet les mails archivés dans la boîte du compte : job `restore_gmail` pour un compte Gmail, `restore_imap` pour un compte IMAP. L'ancienne route `POST …/mails/restore-gmail` reste un alias (même comportement).

```json
{ "mailIds": ["uuid-1", "uuid-2"] }
```

`mailIds` : 1 à 500 UUID (mails hors corbeille d'archive). Réponse **202** `{ "jobId": "…" }`, audit `archive.restore_gmail` ou `archive.restore_imap`. **409** si le compte est désactivé ou à reconnecter. Le résultat du job (`imported` = restaurés, `skipped`, `errors`) arrive par notification.

**Gmail** — le job `restore_gmail` remet les mails archivés dans Gmail (`users.messages.insert`, `internalDateSource: dateHeader`, EML envoyé en `message/rfc822`). Scope OAuth existant (`gmail.modify`), aucune reconnexion nécessaire.

```json
{ "mailIds": ["uuid-1", "uuid-2"] }
```

Pour chaque mail : encore présent dans Gmail → ignoré ; dans la corbeille Gmail → `untrash` ; absent → inséré avec ses libellés (système et utilisateur actifs tels quels, utilisateur supprimé ou `imported:` recréé par nom, `TRASH`/`SPAM`/`DRAFT`/`CHAT` retirés), puis `gmail_message_id` de l'archive mis à jour. Archive chiffrée : erreur.

**IMAP** — le job `restore_imap` dépose l'EML par `APPEND` (marqué lu, date interne = date du mail) dans le dossier d'origine : le premier libellé du mail qui nomme un dossier encore présent sur le serveur (comparaison insensible à la casse, `Inbox` → `INBOX`), sinon `INBOX` ; un dossier devenu introuvable compte ses mails en erreur. Un mail dont le Message-ID est déjà dans ce dossier est ignoré (un job relancé ne crée pas de doublon ; la synchro suivante l'ignore aussi par Message-ID). Archive chiffrée ou `APPEND` refusé : erreur, les autres mails continuent. Mot de passe refusé par le serveur : le job échoue avec « Le serveur IMAP a refusé le mot de passe : reconnectez le compte… » et le compte passe « à reconnecter ».

---

## Contacts

### GET /api/archive/:accountId/contacts

Carnet d'adresses de l'archive, calculé à chaque appel depuis les en-têtes `From` et `To` (corbeille exclue, adresse du compte exclue), adresses en minuscules. Tri : nombre d'échanges décroissant, puis dernier échange.

| Param | Description |
|---|---|
| `q` | Filtre sur l'adresse ou le nom (ILIKE) |
| `page`, `limit` | Pagination (défaut 50, max 100) |

```json
{
  "contacts": [{ "email": "bob@x.fr", "name": "Martin, Bob", "from_count": 12, "to_count": 3, "last_at": "2026-08-01T07:00:00Z" }],
  "total": 1, "page": 1, "limit": 50
}
```

`from_count` : mails archivés dont il est l'expéditeur ; `to_count` : mails archivés dont il est destinataire (`To`). `name` : un des noms affichés vus pour cette adresse, `null` si aucun. Coût : environ 0,3 s par 100 000 mails archivés.

---

## Tags

Étiquettes propres à Nid, posées sur les mails archivés (colonne `tags`, renvoyée dans les listes et le détail). Gmail ne les voit jamais, et un nouvel archivage du même mail les conserve. Un tag fait 1 à 50 caractères, sans virgule.

### GET /api/archive/:accountId/tags

Tags du compte avec leur nombre de mails (corbeille exclue), par ordre alphabétique.

```json
[{ "tag": "impôts", "count": 12 }, { "tag": "énergie", "count": 3 }]
```

### POST /api/archive/:accountId/mails/tags

Ajoute et/ou retire des tags sur des mails archivés.

```json
{ "mailIds": ["uuid-1", "uuid-2"], "add": ["impôts"], "remove": ["à trier"] }
```

`mailIds` : 1 à 500 UUID ; `add` et `remove` : 20 tags au plus chacun. Réponse : `{ "updated": 2 }`.

### DELETE /api/archive/:accountId/tags/:tag

Retire le tag de tous les mails du compte, corbeille comprise ; les mails restent. Réponse : `{ "updated": 12 }`.

---

## Corbeille des archives

Les mails archivés supprimés passent d'abord par une corbeille (`deleted_at` renseigné) ; ils sont exclus des listes, threads et recherches, puis purgés après `retentionDays` jours si la purge automatique est active.

### POST /api/archive/:accountId/mails/trash

Met des mails archivés à la corbeille.

**Body**
```json
{ "mailIds": ["uuid-1", "uuid-2"] }
```

`mailIds` : 1 à 500 UUID.

**Réponse 200**
```json
{ "trashed": 2 }
```

### POST /api/archive/:accountId/mails/restore

Restaure des mails de la corbeille. Même body que `/mails/trash`.

**Réponse 200**
```json
{ "restored": 2 }
```

### GET /api/archive/:accountId/trash

Liste paginée de la corbeille, triée par date de suppression décroissante. Query : `q` (full-text), `page`, `limit` (défaut 50, max 100).

**Réponse 200**
```json
{ "mails": [ { "id": "uuid", "subject": "...", "deleted_at": "..." } ], "total": 12, "page": 1, "limit": 50, "retentionDays": 30 }
```

### DELETE /api/archive/:accountId/trash

Vide la corbeille : suppression définitive des mails (EML et pièces jointes).

**Réponse 200**
```json
{ "deleted": 12 }
```

### GET /api/archive/config/trash

Réglages de la corbeille (tout utilisateur authentifié).

**Réponse 200**
```json
{ "retentionDays": 30, "purgeEnabled": true }
```

### PUT /api/archive/config/trash

Modifie les réglages de la corbeille pour toute l'instance. **Admin uniquement.**

**Body** (champs optionnels)
```json
{ "retentionDays": 30, "purgeEnabled": true }
```

`retentionDays` : 1 à 365.

**Réponse 200**
```json
{ "ok": true }
```

---

## Utilisation dans le frontend

### Toggle Liste / Conversations

La page Archives dispose d'un sélecteur `Segmented` permettant de basculer entre :

- **Liste** — Mode par défaut, affichage tabulaire paginé (existant)
- **Conversations** — Groupement par thread Gmail

### Vue Conversations

- Chaque conversation est une carte affichant : badge nombre de messages, sujet, expéditeurs, taille totale, date du dernier message
- **Clic** sur une conversation → expansion inline avec la liste chronologique des mails
- Chaque mail du thread est cliquable pour ouvrir le viewer complet (Drawer avec HTML/EML)
- Indentation visuelle progressive pour refléter la profondeur de la conversation
- Pagination manuelle (précédent / suivant)

### Nouveaux champs archivés

L'archivage extrait désormais deux headers supplémentaires depuis les EML :

- `in_reply_to` — Header `In-Reply-To` (identifie le message parent)
- `references_header` — Header `References` (chaîne complète de la conversation)
