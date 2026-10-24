# API — Audit log

Journal d'activité traçant les actions sensibles de chaque utilisateur. Le journal de toute l'instance est exposé aux admins par [`GET /api/admin/audit`](admin.md#journal-d-audit-de-l-instance).

---

## Lister les logs

### GET /api/audit 🔒

Retourne les logs d'audit de l'utilisateur authentifié, paginés et triés par date décroissante.

**Query params**

| Param | Défaut | Description |
|---|---|---|
| `page` | `1` | Numéro de page |
| `limit` | `50` | Nombre de résultats par page (max 100) |
| `action` | *(tous)* | Filtrer par type d'action |

**Réponse 200**
```json
{
  "logs": [
    {
      "id": "uuid",
      "user_id": "uuid",
      "action": "user.login",
      "target_type": null,
      "target_id": null,
      "details": null,
      "ip_address": "192.168.1.1",
      "created_at": "2026-03-30T10:00:00Z"
    }
  ],
  "total": 42,
  "page": 1,
  "limit": 50
}
```

`total` compte tous les logs de l'utilisateur, sans tenir compte du filtre `action`.

---

## Actions tracées

| Action | Déclencheur |
|---|---|
| `user.register` | Inscription d'un utilisateur |
| `user.login` | Connexion par mot de passe |
| `user.login_sso` | Connexion via Google SSO |
| `user.login_social` | Connexion via un fournisseur social (`details.provider`) |
| `user.2fa_enable` | Activation de la 2FA |
| `user.2fa_disable` | Désactivation de la 2FA |
| `user.password_change` | Changement du mot de passe |
| `user.export_data` | Export RGPD des données |
| `admin.reset_password` | Réinitialisation d'un mot de passe par un admin |
| `admin.delete_user` | Suppression d'un utilisateur par un admin |
| `rule.create_from_template` | Création d'une règle depuis un template |
| `bulk.trash` | Opération bulk : mise en corbeille |
| `bulk.archive` | Opération bulk : archivage |
| `bulk.label` | Opération bulk : libellés et lu / non lu (`details.action`) |
| `admin.empty_archive_trash` | Un admin vide la corbeille des archives de l'instance |

Les opérations bulk par `messageIds` sont tracées à la mise en file ; celles par `query` à la fin du job, avec le nombre réel de mails traités.

::: info Fail-safe
L'écriture des logs d'audit est fail-safe : une erreur d'écriture est loggée en console mais ne bloque jamais l'action principale.
:::
