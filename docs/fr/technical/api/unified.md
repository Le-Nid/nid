# API — Boîte unifiée

Affiche les mails de **tous les comptes Gmail** de l'utilisateur dans une seule timeline, triés par date décroissante.

Toutes les routes nécessitent `Authorization: Bearer <token>`.

---

## Messages unifiés

### GET /api/unified/messages

Récupère les messages récents de tous les comptes Gmail actifs de l'utilisateur, les fusionne et les trie par date.

**Query params**

| Param | Type | Description |
|---|---|---|
| `q` | string | Requête Gmail native (appliquée à tous les comptes) |
| `maxResults` | number | Nombre de résultats par compte (défaut : 20, max : 50) |

**Réponse 200**
```json
{
  "messages": [
    {
      "id": "abc123",
      "threadId": "def456",
      "subject": "Votre facture de mars",
      "from": "factures@exemple.com",
      "to": "vous@gmail.com",
      "date": "2026-03-01T10:00:00Z",
      "sizeEstimate": 45678,
      "snippet": "Retrouvez ci-joint votre facture...",
      "labelIds": ["INBOX", "UNREAD"],
      "hasAttachments": true,
      "accountId": "uuid-compte-1",
      "accountEmail": "perso@gmail.com"
    },
    {
      "id": "xyz789",
      "threadId": "uvw012",
      "subject": "Meeting demain",
      "from": "collegue@work.com",
      "date": "2026-03-01T09:30:00Z",
      "sizeEstimate": 2345,
      "snippet": "Salut, on se voit demain ?",
      "labelIds": ["INBOX"],
      "hasAttachments": false,
      "accountId": "uuid-compte-2",
      "accountEmail": "pro@gmail.com"
    }
  ],
  "accounts": [
    { "id": "uuid-compte-1", "email": "perso@gmail.com" },
    { "id": "uuid-compte-2", "email": "pro@gmail.com" }
  ]
}
```

::: info Champs supplémentaires
Chaque message porte deux champs supplémentaires par rapport à l'API Gmail standard :

- `accountId` — UUID du compte Gmail source
- `accountEmail` — Adresse email du compte source

Cela permet au frontend d'afficher un tag coloré par compte et de filtrer par compte.
:::

---

## Comportement

### Requêtes parallèles
Les messages sont récupérés depuis **tous les comptes actifs** en parallèle via `Promise.allSettled`. Si un compte échoue (token expiré, erreur réseau), les messages des autres comptes sont quand même retournés.

### Tri unifié
Les messages de tous les comptes sont fusionnés puis triés par **date décroissante** pour créer une timeline cohérente.

### Quota Gmail API
Chaque compte utilise son propre quota Gmail API. La vue unifiée fait `listMessages` + `batchGetMessages` par compte, en respectant le throttle par compte (5 requêtes concurrentes max, 1s entre batches).

---

## Utilisation dans le frontend

### Page Boîte unifiée (`/unified`)

- **Timeline** unifiée de tous les comptes, triée par date
- **Tag coloré** par compte (couleur stable par index)
- **Filtre par compte** via un sélecteur déroulant
- **Recherche Gmail** appliquée à tous les comptes simultanément
- **Lecture** d'un mail via le composant `MailViewer` existant (passe l'`accountId` du mail concerné)
- **Prérequis** : au moins 2 comptes Gmail connectés (sinon message informatif)

### Navigation

Accessible depuis le menu latéral : **Email → Boîte unifiée** (`/unified`).
