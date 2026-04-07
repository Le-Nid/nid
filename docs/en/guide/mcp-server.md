# MCP Server

Nid includes a [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) server that allows AI assistants (Claude, GitHub Copilot, etc.) to interact with the application.

---

## What is MCP?

The Model Context Protocol is an open standard that allows LLMs to access tools and data from external applications. Nid's MCP server exposes read and write tools to manipulate your emails, rules, jobs, and archives.

---

## Getting Started

### Build

```bash
cd backend
npm run build:mcp
```

### Launch

```bash
npm run start:mcp
```

The MCP server uses the **stdio** transport (standard input/output) — it is designed to be launched by an MCP client (such as Claude Desktop or VS Code).

---

## Configuration with Claude Desktop

Add this configuration to `claude_desktop_config.json`:

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

## Configuration with VS Code

In `.vscode/mcp.json`:

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

## Available Tools

### Read-only

| Tool | Description |
|------|-------------|
| `list-users` | List all users |
| `list-accounts` | List a user's Gmail accounts |
| `search-archived-mails` | Full-text search in archives |
| `get-dashboard-stats` | Account statistics (emails, size, attachments) |
| `list-rules` | List automatic rules |
| `list-jobs` | List recent jobs with filters |
| `list-notifications` | Unread notifications |
| `list-saved-searches` | List saved searches |
| `get-sender-scores` | Top polluter senders |
| `search-attachments` | Search through attachments |
| `get-audit-log` | Audit log |
| `get-inbox-zero-progress` | Inbox zero history |
| `get-cleanup-suggestions` | Cleanup suggestions |
| `get-dedup-stats` | Attachment deduplication statistics |

### Actions

| Tool | Description |
|------|-------------|
| `toggle-rule` | Enable/disable a rule |
| `create-rule` | Create an automatic rule with conditions and actions |
| `update-rule` | Modify an existing rule |
| `delete-rule` | Delete a rule |
| `run-rule` | Execute a rule immediately |
| `create-notification` | Create a notification / alert for a user |
| `mark-notifications-read` | Mark notifications as read |
| `create-saved-search` | Create a saved search (smart folder) |
| `update-saved-search` | Modify a saved search |
| `delete-saved-search` | Delete a saved search |

### Resources

| Resource | URI | Description |
|----------|-----|-------------|
| Configuration | `config://app` | Application settings (without secrets) |

---

## Usage Examples

With an AI assistant connected to the MCP server:

> "Show me the statistics for my main Gmail account"

> "What are my top 10 polluter senders?"

> "Search for PDF attachments larger than 5 MB"

> "What cleanup suggestions are available?"

> "Disable the GitHub notifications cleanup rule"

> "Create a rule to automatically archive unread newsletter emails older than 30 days"

> "Create a saved search called 'Recent Invoices' with the query label:invoices newer_than:1m"

> "Send me an alert when the Gmail quota approaches its limit"

---

## Security

- The MCP server accesses the database directly — it requires the same environment variables as the backend
- There is no built-in MCP authentication: security relies on access control to the stdio process
- Read-only tools are annotated with `readOnlyHint: true`
- No secrets (Gmail tokens, passwords) are exposed through MCP tools
