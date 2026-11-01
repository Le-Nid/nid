# API — Analytics (Intelligence & Analytics avancées)

---

## Heatmap d'activité email

### GET /api/analytics/:accountId/heatmap

Grille jour × heure indiquant quand arrivent les mails, calculée à chaque appel depuis **toutes les archives** du compte (corbeille Nid exclue), Gmail comme IMAP, sans appel Gmail. Affichée dans la Vue d'ensemble (« Quand arrivent vos mails »).

**Query params**

| Param | Défaut | Description |
|---|---|---|
| `tz` | `UTC` | Fuseau IANA dans lequel compter jours et heures (`Europe/Paris`) ; le frontend envoie celui du navigateur. Fuseau inconnu : 400 |

**Réponse**
```json
[
  { "day": 0, "hour": 9, "count": 42 },
  { "day": 0, "hour": 10, "count": 38 },
  { "day": 1, "hour": 14, "count": 25 }
]
```

| Champ | Type | Description |
|---|---|---|
| `day` | integer | Jour de la semaine (0=lundi, 6=dimanche) |
| `hour` | integer | Heure de la journée (0-23) |
| `count` | integer | Nombre de mails archivés reçus à ce créneau |

Seuls les créneaux non vides sont renvoyés.

**Authentification** : JWT + ownership du compte

---

## Score d'encombrement par expéditeur

Calcul interne (pas d'endpoint) qui alimente les suggestions de nettoyage ci-dessous : volume, taille, taux de lecture et présence de `List-Unsubscribe`, sur les 500 derniers mails Gmail, mis en cache 15 min.

**Calcul du score** :
- Volume (0-30 pts) : proportionnel au nombre de mails (cap à 50)
- Taille (0-25 pts) : proportionnel à la taille totale (cap à 50 Mo)
- Taux de lecture inversé (0-25 pts) : plus le taux est faible, plus le score est élevé
- Unsubscribe (0-20 pts) : bonus si l'expéditeur est une newsletter/promotion

---

## Suggestions de nettoyage intelligent

### GET /api/analytics/:accountId/cleanup-suggestions

Heuristiques basées sur les données analysées pour proposer des actions de nettoyage concrètes.

**Query params**

| Param | Défaut | Description |
|---|---|---|
| `refresh` | - | `1` pour forcer le recalcul |

**Réponse**
```json
[
  {
    "id": "uuid",
    "type": "bulk_unread",
    "title": "847 emails non lus de GitHub",
    "description": "Vous avez 847 emails non lus de cet expéditeur. Volume total : 1.2 Go.",
    "sender": "notifications@github.com",
    "emailCount": 847,
    "totalSizeBytes": 1288490188,
    "query": "from:(notifications@github.com) is:unread",
    "isDismissed": false
  }
]
```

| Champ | Type | Description |
|---|---|---|
| `type` | string | Type de suggestion : `bulk_unread`, `large_sender`, `old_newsletters` |
| `title` | string | Titre court de la suggestion |
| `description` | string | Description détaillée avec chiffres |
| `sender` | string | Expéditeur concerné (si applicable) |
| `emailCount` | integer | Nombre de mails concernés |
| `totalSizeBytes` | integer | Taille totale des mails concernés |
| `query` | string | Requête Gmail pour filtrer ces mails |
| `isDismissed` | boolean | Si la suggestion a été ignorée |

**Types de suggestions** :
- **bulk_unread** : ≥ 20 mails non lus d'un même expéditeur
- **large_sender** : Expéditeur occupant > 10 Mo avec un score d'encombrement ≥ 40
- **old_newsletters** : Newsletter avec < 30% de taux de lecture et ≥ 5 mails

### PATCH /api/analytics/suggestions/:suggestionId/dismiss

Ignore une suggestion (ne sera plus affichée). `404` si elle n'existe pas ou n'appartient pas à un compte de l'utilisateur.

**Réponse**
```json
{ "ok": true }
```

**Authentification** : JWT

---

## Tracker Inbox Zero

### GET /api/analytics/:accountId/inbox-zero

Taille de la boîte de réception Gmail maintenant et sur 30 jours, et les jours consécutifs à zéro. Affiché dans la Vue d'ensemble (comptes Gmail). Le scheduler enregistre un snapshot toutes les 6 heures (2 appels Gmail de liste) ; sans snapshot encore, cet appel en enregistre un.

**Réponse**
```json
{
  "current": {
    "inboxCount": 12,
    "unreadCount": 5
  },
  "history": [
    { "date": "2026-03-01", "inboxCount": 45, "unreadCount": 20 },
    { "date": "2026-03-02", "inboxCount": 30, "unreadCount": 12 },
    { "date": "2026-03-03", "inboxCount": 0, "unreadCount": 0 }
  ],
  "streak": 3,
  "bestStreak": 7
}
```

| Champ | Type | Description |
|---|---|---|
| `current` | object | État actuel de l'inbox |
| `history` | array | Historique des 30 derniers jours (inbox_count le plus bas du jour, `YYYY-MM-DD` UTC) |
| `streak` | integer | Jours consécutifs à inbox zero (0 mails dans INBOX) |
| `bestStreak` | integer | Meilleur streak historique |

**Authentification** : JWT + ownership du compte Gmail

---

## Données techniques

### Tables PostgreSQL

| Table | Contenu |
|---|---|
| `sender_scores` | Score d'encombrement calculé par expéditeur |
| `cleanup_suggestions` | Suggestions de nettoyage (dismissable) |
| `inbox_zero_snapshots` | Historique des snapshots inbox (toutes les 6h) |

### Cache Redis

| Clé | TTL | Description |
|---|---|---|
| `analytics:cleanup:{accountId}` | 15 min | Suggestions de nettoyage |
| `analytics:inbox-zero:{accountId}` | 15 min | Données Inbox Zero |

### Scheduler

Le scheduler enregistre automatiquement un snapshot Inbox Zero toutes les 6 heures pour tous les comptes Gmail actifs.
