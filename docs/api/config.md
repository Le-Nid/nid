# API — Export / Import de configuration

Permet d'exporter et importer les règles et webhooks d'un utilisateur au format JSON. Utile pour sauvegarder sa configuration, la transférer entre instances ou la partager.

---

## Exporter la configuration

### GET /api/config/export

**Auth** : JWT

Retourne un fichier JSON contenant toutes les règles (par compte Gmail) et tous les webhooks de l'utilisateur.

**Réponse**

```json
{
  "version": "1.0",
  "exportedAt": "2024-03-15T12:00:00.000Z",
  "accounts": [
    {
      "email": "user@gmail.com",
      "rules": [
        {
          "name": "Nettoyer newsletters",
          "description": "Supprime les newsletters non lues > 30j",
          "conditions": [
            { "field": "from", "operator": "contains", "value": "newsletter@" }
          ],
          "action": { "type": "trash" },
          "schedule": "0 2 * * 0",
          "is_active": true
        }
      ]
    }
  ],
  "webhooks": [
    {
      "name": "Notif Discord",
      "url": "https://discord.com/api/webhooks/...",
      "type": "discord",
      "events": ["job.completed", "job.failed"],
      "is_active": true
    }
  ]
}
```

!!! info "Données exportées"
    Seules les métadonnées des règles et webhooks sont exportées. Les tokens OAuth, secrets HMAC et données personnelles ne sont **pas** inclus.

---

## Importer une configuration

### POST /api/config/import

**Auth** : JWT

Importe des règles et webhooks depuis un fichier JSON précédemment exporté.

**Body** : le JSON d'export (même format que la réponse de `/export`).

**Comportement**

| Élément | Logique d'import |
|---|---|
| Règles | Associées au compte Gmail correspondant par **email**. Si le compte Gmail n'existe pas chez l'utilisateur, les règles sont ignorées. |
| Webhooks | Créés directement pour l'utilisateur. Un nouveau `secret` sera généré pour les webhooks de type `generic`. |

**Réponse**

```json
{
  "rulesImported": 5,
  "webhooksImported": 2
}
```

!!! warning "Import additif"
    L'import **ajoute** les règles et webhooks sans supprimer les existants. Il peut donc y avoir des doublons si vous importez plusieurs fois le même fichier.
