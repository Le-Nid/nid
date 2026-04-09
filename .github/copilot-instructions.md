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

Fait un npm run test pour vérifier que les tests unitaires passent sans erreur. La couverture de tests doit être maintenue ou améliorée. la cible est la recommandation de sonarqueube de 80% de couverture. Si la couverture est inférieure, AJOUTER des tests pour atteindre cet objectif.
La pipeline de CI/CD inclue SonarQube pour analyser la qualité du code et la couverture des tests. Assurez-vous que votre code respecte les normes de qualité et que la couverture de tests est suffisante pour éviter les régressions.

Créé systématiquement la documentation technique et utilisateur pour toute nouvelle fonctionnalité ou modification significative.
