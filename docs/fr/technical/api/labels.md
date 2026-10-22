# API — Libellés

Libellés Gmail synchronisés par compte dans la table `gmail_labels` (noms, couleurs Gmail, type), pour que les archives affichent toujours le nom d'un libellé supprimé dans Gmail.

Toutes les routes exigent l'authentification et la propriété du compte Gmail. `:accountId` doit être un UUID (`400` sinon).

**Quand les libellés sont synchronisés**

- à la connexion d'un compte Gmail (callback OAuth, en arrière-plan) ;
- une fois par jour par le planificateur (un appel `labels.list` par compte actif) ;
- à la demande avec `POST /api/labels/:accountId/sync` ;
- à la création, modification ou suppression d'un libellé via `/api/gmail/:accountId/labels`.

Un libellé absent de Gmail n'est jamais supprimé de la table : son `deleted_at` est renseigné, puis remis à `null` s'il réapparaît.

---

## Lister les libellés

### GET /api/labels/:accountId

Renvoie tous les libellés du compte, supprimés compris, triés par nom, avec le nombre de mails archivés (hors corbeille des archives) qui les portent.

**Réponse 200**
```json
[
  {
    "gmail_account_id": "uuid",
    "id": "Label_12",
    "name": "Factures",
    "color_bg": "#16a765",
    "color_text": "#ffffff",
    "type": "user",
    "messages_total": null,
    "deleted_at": null,
    "updated_at": "2026-10-21T08:00:00Z",
    "archived_count": 42
  }
]
```

| Champ | Description |
|---|---|
| `id` | Id du libellé Gmail (`INBOX`, `CATEGORY_PROMOTIONS`, `Label_12`…), ou `imported:<nom>` pour un libellé connu uniquement par un import mbox |
| `type` | `system`, `user`, `category` (`CATEGORY_*` de Gmail), `imported` (nom `X-Gmail-Labels` d'un Takeout inconnu de Gmail) |
| `color_bg` / `color_text` | Couleurs Gmail, `null` si le libellé n'en a pas |
| `deleted_at` | Renseigné quand le libellé a disparu de Gmail |
| `archived_count` | Mails archivés dont `label_ids` contient cet id |

---

## Synchroniser maintenant

### POST /api/labels/:accountId/sync

Récupère les libellés depuis Gmail et met la table à jour.

**Réponse 200**
```json
{ "synced": 18 }
```
