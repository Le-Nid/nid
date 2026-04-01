# Partage d'archives

La fonctionnalité de partage permet de générer des **liens temporaires** pour partager un mail archivé avec quelqu'un qui n'a pas de compte sur l'application.

## Créer un lien de partage

Depuis la page **Partage** (menu Outils) :

1. Cliquez sur un mail archivé
2. Choisissez la **durée de validité** (1 heure à 30 jours)
3. Optionnellement, définissez un **nombre maximum d'accès**
4. Le lien est généré et peut être copié dans le presse-papiers

## Paramètres d'un partage

| Paramètre | Description | Valeur par défaut |
|-----------|-------------|:-----------------:|
| **Durée** | Temps pendant lequel le lien est valide | 24 heures |
| **Accès max** | Nombre de fois que le lien peut être utilisé | Illimité |

## Sécurité

- Les liens utilisent un **token cryptographique de 64 caractères** (256 bits d'entropie)
- Les liens expirent automatiquement — nettoyage toutes les heures
- Les mails **chiffrés** ne peuvent pas être partagés
- Le contenu est servi dans une **iframe sandboxée** (pas d'exécution de scripts)
- Chaque accès est comptabilisé

## Gestion des liens

La page de partage affiche tous vos liens actifs avec :

- Le sujet et l'expéditeur du mail partagé
- La date d'expiration
- Le nombre d'accès

Vous pouvez **révoquer** un lien à tout moment en cliquant sur l'icône de suppression.

## Vue publique

Les personnes qui reçoivent le lien accèdent à une page publique épurée affichant :

- Le sujet, l'expéditeur et la date du mail
- Le contenu HTML ou texte du mail
- Un badge « Mail partagé via lien temporaire »

Aucune authentification n'est requise pour consulter un lien valide.

## API

| Méthode | Endpoint | Auth | Description |
|---------|----------|:----:|-------------|
| `GET` | `/api/shares` | Oui | Lister mes partages |
| `POST` | `/api/shares` | Oui | Créer un lien |
| `DELETE` | `/api/shares/:id` | Oui | Révoquer un lien |
| `GET` | `/api/shares/public/:token` | Non | Accéder au mail partagé |
