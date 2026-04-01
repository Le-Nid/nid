---
applyTo: "**"
---

# Post-task validation

After completing any coding task, **always** run these validation commands before reporting done:

## Backend (if backend files were modified)

```bash
cd backend && npm ci && npm run typecheck
```

## Frontend (if frontend files were modified)

```bash
cd frontend && npm ci && npm run typecheck
```

Run `npm ci` to ensure dependencies are in sync with the lockfile, then `npm run typecheck` (`tsc --noEmit`) to catch type errors.

If both packages were modified, run both validations. Fix any errors before considering the task complete.

Créé systématiquement la documentation technique et utilisateur pour toute nouvelle fonctionnalité ou modification significative.
