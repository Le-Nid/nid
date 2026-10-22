# Vie privée

Nid peut chiffrer vos archives. Les images distantes (et les pixels espions qu'elles cachent) sont bloquées par le lecteur tant que vous ne les affichez pas.

---

## Chiffrement des archives

Vos archives EML peuvent être chiffrées sur le NAS avec un algorithme **AES-256-GCM** (le même standard utilisé par les banques et gouvernements).

### Configurer le chiffrement

1. Dans l'onglet **Chiffrement**, cliquez sur **Configurer**
2. Choisissez une **phrase secrète** (passphrase)
3. Confirmez la phrase secrète
4. Cliquez sur **Activer le chiffrement**

> 📸 *Capture d'écran suggérée : formulaire de configuration du chiffrement avec le champ passphrase*

::: warning Conservez votre phrase secrète
La phrase secrète n'est **jamais stockée** dans l'application — seul un hash de vérification est conservé. Si vous la perdez, il sera impossible de déchiffrer vos archives. Notez-la dans un endroit sûr (gestionnaire de mots de passe, etc.).
:::

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
