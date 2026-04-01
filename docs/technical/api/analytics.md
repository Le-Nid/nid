# API — Analytics (Intelligence & Analytics avancées)

---

## Heatmap d'activité email

### GET /api/analytics/:accountId/heatmap

Grille jour × heure indiquant quand l'utilisateur reçoit le plus de mails (style contributions GitHub). Analyse les 500 derniers messages.

**Query params**

| Param | Défaut | Description |
|---|---|---|
| `refresh` | - | `1` pour forcer le recalcul (sinon cache Redis 15 min + données DB) |

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
| `count` | integer | Nombre de mails reçus à ce créneau |

**Authentification** : JWT + ownership du compte Gmail

---

## Score d'encombrement par expéditeur

### GET /api/analytics/:accountId/sender-scores

Score combinant volume, taille, taux de lecture, et présence de `List-Unsubscribe`. Classement des expéditeurs "pollueurs" avec suggestion de nettoyage.

**Query params**

| Param | Défaut | Description |
|---|---|---|
| `refresh` | - | `1` pour forcer le recalcul |

**Réponse**
```json
[
  {
    "sender": "Newsletter Corp <news@corp.com>",
    "emailCount": 234,
    "totalSizeBytes": 45678901,
    "unreadCount": 180,
    "hasUnsubscribe": true,
    "readRate": 0.23,
    "clutterScore": 85
  }
]
```

| Champ | Type | Description |
|---|---|---|
| `sender` | string | Nom et email de l'expéditeur |
| `emailCount` | integer | Nombre total de mails |
| `totalSizeBytes` | integer | Taille totale en octets |
| `unreadCount` | integer | Nombre de mails non lus |
| `hasUnsubscribe` | boolean | Présence dans les promotions / newsletters |
| `readRate` | float | Taux de lecture (0.0 - 1.0) |
| `clutterScore` | integer | Score d'encombrement (0-100, 100 = très encombrant) |

**Calcul du score** :
- Volume (0-30 pts) : proportionnel au nombre de mails (cap à 50)
- Taille (0-25 pts) : proportionnel à la taille totale (cap à 50 Mo)
- Taux de lecture inversé (0-25 pts) : plus le taux est faible, plus le score est élevé
- Unsubscribe (0-20 pts) : bonus si l'expéditeur est une newsletter/promotion

**Authentification** : JWT + ownership du compte Gmail

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
| `type` | string | Type de suggestion : `bulk_unread`, `large_sender`, `old_newsletters`, `duplicate_pattern` |
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

Ignore une suggestion (ne sera plus affichée).

**Réponse**
```json
{ "ok": true }
```

**Authentification** : JWT

---

## Tracker Inbox Zero

### GET /api/analytics/:accountId/inbox-zero

Compteur temps réel + historique de la progression vers inbox zero. Streak, graphique d'évolution, gamification légère.

**Query params**

| Param | Défaut | Description |
|---|---|---|
| `refresh` | - | `1` pour forcer un nouveau snapshot |

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
| `history` | array | Historique des 30 derniers jours (min inbox_count par jour) |
| `streak` | integer | Jours consécutifs à inbox zero (0 mails dans INBOX) |
| `bestStreak` | integer | Meilleur streak historique |

### POST /api/analytics/:accountId/inbox-zero/snapshot

Enregistre manuellement un snapshot de l'état de l'inbox. Appelé automatiquement par le scheduler toutes les 6 heures.

**Réponse**
```json
{
  "inboxCount": 12,
  "unreadCount": 5
}
```

**Authentification** : JWT + ownership du compte Gmail

---

## Données techniques

### Tables PostgreSQL

| Table | Contenu |
|---|---|
| `email_activity_heatmap` | Cache agrégé jour×heure par compte Gmail |
| `sender_scores` | Score d'encombrement calculé par expéditeur |
| `cleanup_suggestions` | Suggestions de nettoyage (dismissable) |
| `inbox_zero_snapshots` | Historique des snapshots inbox (toutes les 6h) |

### Cache Redis

| Clé | TTL | Description |
|---|---|---|
| `analytics:heatmap:{accountId}` | 15 min | Données heatmap |
| `analytics:sender-scores:{accountId}` | 15 min | Scores expéditeurs |
| `analytics:cleanup:{accountId}` | 15 min | Suggestions de nettoyage |
| `analytics:inbox-zero:{accountId}` | 15 min | Données Inbox Zero |

### Scheduler

Le scheduler enregistre automatiquement un snapshot Inbox Zero toutes les 6 heures pour tous les comptes Gmail actifs.
