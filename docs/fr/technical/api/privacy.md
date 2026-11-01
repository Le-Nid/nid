# API Vie privée — sortie du chiffrement des archives

## Préfixe : `/api/privacy`

Session uniquement (refusé aux jetons d'API).

Le **chiffrement des archives a été retiré** de Nid : il ne protégeait que le contenu des fichiers EML (objet, expéditeur, destinataires, extrait et noms des pièces jointes restaient en clair dans PostgreSQL), et il rendait le mail illisible dans Nid, introuvable par la recherche plein texte et impossible à restaurer ou à partager. Pour protéger les archives au repos, chiffrez le volume du NAS (LUKS, dataset ZFS chiffré…) : cela couvre aussi la base. Seule la sortie reste : remettre en clair les archives déjà chiffrées.

---

### `GET /:accountId/encryption/status`

Nombre d'archives du compte encore chiffrées.

```json
{ "total": 1500, "encrypted": 1200, "unencrypted": 300, "percentage": 80 }
```

### `POST /:accountId/encryption/decrypt-all`

```json
{ "passphrase": "ma-phrase-secrète" }
```

Vérifie la phrase secrète (`403` sinon), puis lance un job `decrypt_archives` (**202** `{ "jobId" }`) qui déchiffre sur place chaque EML et ses pièces jointes, marque l'archive lisible, puis relance le remplissage du texte intégral (`backfill_body_text`) pour la recherche. Une phrase fausse n'écrit rien (tag GCM). La phrase n'est ni stockée dans la table `jobs` ni conservée dans Redis après le job. Rate limit : 5/min. Interface : Paramètres › Données › **Archives chiffrées** (affichée seulement s'il en reste).

---

## Format du fichier chiffré

```
GMENC01 (7 octets magic) | SALT (32 octets) | IV (12 octets) | TAG (16 octets) | CIPHERTEXT
```

- Algorithme : AES-256-GCM
- Dérivation de clé : PBKDF2 (SHA-512, 100 000 itérations)
- La phrase secrète n'est jamais stockée, seul un hash scrypt est conservé pour vérification
