# Serveur MCP

Nid inclut un serveur [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) qui permet aux assistants IA (Claude, GitHub Copilot, etc.) d'interagir avec l'application.

---

## Qu'est-ce que MCP ?

Le Model Context Protocol est un standard ouvert qui permet aux LLM d'accéder à des outils et des données depuis des applications externes. Le serveur MCP de Nid expose des outils en lecture et en écriture pour manipuler vos mails, règles, jobs et archives.

---

## Démarrage

### Build

```bash
cd backend
npm run build:mcp
```

### Lancement

```bash
npm run start:mcp
```

Le serveur MCP utilise le transport **stdio** (entrée/sortie standard) — il est conçu pour être lancé par un client MCP (comme Claude Desktop ou VS Code).

---

## Configuration avec Claude Desktop

Ajoutez cette configuration dans `claude_desktop_config.json` :

```json
{
  "mcpServers": {
    "nid": {
      "command": "node",
      "args": ["/chemin/vers/nid/backend/dist/mcp-server.js"],
      "env": {
        "DATABASE_URL": "postgres://user:pass@localhost:5432/nid",
        "JWT_SECRET": "votre-secret",
        "JWT_REFRESH_SECRET": "votre-refresh-secret",
        "GOOGLE_CLIENT_ID": "votre-client-id",
        "GOOGLE_CLIENT_SECRET": "votre-client-secret",
        "GOOGLE_REDIRECT_URI": "http://localhost:4000/api/auth/gmail/callback"
      }
    }
  }
}
```

## Configuration avec VS Code

Dans `.vscode/mcp.json` :

```json
{
  "servers": {
    "nid": {
      "type": "stdio",
      "command": "node",
      "args": ["backend/dist/mcp-server.js"],
      "env": {
        "DATABASE_URL": "postgres://user:pass@localhost:5432/nid",
        "JWT_SECRET": "votre-secret",
        "JWT_REFRESH_SECRET": "votre-refresh-secret",
        "GOOGLE_CLIENT_ID": "votre-client-id",
        "GOOGLE_CLIENT_SECRET": "votre-client-secret",
        "GOOGLE_REDIRECT_URI": "http://localhost:4000/api/auth/gmail/callback"
      }
    }
  }
}
```

---

## Outils disponibles

### Consultation

| Outil | Description |
|-------|-------------|
| `list-users` | Liste tous les utilisateurs |
| `list-accounts` | Liste les comptes Gmail d'un utilisateur |
| `search-archived-mails` | Recherche full-text dans les archives |
| `get-dashboard-stats` | Statistiques d'un compte (mails, taille, PJ) |
| `list-rules` | Liste les règles automatiques |
| `list-jobs` | Liste les jobs récents avec filtres |
| `list-notifications` | Notifications non lues |
| `list-saved-searches` | Liste les recherches sauvegardées |
| `get-sender-scores` | Top expéditeurs pollueurs |
| `search-attachments` | Recherche dans les pièces jointes |
| `get-audit-log` | Journal d'audit |
| `get-inbox-zero-progress` | Historique inbox zero |
| `get-cleanup-suggestions` | Suggestions de nettoyage |
| `get-dedup-stats` | Statistiques de déduplication des PJ |

### Actions

| Outil | Description |
|-------|-------------|
| `toggle-rule` | Activer/désactiver une règle |
| `create-rule` | Créer une règle automatique avec conditions et actions |
| `update-rule` | Modifier une règle existante |
| `delete-rule` | Supprimer une règle |
| `run-rule` | Exécuter immédiatement une règle |
| `create-notification` | Créer une notification / alerte pour un utilisateur |
| `mark-notifications-read` | Marquer les notifications comme lues |
| `create-saved-search` | Créer une recherche sauvegardée (dossier intelligent) |
| `update-saved-search` | Modifier une recherche sauvegardée |
| `delete-saved-search` | Supprimer une recherche sauvegardée |

### Ressources

| Ressource | URI | Description |
|-----------|-----|-------------|
| Configuration | `config://app` | Paramètres de l'application (sans secrets) |

---

## Exemples d'utilisation

Avec un assistant IA connecté au serveur MCP :

> « Montre-moi les statistiques de mon compte Gmail principal »

> « Quels sont mes 10 expéditeurs les plus pollueurs ? »

> « Recherche les pièces jointes PDF de plus de 5 Mo »

> « Quelles suggestions de nettoyage sont disponibles ? »

> « Désactive la règle de nettoyage des notifications GitHub »

> « Crée une règle pour archiver automatiquement les mails de newsletter non lus depuis plus de 30 jours »

> « Crée une recherche sauvegardée "Factures récentes" avec la requête label:factures newer_than:1m »

> « Envoie-moi une alerte quand le quota Gmail approche de la limite »

---

## Sécurité

- Le serveur MCP accède directement à la base de données — il nécessite les mêmes variables d'environnement que le backend
- Il n'y a pas d'authentification MCP intégrée : la sécurité repose sur le contrôle d'accès au processus stdio
- Les outils en lecture seule sont annotés `readOnlyHint: true`
- Aucun secret (tokens Gmail, mots de passe) n'est exposé via les outils MCP
