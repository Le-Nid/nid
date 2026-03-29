# Base de données

Le schéma est maintenant géré par les **migrations Kysely**.

Les migrations se trouvent dans :
```
backend/src/db/migrations/
  001_initial.ts   ← Schéma complet initial
```

Elles sont exécutées **automatiquement au démarrage** du backend via `runMigrations()`.

Pour ajouter une nouvelle migration :
1. Créer `backend/src/db/migrations/002_ma_migration.ts`
2. Implémenter `up(db)` et `down(db)`
3. Enregistrer dans `backend/src/db/index.ts` → objet `migrations`

Kysely trackera les migrations appliquées dans la table `kysely_migration` (créée automatiquement).
