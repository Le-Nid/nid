# Expiration des emails

La fonctionnalité d'expiration permet de marquer certains emails comme **temporaires** pour qu'ils soient automatiquement supprimés après une durée définie. C'est particulièrement utile pour les emails qui n'ont plus de valeur après un certain temps.

## Types d'emails temporaires

| Catégorie | Description | Durée par défaut |
|-----------|-------------|:----------------:|
| **Code OTP** | Codes de vérification, 2FA, connexion | 1 jour |
| **Livraison** | Suivi de colis, confirmations d'expédition | 14 jours |
| **Promotion** | Offres flash, codes promo, soldes | 7 jours |
| **Manuel** | Tout email marqué manuellement | 7 jours |

## Détection automatique

Cliquez sur **Détecter automatiquement** pour scanner vos emails récents. L'application analyse le sujet et l'expéditeur de chaque email pour identifier les emails temporaires via des heuristiques :

- **Codes OTP** : détection par mots-clés (verification, code, OTP, sign-in, security) et expéditeurs (noreply, security)
- **Livraisons** : détection par mots-clés (shipping, tracking, colis, commande) et transporteurs connus (UPS, FedEx, DHL, Colissimo)
- **Promotions** : détection par mots-clés (promo, sale, discount, offre) et expéditeurs marketing

Après la détection, vous pouvez sélectionner les emails à marquer comme temporaires et ajuster la durée si nécessaire.

## Ajout manuel

Vous pouvez aussi ajouter manuellement un email à la liste d'expiration :

1. Cliquez sur **Ajouter manuellement**
2. Saisissez l'ID du message Gmail
3. Choisissez la catégorie
4. Définissez le nombre de jours avant expiration

## Tableau de bord

La page affiche 4 statistiques :

- **En attente** : emails marqués qui n'ont pas encore expiré
- **Expire bientôt** : emails qui expirent dans les 24 prochaines heures
- **Supprimés** : emails déjà supprimés automatiquement
- **Total** : nombre total d'expirations créées

## Fonctionnement

Le système vérifie les expirations **toutes les 15 minutes**. Quand un email atteint sa date d'expiration, il est automatiquement envoyé dans la corbeille Gmail (pas de suppression définitive, ce qui laisse 30 jours pour récupérer).

## API

| Méthode | Endpoint | Description |
|---------|----------|-------------|
| `GET` | `/api/expiration/:accountId` | Lister les expirations |
| `GET` | `/api/expiration/:accountId/stats` | Statistiques |
| `POST` | `/api/expiration/:accountId` | Créer une expiration |
| `POST` | `/api/expiration/:accountId/batch` | Créer en lot |
| `POST` | `/api/expiration/:accountId/detect` | Détection heuristique |
| `PATCH` | `/api/expiration/:accountId/:id` | Modifier la date |
| `DELETE` | `/api/expiration/:accountId/:id` | Supprimer l'expiration |
