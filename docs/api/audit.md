# API — Audit log

Journal d'activité traçant les actions sensibles de chaque utilisateur.

---

## Lister les logs

### GET /api/audit 🔒

Retourne les logs d'audit de l'utilisateur authentifié, paginés et triés par date décroissante.

**Query params**

| Param | Défaut | Description |
|---|---|---|
| `page` | `1` | Numéro de page |
| `limit` | `20` | Nombre de résultats par page |
| `action` | *(tous)* | Filtrer par type d'action |

**Réponse 200**
```json
{
  "data": [
    {
      "id": "uuid",
      "user_id": "uuid",
      "action": "user.login",
      "target_type": null,
      "target_id": null,
      "details": { "ipAddress": "192.168.1.1" },
      "ip_address": "192.168.1.1",
      "created_at": "2026-03-30T10:00:00Z"
    }
  ],
  "total": 42,
  "page": 1,
  "limit": 20
}
```

---

## Actions tracées

| Action | Déclencheur |
|---|---|
| `user.register` | Inscription d'un utilisateur |
| `user.login` | Connexion par mot de passe |
| `user.login_sso` | Connexion via Google SSO |
| `user.2fa_enable` | Activation de la 2FA |
| `user.2fa_disable` | Désactivation de la 2FA |
| `rule.create` | Création d'une règle |
| `rule.create_from_template` | Création d'une règle depuis un template |
| `rule.update` | Modification d'une règle |
| `rule.delete` | Suppression d'une règle |
| `rule.toggle` | Activation/désactivation d'une règle |
| `rule.run` | Exécution manuelle d'une règle |
| `bulk.trash` | Opération bulk : mise en corbeille |
| `bulk.delete` | Opération bulk : suppression |
| `bulk.archive` | Opération bulk : archivage |
| `bulk.label` | Opération bulk : ajout de label |
| `bulk.mark_read` | Opération bulk : marquer comme lu |

!!! info "Fail-safe"
    L'écriture des logs d'audit est fail-safe : une erreur d'écriture est loggée en console mais ne bloque jamais l'action principale.
