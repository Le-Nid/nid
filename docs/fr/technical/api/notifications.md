# API — Notifications

Système de notifications in-app pour informer l'utilisateur des événements (rapports, jobs, etc.).

---

## Lister les notifications

### GET /api/notifications 🔒

Retourne les notifications de l'utilisateur authentifié, paginées.

**Query params**

| Param | Défaut | Description |
|---|---|---|
| `page` | `1` | Numéro de page |
| `limit` | `20` | Résultats par page |
| `unread_only` | — | `1` ou `true` pour n'afficher que les non lues |

**Réponse 200**
```json
{
  "notifications": [
    {
      "id": "uuid",
      "user_id": "uuid",
      "type": "weekly_report",
      "title": "Rapport hebdomadaire",
      "body": "142 mails reçus, 38 archivés cette semaine",
      "data": { "period": "2026-W13" },
      "is_read": false,
      "created_at": "2026-03-30T08:00:00Z"
    }
  ],
  "unreadCount": 3,
  "page": 1,
  "limit": 20
}
```

---

## Marquer comme lue

### PATCH /api/notifications/:notificationId/read 🔒

Marque une notification comme lue.

**Réponse 200**
```json
{ "success": true }
```

---

## Marquer toutes comme lues

### POST /api/notifications/read-all 🔒

Marque toutes les notifications de l'utilisateur comme lues.

**Réponse 200**
```json
{ "updated": 5 }
```

---

## Supprimer une notification

### DELETE /api/notifications/:notificationId 🔒

Supprime une notification de l'utilisateur.

**Réponse 200**
```json
{ "ok": true }
```

---

## Supprimer toutes les notifications lues

### DELETE /api/notifications 🔒

Supprime toutes les notifications **déjà lues** de l'utilisateur. Les notifications non lues sont conservées.

**Réponse 200**
```json
{ "ok": true }
```

---

## Accès dans l'interface

Les notifications sont accessibles via l'icône **🔔** dans le header de l'application. Le badge rouge indique le nombre de notifications non lues.

Chaque notification dispose d'un bouton 🗑️ pour la supprimer individuellement. Un bouton **« Supprimer lues »** permet de purger toutes les notifications déjà lues d'un coup (avec confirmation).

---

## Préférences de notifications

### GET /api/notifications/preferences 🔒

Retourne les préférences de notifications de l'utilisateur. Si aucune préférence n'est définie, les valeurs par défaut sont renvoyées.

**Réponse 200**

```json
{
  "weekly_report": true,
  "job_completed": true,
  "job_failed": true,
  "rule_executed": false,
  "quota_warning": true,
  "integrity_alert": true,
  "weekly_report_toast": false,
  "job_completed_toast": true,
  "job_failed_toast": true,
  "rule_executed_toast": false,
  "quota_warning_toast": false,
  "integrity_alert_toast": false
}
```

Chaque type de notification possède deux canaux indépendants :

| Préférence | Défaut | Canal | Description |
|---|---|---|---|
| `weekly_report` | `true` | 🔔 In-app | Rapport hebdomadaire (chaque lundi) |
| `weekly_report_toast` | `false` | 💬 Toast | |
| `job_completed` | `true` | 🔔 In-app | Quand un job termine |
| `job_completed_toast` | `true` | 💬 Toast | |
| `job_failed` | `true` | 🔔 In-app | Quand un job échoue |
| `job_failed_toast` | `true` | 💬 Toast | |
| `rule_executed` | `false` | 🔔 In-app | Quand une règle s'exécute |
| `rule_executed_toast` | `false` | 💬 Toast | |
| `quota_warning` | `true` | 🔔 In-app | Alerte stockage |
| `quota_warning_toast` | `false` | 💬 Toast | |
| `integrity_alert` | `true` | 🔔 In-app | Problème d'intégrité |
| `integrity_alert_toast` | `false` | 💬 Toast | |

---

### PUT /api/notifications/preferences 🔒

Met à jour une ou plusieurs préférences. Seules les clés fournies sont modifiées.

**Body**

```json
{
  "weekly_report": false,
  "job_completed_toast": false
}
```

**Réponse 200**

```json
{ "ok": true }
```

::: info Upsert
Si l'utilisateur n'a pas encore de préférences, une ligne est créée avec les valeurs par défaut puis mise à jour.
:::

---

## Dispatcher unifié

Chaque événement (job terminé, règle exécutée, rapport hebdo…) passe par le dispatcher `notify()` qui :

1. Vérifie la préférence **in-app** → insère dans la table `notifications` si activé
2. Déclenche les **webhooks** configurés pour l'événement correspondant (Discord, Slack, Ntfy, générique)

Les trois canaux (in-app, toast, webhook) sont indépendants. Le toast est géré côté frontend via le hook `useGlobalJobNotifier`.

| Catégorie notification | Événement webhook |
|---|---|
| `job_completed` | `job.completed` |
| `job_failed` | `job.failed` |
| `rule_executed` | `rule.executed` |
| `quota_warning` | `quota.warning` |
| `integrity_alert` | `integrity.failed` |
| `weekly_report` | *(pas de webhook dédié)* |
