# API — Expiration des mails (retirée)

Les routes `/api/expiration` ont été **supprimées** : l'écran Expiration est devenu des modèles de règles (« Codes OTP — expire après 1 jour »…, voir [Règles](rules.md)), qui créent une règle `older_than` + `trash`.

Les expirations **déjà programmées** restent honorées : le planificateur met toujours, toutes les 15 minutes, les mails échus dans la corbeille Gmail (comptes actifs) et marque l'expiration `is_deleted`. Quand plus aucune n'est en attente (`SELECT count(*) FROM email_expirations WHERE is_deleted = false` = 0), la table, le service et la tâche planifiée seront supprimés.
