# Règles & libellés

La page **Règles & libellés** (`/rules`) automatise le tri de votre boîte : chaque règle applique une action aux mails qui lui correspondent. Elle a deux onglets : **Règles** et **Libellés** (`/rules?tab=labels`).

---

## Onglet Règles

La liste affiche pour chaque règle :

- **Nom** ;
- **Conditions**, en clair (« de news@exemple.fr, de plus de 30 jours ») ;
- **Action** (« Appliquer un libellé « Factures » »…) ;
- **Dernière exécution** (ou « Jamais exécutée ») ;
- **Active** : interrupteur pour suspendre ou réactiver la règle.

Le menu `⋯` d'une règle propose :

- **Exécuter** : lance la règle tout de suite sur les mails déjà reçus. Un toast « Exécution de « … » » permet d'**Annuler** pendant 10 s ; la suite se suit dans [Activité](activity.md).
- **Modifier** : ouvre le formulaire.
- **Supprimer** : après confirmation (« La règle ne s'exécutera plus. Les mails déjà traités restent tels quels. »).

Sans règle, la page invite à en créer une ou à partir d'un modèle de l'onglet Libellés.

---

## Créer une règle

Le bouton **Nouvelle règle** (aussi dans la palette `⌘K`) ouvre le formulaire. Il s'ouvre aussi pré-rempli depuis :

- [Mails](mails.md) : **Créer une règle** dans l'en-tête (recherche courante), la barre de sélection ou le lecteur ;
- [Nettoyage](cleanup.md) et les suggestions de la [Vue d'ensemble](overview.md) : **Toujours faire ça** ;
- l'onglet Libellés : **Créer une règle** sur un libellé.

### Champs

| Champ | Contenu |
|---|---|
| **Nom** | proposé automatiquement (« Mails de … ») |
| **Quand un mail arrive de** | adresse ou domaine, par exemple `news@exemple.fr` |
| **Autres conditions (conservées)** | conditions d'une règle existante que le formulaire ne sait pas modifier ; elles sont gardées telles quelles |
| **Et qu'il a plus de** | Aucune limite, 7 jours, 30 jours, 6 mois |
| **Alors** | Sauvegarder sur le NAS puis supprimer · Archiver (retirer de la boîte) · Supprimer · Appliquer un libellé (+ choix du **Libellé**) |
| **Exécution** | Manuelle, Quotidienne (par défaut), Hebdomadaire |
| **Appliquer aussi aux mails déjà reçus** | lance la règle dès l'enregistrement (avec le même toast d'annulation) |

Un expéditeur est obligatoire : « une règle basée sur la seule durée viserait toute la boîte ».

### Aperçu

Sous le formulaire, Nid calcule les mails concernés : « 143 mails concernés · 58 Mo », quelques **Exemples**, et le lien **Voir les 143 mails** qui ouvre [Mails](mails.md) avec la recherche correspondante.

**Créer la règle** (ou **Enregistrer** en modification) valide.

---

## Onglet Libellés

« Vos libellés Gmail, synchronisés avec leurs couleurs, et des modèles prêts à l'emploi. »

### Libellés Gmail

L'arbre des libellés du compte, avec leur couleur Gmail et le nombre de mails archivés. Les libellés imbriqués (`Factures/EDF`) sont affichés en arbre.

- **Nouveau libellé** : crée le libellé dans Gmail. Utilisez « / » pour l'imbriquer, par exemple `Factures/EDF`.
- Menu d'un libellé :
  - **Renommer** ;
  - **Couleur** (palette Gmail : Rouge, Orange, Jaune, Vert, Turquoise, Bleu, Violet, Rose, Gris) ;
  - **Créer une règle** qui applique ce libellé ;
  - **Voir les mails** : ouvre [Mails](mails.md) filtré sur ce libellé ;
  - **Supprimer** : après confirmation ; le libellé est retiré de Gmail et des mails qui le portent, les mails ne sont pas supprimés.

### Catégories Gmail

Promotions, Réseaux sociaux, Mises à jour, Forums : « Attribuées par Gmail, non modifiables. »

### Modèles

« Un clic crée le libellé Gmail et la règle qui le remplit. »

- Libellés : **Factures**, **Livraisons**, **Banque**, **Billets & voyages** — chaque modèle crée le libellé et une règle quotidienne qui l'applique selon des mots-clés de l'objet (bouton **Créer le libellé et la règle**).
- Expiration : **Codes OTP (expire après 1 jour)**, **Promotions (expire après 7 jours)** — une règle qui supprime ces mails une fois l'âge dépassé (bouton **Activer**). Ces modèles remplacent l'ancienne page « Expiration des emails ».
- **Autres modèles** : nettoyage (notifications GitHub, newsletters non lues, promotions, réseaux sociaux), archivage (mails anciens, factures, gros mails) et organisation (marquer comme lus les vieux mails…), bouton **Activer**.

Un modèle déjà utilisé affiche **Déjà actif** et le bouton **Modifier la règle**.
