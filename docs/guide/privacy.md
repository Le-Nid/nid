# Vie privée

Gmail Manager intègre des outils pour protéger votre vie privée : détection de pixels espions, scanner de données sensibles et chiffrement de vos archives.

---

## Détection de pixels espions (tracking)

De nombreux mails commerciaux contiennent des **pixels espions** : des images invisibles qui signalent à l'expéditeur quand vous ouvrez le mail.

### Scanner vos mails

1. Ouvrez la page **Vie privée** dans la sidebar
2. Dans l'onglet **Pixels espions**, cliquez sur **Scanner**
3. Un job de scan est lancé — il analyse le HTML de vos mails récents

> 📸 *Capture d'écran suggérée : onglet Pixels espions avec le bouton Scanner et les statistiques globales*

### Résultats

Après le scan, vous voyez :

- **Statistiques globales** : nombre de mails contenant des trackers, nombre total de trackers détectés
- **Liste par mail** : chaque mail avec le nombre et le type de trackers détectés
- **Domaines les plus fréquents** : classement des domaines de tracking (ex. : Mailchimp, SendGrid, HubSpot)

> 📸 *Capture d'écran suggérée : résultats du scan avec la liste des mails contenant des trackers et les domaines détectés*

### Types de trackers détectés

| Type | Description |
|---|---|
| **Pixels 1×1** | Images invisibles (1 pixel) chargées au moment de l'ouverture |
| **Domaines connus** | Plus de 35 domaines d'email marketing identifiés (Mailchimp, SendGrid, HubSpot, Klaviyo, Brevo, etc.) |
| **Paramètres UTM** | Liens contenant des paramètres de tracking (utm_source, utm_medium, utm_campaign) |

---

## Scanner de données sensibles (PII)

Le scanner PII (Personally Identifiable Information) analyse vos mails archivés pour détecter les données sensibles en clair.

### Scanner vos archives

1. Dans l'onglet **Données sensibles**, cliquez sur **Scanner**
2. Un job de scan analyse les fichiers EML de vos archives

> 📸 *Capture d'écran suggérée : onglet Données sensibles avec le bouton Scanner*

### Types de données détectées

| Type | Exemple |
|---|---|
| **Carte bancaire** | Visa, Mastercard, Amex (avec séparateurs) |
| **IBAN** | Numéro de compte bancaire international |
| **Numéro de sécu** | Numéro de sécurité sociale français |
| **Mot de passe en clair** | Texte contenant "password:", "mdp=", etc. |
| **Téléphone** | Numéro français (+33, 06, 07...) |

> 📸 *Capture d'écran suggérée : résultats du scan PII avec le type de donnée, le nombre de mails concernés et un snippet masqué*

!!! info "Données masquées"
    Les extraits affichés dans les résultats sont automatiquement masqués (ex. : `****-****-****-4242`) pour ne pas exposer les données réelles dans l'interface.

---

## Chiffrement des archives

Vos archives EML peuvent être chiffrées sur le NAS avec un algorithme **AES-256-GCM** (le même standard utilisé par les banques et gouvernements).

### Configurer le chiffrement

1. Dans l'onglet **Chiffrement**, cliquez sur **Configurer**
2. Choisissez une **phrase secrète** (passphrase)
3. Confirmez la phrase secrète
4. Cliquez sur **Activer le chiffrement**

> 📸 *Capture d'écran suggérée : formulaire de configuration du chiffrement avec le champ passphrase*

!!! warning "Conservez votre phrase secrète"
    La phrase secrète n'est **jamais stockée** dans l'application — seul un hash de vérification est conservé. Si vous la perdez, il sera impossible de déchiffrer vos archives. Notez-la dans un endroit sûr (gestionnaire de mots de passe, etc.).

### Chiffrer les archives existantes

Après avoir configuré la passphrase :

1. Cliquez sur **Chiffrer les archives**
2. Un job de chiffrement est lancé
3. Chaque fichier EML est chiffré individuellement sur le disque

Les mails déjà chiffrés sont automatiquement ignorés (idempotent).

### Lire un mail chiffré

Quand vous consultez un mail chiffré dans la page Archives, il est **déchiffré à la volée** dans la mémoire du serveur. Le fichier reste chiffré sur le disque en permanence.

### Statut du chiffrement

L'onglet Chiffrement affiche :

- Si une passphrase est configurée
- Le nombre de mails chiffrés / non chiffrés
- Un indicateur de sécurité global

> 📸 *Capture d'écran suggérée : statut du chiffrement avec le nombre de mails chiffrés et le pourcentage*
