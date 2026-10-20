# Nid — Spécification de la refonte UI (phase 2)

Source de vérité de la refonte. Prototype validé (13 artboards) : https://claude.ai/artifact/2qEiArAYNPjidwm73HksPh
Artboards en cours d'ajout (Activité, Paramètres, Admin, Libellés) : cette spec fait foi tant qu'ils ne sont pas validés.

Versions vérifiées le 2026-10-20 : `shadcn` 4.22.1 (CLI), `tailwindcss` 4.3.3, `@tanstack/react-table` 9.3.1, `@tanstack/react-query` 5.104.x (déjà installé), `sonner` 2.0.8, `cmdk` 1.1.1.

---

## 1. Objectifs & non-objectifs

**Objectifs**
- Réduire 18 pages à 8 entrées de navigation orientées tâche (voir, nettoyer, automatiser, sauvegarder).
- Mobile de première classe : chaque tableau devient une liste de cartes, actions au pouce, PWA (safe areas).
- Actions de masse sûres : annulation réelle (délai serveur 10 s) plutôt que des confirmations partout.
- Accessibilité RGAA 4.1 / WCAG 2.1 AA (+ 2.5.8 taille de cible WCAG 2.2) ; le ratchet axe ne fait que baisser.
- Remplacer antd par shadcn/ui + Tailwind v4, page par page, sans big bang.

**Non-objectifs**
- Pas de nouvelle fonctionnalité métier hors de celles listées en §8 (prérequis backend).
- Pas de classification automatique par LLM (point ouvert §10).
- Pas de virtualisation de listes (pagination serveur suffit).
- Pas de refonte de la page publique `/shared/:token` au-delà du changement de composants.
- Pas de changement de l'API d'auth ni du modèle multi-comptes.

---

## 2. Décisions

| ID | Décision |
|----|----------|
| S1 | Stack : shadcn/ui (base Radix) + Tailwind v4 + TanStack Table v9 + TanStack Query v5 + react-router + i18next conservés. |
| S2 | antd retiré à la fin ; migration page par page dans le même frontend. |
| S3 | Playwright e2e (sélecteurs par rôle, `frontend/e2e`) = filet de régression ; le ratchet axe (`frontend/e2e/a11y-baseline.json`) ne peut que baisser. |
| N1 | Navigation (8) : Vue d'ensemble · Mails · Nettoyage (expéditeurs/newsletters, gros mails & PJ) · Règles · Archives · Activité · Paramètres · Admin (page dédiée, admins seulement). |
| N2 | Barre mobile : Vue d'ensemble, Mails, Nettoyage, Archives, Plus (Plus = Règles, Activité, Paramètres, Admin). |
| N3 | Desktop : sidebar repliable + palette de commandes ⌘K / Ctrl+K. |
| P1 | Dashboard + Analytics + Insights → Vue d'ensemble ; le rapport hebdo devient une notification/un email. |
| P2 | UnifiedInbox → option « Tous les comptes » dans Mails. |
| P3 | SavedSearches → chips dans la barre de recherche de Mails. |
| P4 | Expiration → modèles de règles + action « expire dans X jours ». |
| P5 | Privacy : le tracking devient un comportement du lecteur (images distantes bloquées par défaut) ; scan PII abandonné ; chiffrement masqué tant qu'il n'est pas complet (décision en attente, §10). |
| P6 | OpsResilience éclaté : import/export → Paramètres > Données ; rétention utilisateur → Archives ; quota API → Admin. |
| P7 | Sharing → action « Partager » dans le lecteur d'archive. |
| P8 | Duplicates : déjà supprimé. |
| M1 | Mobile : CHAQUE tableau est une liste de cartes (titre/sous-titre/méta/menu) ; tap → détail plein écran ou bottom sheet ; desktop = data table (tri, sélection, visibilité des colonnes). |
| M2 | Un seul composant `<DataList>`/`<ResponsiveTable>` sur TanStack Table v9, rendant `<tr>` (≥md) ou cartes (<md) depuis la même instance ; chaque colonne déclare son rôle mobile (`title`/`subtitle`/`meta`/`hidden`). |
| D1 | Undo = vrai délai : les actions de masse sont mises en file avec un délai de 10 s côté serveur (job BullMQ différé) ; toast « Suppression dans 10 s — Annuler » qui annule le job. |
| D2 | Dialogue de confirmation UNIQUEMENT pour les actions définitives (suppression définitive d'archives, désabonnement) ; corbeille Gmail = pas de dialogue. |
| D3 | Désabonnement sans en-tête List-Unsubscribe = bouton désactivé avec explication. |
| D4 | Recherche plein texte des archives sur le corps = migration Postgres FTS (colonne texte du corps + tsvector + surlignage `ts_headline`). |
| D5 | La barre mobile garde Archives. |
| D6 | Compteurs de la sidebar en temps réel via SSE. |
| D7 | Admin = page dédiée. |
| I1 | UI optimiste ; skeletons, pas de spinners ; états vides avec une action ; progression de job inline là où il a été lancé. |
| I2 | « Sélectionner les ~N résultats » = sélection côté serveur par requête. |
| I3 | Règles créables depuis le contexte (mail, expéditeur, recherche) avec nombre en aperçu + mails exemples. |
| I4 | Images distantes bloquées dans les lecteurs, bouton « Afficher ». |
| I5 | Libellés d'action : « Sauvegarder sur le NAS » vs « Archiver (retirer de la boîte) ». |
| L1 | Notion unique « Libellés » = libellés Gmail, couleurs Gmail comprises, synchronisés dans une table par compte `gmail_labels` (id, name, color, type) pour que les archives affichent les noms même après suppression du libellé. |
| L2 | Catégories Gmail traduites et colorées (Promotions, Réseaux sociaux, Mises à jour, Forums). |
| L3 | Arbre de libellés + filtres dans Archives. |
| L4 | L'import garde `X-Gmail-Labels` des mbox Takeout. |
| L5 | Les catégories d'Expiration deviennent des modèles de règles ; nouveaux modèles « Factures », « Livraisons », « Banque », « Billets & voyages », « OTP (expire après 1 jour) » qui créent libellé + règle en un clic. |
| L6 | Libellé de la politique de rétention = Select des vrais libellés (corrige le bug actuel de texte libre). |
| A1 | Cible RGAA 4.1 / WCAG 2.1 AA (+ taille de cible WCAG 2.2) : cibles tactiles ≥ 44 px, focus visible, vrais boutons/liens/labels, `aria-label` sur les boutons icône, contraste AA sur chaque paire de tokens, `prefers-reduced-motion`, `prefers-color-scheme`, safe-area insets (PWA, vite-plugin-pwa déjà en place). |

Règles de spec ajoutées ici (non négociées, modifiables) : R1 `--input` renforcé (§4.1), R2 `LabelBadge` = pastille + texte `foreground` (§5.2), R3 raccourcis « G puis X » désactivables (WCAG 2.1.4).

---

## 3. Architecture de l'information

### 3.1 Navigation

| Entrée | Route | Icône (lucide) | Compteur sidebar (SSE, D6) | Desktop | Barre mobile |
|---|---|---|---|---|---|
| Vue d'ensemble | `/overview` | `layout-dashboard` | — | sidebar | ✔ |
| Mails | `/mails` | `inbox` | nb mails du compte (`48 212`) | sidebar | ✔ |
| Nettoyage | `/cleanup` | `brush-cleaning` | volume récupérable (`6,1 Go`, badge accent) | sidebar | ✔ |
| Règles | `/rules` | `zap` | nb règles actives | sidebar | Plus |
| Archives | `/archives` | `archive` | — | sidebar | ✔ |
| Activité | `/activity` | `activity` | jobs en cours (`1 en cours`, badge accent) | sidebar | Plus |
| Paramètres | `/settings/:section?` | `sliders-horizontal` | — | sidebar | Plus |
| Admin | `/admin` | `shield` | — | sidebar, groupe « Administration », si `role=admin` | Plus, si admin |

- Sidebar desktop (prototype) : 240 px, fond `--sidebar`, en-tête logo + bouton « Réduire la barre latérale », sélecteur de compte, bouton « Rechercher… ⌘K », nav, pied = progression de la sauvegarde NAS en cours (JobProgressInline compact). Repliée = icônes seules + tooltip (mode `collapsible="icon"` du composant shadcn `sidebar`).
- Barre mobile : 5 items `min-height: 52px`, padding bas `max(22px, env(safe-area-inset-bottom))`. « Plus » ouvre une bottom sheet (Drawer) listant Règles, Activité, Paramètres, Admin + compteurs.
- En-tête de page : fil d'Ariane (desktop), titre, actions primaires ; mobile : titre 26 px + bouton compte (avatar) à droite.
- Raccourcis (prototype) : `⌘K`/`Ctrl+K` palette ; `G puis O/M/N/R/A/T/P` = Vue d'ensemble/Mails/Nettoyage/Règles/Archives/Activité/Paramètres (R3 : interrupteur « Raccourcis clavier à une touche » dans Paramètres > Affichage).

### 3.2 Pages → sections

| Page | Sections |
|---|---|
| Vue d'ensemble | Salutation + compte/sync · 4 KPI cliquables (Mails dans Gmail + quota, Récupérable, Sauvegarde NAS %, Règles actives) · Top encombreurs · Suggestions (actions inline) · Sauvegarde/jobs en cours |
| Mails | Sélecteur de compte (dont « Tous les comptes ») · barre de recherche à jetons + chips de recherches enregistrées · liste/table · barre d'actions de sélection · lecteur |
| Nettoyage | Onglets « Expéditeurs & newsletters » / « Gros mails & pièces jointes » · tri (Nombre de mails, Taille, Jamais ouverts) · filtre « Newsletters uniquement (List-Unsubscribe) » · progression inline par ligne |
| Règles | Mes règles · Modèles (dont ex-Expiration, L5) · sheet de création/édition avec aperçu |
| Archives | Bandeau état de sauvegarde + couverture · arbre de libellés (L3) · recherche plein texte (D4) + filtres · résultats surlignés · lecteur d'archive (Partager, Restaurer, Supprimer définitivement) · onglets secondaires Corbeille, Rétention |
| Activité | Jobs en cours · Historique des jobs · Journal d'audit |
| Paramètres | Comptes · Profil & sécurité · Notifications · Affichage · Données |
| Admin | Statistiques · Utilisateurs · Jobs (tous) · Quota API · Pièces jointes dédupliquées |

### 3.3 Devenir des pages actuelles et redirections

Toutes les anciennes routes restent en `<Navigate replace>` pendant au moins une release (marque-pages, notifications, e2e).

| Ancienne route (page) | Nouvelle destination | Redirection |
|---|---|---|
| `/` | Vue d'ensemble | `/overview` |
| `/dashboard` (Dashboard) | Vue d'ensemble | `/overview` |
| `/analytics` (heatmap, scores, suggestions, inbox zero) | Vue d'ensemble (suggestions, top encombreurs) + Nettoyage (scores expéditeurs) | `/overview` |
| `/insights` (rapport hebdo) | notification / email (P1) | `/overview` |
| `/mails` (MailManager) | Mails | — |
| `/unified` (UnifiedInbox) | Mails, compte = tous | `/mails?account=all` |
| `/saved-searches` | chips de Mails | `/mails` |
| `/unsubscribe` | Nettoyage > Expéditeurs | `/cleanup?tab=senders` |
| `/attachments` | Nettoyage > Gros mails & PJ | `/cleanup?tab=large` |
| `/rules` | Règles | — |
| `/expiration` | Règles > Modèles | `/rules?tab=templates` |
| `/archive` | Archives | `/archives` |
| `/sharing` | lecteur d'archive « Partager » + liste des liens actifs dans Paramètres > Profil & sécurité | `/settings/security` |
| `/privacy` | Paramètres > Affichage (images distantes) | `/settings/display` |
| `/ops` | Données / Rétention / Quota | `/settings/data` |
| `/jobs` | Activité | `/activity` |
| `/settings` | Paramètres | `/settings/accounts` |
| `/admin` | Admin | — |
| `/login`, `/shared/:token` | inchangées (composants migrés) | — |

État d'URL : filtres, onglet, compte, requête et page sont dans la query string (`?q=&account=&tab=&page=`) pour partage et retour arrière ; la sélection ne l'est pas.

---

## 4. Design tokens

Extraits des `<style>` du prototype (`.nid` / `.nid.dark`). Police : **Geist** (texte), **Geist Mono** (chiffres, tailles, requêtes, kbd) ; fallback `ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif`. Polices auto-hébergées (`@fontsource-variable/geist`, `@fontsource-variable/geist-mono`) — pas de CDN (self-hosted, PWA hors ligne).

### 4.1 Couleurs (prototype → variables shadcn)

Le `--accent` du prototype est le bleu de marque = `--primary` shadcn ; le `--accent` shadcn (fond de survol) = `--muted` du prototype.

| Rôle | Proto | Variable shadcn / app | Clair | Sombre |
|---|---|---|---|---|
| Fond | `--bg` | `--background` | `#ffffff` | `#09090b` |
| Texte | `--fg` | `--foreground`, `--card-foreground`, `--popover-foreground` | `#09090b` | `#fafafa` |
| Surface carte | `--card` | `--card`, `--popover` | `#ffffff` | `#111113` |
| Surface atténuée | `--muted` | `--muted`, `--secondary`, `--accent`, `--sidebar` | `#f4f4f5` | `#1c1c1f` |
| Texte secondaire | `--mfg` | `--muted-foreground` | `#52525b` | `#a1a1aa` |
| Bordure décorative | `--border` | `--border`, `--sidebar-border` | `#e4e4e7` | `#27272a` |
| Bordure de champ (R1) | — | `--input` | `#71717a` | `#71717a` |
| Marque | `--accent` | `--primary`, `--sidebar-primary` | `#2563eb` | `#2563eb` |
| Texte sur marque | `--accent-fg` | `--primary-foreground` | `#ffffff` | `#ffffff` |
| Fond marque doux | `--accent-soft` | `--primary-soft` (app) | `#eff6ff` | `#172554` |
| Lien / texte marque | `--accent-text` | `--primary-text` (app) | `#1d4ed8` | `#93c5fd` |
| Focus | `--ring` | `--ring`, `--sidebar-ring` | `#2563eb` | `#60a5fa` |
| Danger | `--danger` | `--destructive` | `#b91c1c` | `#f87171` |
| Danger doux | `--danger-soft` | `--destructive-soft` (app) | `#fef2f2` | `#450a0a` * |
| Succès | `--ok` | `--success` (app) | `#15803d` | `#4ade80` * |
| Succès doux | `--ok-soft` | `--success-soft` (app) | `#f0fdf4` | `#052e16` * |
| Avertissement | `--warn` | `--warning` (app) | `#854d0e` ** | `#fde047` * |
| Avertissement doux | `--warn-soft` / `--warn-border` | `--warning-soft` / `--warning-border` (app) | `#fefce8` / `#fde68a` | `#422006` / `#854d0e` * |
| Surlignage recherche | `--hl` | `--highlight` (+ texte forcé `#09090b`) | `#fef08a` | `#fef08a` |
| Toast | `--toast` / `--toast-fg` | `--toast` / `--toast-foreground` (app) | `#18181b` / `#fafafa` | `#fafafa` / `#09090b` |
| Voile modal | `--scrim` | `--scrim` (app) | `rgba(9,9,11,.45)` | `rgba(0,0,0,.6)` |
| Progression | `.bar span` | `--progress` (app) | `#2563eb` | `#60a5fa` * |
| Avatar | inline | `--avatar` / `--avatar-foreground` (app) | `#dbeafe` / `#1e3a8a` | `#1e3a8a` / `#dbeafe` |

\* absent du prototype, proposé ici (contraste vérifié). ** le prototype utilise `#a16207` (Mails) et `#854d0e` (lecteur) : unifié sur `#854d0e`.

Catégories Gmail (L2, pastilles, proposé) : Promotions `#16a34a`, Réseaux sociaux `#2563eb`, Mises à jour `#d97706`, Forums `#7c3aed` ; libellé texte toujours en `--foreground`.

### 4.2 Contrastes calculés (WCAG 2.x, luminance relative)

| Paire | Clair | Sombre | Seuil | Verdict |
|---|---|---|---|---|
| foreground / background | 19,90 | 19,06 | 4,5 | ✔ |
| muted-foreground / background | 7,73 | 7,76 | 4,5 | ✔ |
| muted-foreground / muted | 7,03 | 6,63 | 4,5 | ✔ |
| muted-foreground / card (sombre) | — | 7,36 | 4,5 | ✔ |
| primary-foreground / primary | 5,17 | 5,17 | 4,5 | ✔ |
| primary-text / primary-soft | 6,16 | 8,15 | 4,5 | ✔ |
| primary-text / background (liens) | 6,70 | 11,03 | 4,5 | ✔ |
| destructive / background | 6,47 | 7,19 | 4,5 | ✔ |
| destructive / destructive-soft | 5,91 | 5,84 | 4,5 | ✔ |
| success / success-soft | 4,79 | 8,55 | 4,5 | ✔ (clair juste) |
| warning / warning-soft | 6,62 | 11,06 | 4,5 | ✔ |
| toast-foreground / toast | 16,97 | 19,06 | 4,5 | ✔ |
| #09090b / highlight | 17,10 | 17,10 | 4,5 | ✔ |
| avatar-foreground / avatar | 8,49 | 8,49 | 4,5 | ✔ |
| ring / background (focus) | 5,17 | 7,83 | 3 | ✔ |
| input / background (R1) | 4,83 | 4,12 | 3 | ✔ |
| border / background | 1,27 | 1,34 | 3 | ✘ → réservé aux séparateurs et contours de cartes (non porteurs d'info, 1.4.11 non applicable) ; jamais seul contour d'un contrôle |
| progress / border (piste) | 4,07 | 5,86 | 3 | ✔ (avec `#60a5fa` en sombre ; `#2563eb` donnerait 2,88 ✘) |

Interdits : `#a1a1aa` sur blanc (2,56) et `#52525b` sur fond sombre (2,57) pour du texte ; placeholder = `--muted-foreground`.

### 4.3 Typographie

| Token | Taille / interligne | Graisse | Usage |
|---|---|---|---|
| `text-2xs` | 11 px | 500 | kbd, labels barre mobile (prototype ; proposé 12 px, §10) |
| `text-xs` | 12 / 16 px | 500 | badges, en-têtes de colonnes, méta |
| `text-sm` | 13 / 18 px | 400–500 | méta, snippets desktop, chips desktop |
| `text-base` | 14 / 1.45 (desktop), 15 / 1.4 (mobile) | 400 | corps |
| `text-md` | 16 px | 500 | items de sheet, champs mobile (≥ 16 px : évite le zoom iOS) |
| `text-lg` | 18 px | 600 | titres de sheet |
| `text-xl` | 21–22 px | 600 | sujet du mail (lecteur) |
| `text-2xl` | 24 px desktop / 26 px mobile | 600, `letter-spacing: -0.02em` | H1 de page |
| `text-kpi` | 28 px desktop / 24 px mobile | 600, mono | valeurs KPI |

Chiffres : `font-variant-numeric: tabular-nums` + Geist Mono pour compteurs, tailles, dates en colonne. Formats via `Intl.NumberFormat`/`Intl.DateTimeFormat` de la langue i18next (« 48 212 », « 6,1 Go », « 3 oct. »).

### 4.4 Espacements, tailles, rayons, ombres, mouvement

| Catégorie | Valeurs |
|---|---|
| Espacement | base 4 px (échelle Tailwind par défaut) ; gouttière mobile 16 px ; padding page desktop 24 px ; sidebar 240 px |
| Hauteurs | bouton 36 px (desktop), `sm` 32 px, icône 36×36 ; input 36 px desktop / 44 px mobile ; chip 32 px desktop / 36 px mobile ; option palette, item, radio ≥ 44–48 px ; item de sheet 52 px ; action barre lecteur 56 px ; item barre mobile 52 px |
| Cibles | toute cible tactile < md : ≥ 44×44 px (zone cliquable, padding ou `::after`) ; desktop ≥ 24×24 (WCAG 2.5.8) |
| Rayons | `--radius: 0.625rem` (10 px) → `rounded-lg` 10 (cartes), `rounded-md` 8 (boutons, champs), `rounded-sm` 6 (jetons) ; 12 px sheets/cartes mobiles ; 999 px badges/chips/avatars ; 4–5 px kbd |
| Ombres | `--shadow-ring: 0 0 0 1px var(--border)` (nav active) ; `--shadow-xs: 0 1px 2px rgba(0,0,0,.08)` ; `--shadow-popover: 0 10px 30px rgba(0,0,0,.18)` (sombre `.4`) ; `--shadow-dialog: 0 24px 60px rgba(0,0,0,.25)` ; `--shadow-sheet: 0 -4px 16px rgba(0,0,0,.06)` |
| Mouvement | undo : barre `drain` 10 s linéaire ; skeleton : shimmer 1,4 s ease-in-out infini ; sheets/dialogs : 200 ms ease-out (proposé) ; sous `prefers-reduced-motion: reduce` : shimmer et `drain` désactivés (compte à rebours textuel conservé), transitions ≤ 1 ms |
| Focus | `outline: 2px solid var(--ring); outline-offset: 2px` sur `:focus-visible` (champs : `focus-within`, offset 1 px) |

### 4.5 Implémentation Tailwind v4

`frontend/src/index.css` (structure générée par `shadcn init`, valeurs ci-dessus) :

```css
@import "tailwindcss";
@import "tw-animate-css";
@import "shadcn/tailwind.css";
@custom-variant dark (&:is(.dark *));

:root { --radius: 0.625rem; --background: #ffffff; /* … tableau 4.1 … */ }
.dark { --background: #09090b; /* … */ }

@theme inline {
  --color-background: var(--background);  /* + toutes les variables shadcn standard */
  --color-primary-soft: var(--primary-soft);
  --color-primary-text: var(--primary-text);
  --color-success: var(--success);  --color-success-soft: var(--success-soft);
  --color-warning: var(--warning);  --color-warning-soft: var(--warning-soft);
  --color-destructive-soft: var(--destructive-soft);
  --color-highlight: var(--highlight);  --color-progress: var(--progress);
  --font-sans: "Geist Variable", ui-sans-serif, system-ui, sans-serif;
  --font-mono: "Geist Mono Variable", ui-monospace, monospace;
}
```

- Thème : classe `.dark` sur `<html>` pilotée par le store `theme` existant ; valeur `system` = `matchMedia('(prefers-color-scheme: dark)')`. Mettre à jour `<meta name="theme-color">` (clair `#ffffff`, sombre `#09090b`).
- Les valeurs restent en hex (pas de conversion OKLCH) pour rester traçables au prototype.

---

## 5. Composants

### 5.1 shadcn à ajouter (CLI)

```bash
cd frontend
npx shadcn@latest init --base radix          # Vite existant : alias @/ + @tailwindcss/vite requis avant
npx shadcn@latest add sidebar sheet drawer dialog alert-dialog command sonner \
  button badge card checkbox dropdown-menu input input-group select tabs tooltip \
  skeleton progress table empty field label radio-group switch separator \
  scroll-area popover kbd item avatar toggle-group breadcrumb pagination chart
```

Notes vérifiées : `sidebar` tire `sheet`, `skeleton`, `tooltip` et le hook `use-mobile` ; `command` dépend de `cmdk` ; `sonner` généré importe `next-themes` → remplacer par le store `theme` (pas de dépendance `next-themes`) ; `chart` = Recharts (remplace `@ant-design/charts`) ; « data table » n'est pas un composant du registre mais un guide : on construit `DataList` sur `table` + TanStack Table.

### 5.2 Composants applicatifs (`frontend/src/components/app/`)

| Composant | Responsabilité | Props (esquisse) | A11y |
|---|---|---|---|
| `AppShell` | Layout : `SidebarProvider` + `Sidebar` (≥md) / `BottomNav` (<md), `<main id="main">`, `Toaster`, `CommandPalette`, lien d'évitement | `children` | lien « Aller au contenu » 1er focusable ; landmarks `nav`/`main` ; `lang` suit i18next |
| `AppSidebar` | Nav N1, sélecteur de compte, bouton palette, compteurs SSE, job en cours en pied | — (lit stores + `useCounters()`) | `nav aria-label="Navigation principale"`, `aria-current="page"` ; compteurs dans le nom accessible (« Nettoyage, 6,1 Go récupérables ») ; repliée : tooltip + `aria-label` |
| `BottomNav` | 5 items N2 + sheet « Plus » | — | `nav` ; items ≥ 52 px ; « Plus » = `button aria-haspopup="dialog"` ; `padding-bottom: env(safe-area-inset-bottom)` |
| `CommandPalette` | ⌘K : Aller à, actions contextuelles (« Créer une règle pour X », « Rechercher from:… dans les mails », « Rechercher « … » dans les archives »), expéditeurs, recherches enregistrées | `open`, `onOpenChange` | `CommandDialog` (combobox/listbox gérés par cmdk) ; titre caché ; `Échap` ferme ; retour du focus |
| `PageHeader` | Fil d'Ariane (desktop), H1, sous-titre, actions | `title`, `description?`, `actions?`, `breadcrumb?` | un seul `h1` par page ; actions secondaires dans un `DropdownMenu` < md |
| `DataList<T>` (= `ResponsiveTable`) | Rend une instance TanStack Table en `<table>` (≥md) ou cartes (<md) ; tri, sélection, visibilité des colonnes, pagination serveur, skeleton, vide, erreur | `table`, `isLoading`, `error`, `empty: ReactNode`, `onRowOpen(row)`, `rowLabel(row)` | table : `<th scope="col">`, `aria-sort` ; cartes : `role="list"`/`listitem`, carte = lien/bouton unique + checkbox et menu séparés (pas de boutons imbriqués) ; nom de checkbox = `rowLabel` |
| `BulkActionBar` | Barre des actions sur la sélection + bannière select-all (I2) | `count`, `total?`, `mode: 'ids'\|'query'`, `actions: Action[]`, `onSelectAll`, `onClear` | `role="toolbar" aria-label="Actions sur la sélection"` ; compteur en `aria-live="polite"` ; desktop : barre au-dessus de la table, mobile : barre basse au-dessus de la safe area |
| `UndoToast` | Toast D1 : libellé, compte à rebours 10 s, bouton Annuler → annule le job différé | `jobId`, `message`, `delayMs=10000` | toast `aria-live="polite"` ; bouton « Annuler » atteignable au clavier (raccourci sonner `Alt+T`) ; pas de fermeture auto avant l'échéance ; barre `drain` décorative (`aria-hidden`) |
| `ConfirmDialog` | D2 uniquement : action définitive | `title`, `description`, `confirmLabel`, `onConfirm`, `destructive` | `AlertDialog` ; focus initial sur « Annuler » ; libellé = verbe explicite (« Supprimer définitivement 12 archives ») |
| `MailCard` | Carte mobile d'un mail (avatar, expéditeur, objet, snippet, libellés, taille, date, PJ) | `mail`, `selected`, `onOpen`, `onToggle` | ≥ 44 px ; non lu = graisse 600 + texte « non lu » caché |
| `MailViewer` | Lecteur Gmail + archive : en-tête, bandeau expéditeur (« 214 mails de cet expéditeur… Nettoyer »), images distantes bloquées (I4), corps en iframe `sandbox`, barre d'actions | `source: 'gmail'\|'archive'`, `mailId`, `accountId`, `onClose` | iframe `title` ; images bloquées : placeholder avec `alt` ; `role="toolbar" aria-label="Actions sur ce mail"` ; mobile plein écran, desktop sheet latérale droite |
| `LabelBadge` | Libellé Gmail / catégorie (L1, L2) | `label: {name, color?, type}` | R2 : pastille couleur (`aria-hidden`) + texte `--foreground` → AA quelle que soit la couleur Gmail |
| `LabelTree` | Arbre de libellés avec compteurs (Archives, L3) | `labels`, `value`, `onChange` | `role="tree"`/`treeitem`, flèches clavier ; < md : sheet de filtres |
| `SearchBar` | Recherche Gmail à jetons (`category:promotions` ×), chips de recherches enregistrées (P3), « Enregistrer la recherche » | `value`, `onChange`, `saved`, `onSave` | `input` labellisé ; jetons = boutons « Retirer le filtre … » ; chips = `toggle-group` |
| `EmptyState` | Vide avec action (I1) | `icon`, `title`, `description`, `action` | basé sur `empty` ; action = vrai bouton/lien |
| `JobProgressInline` | Progression d'un job à l'endroit du lancement (ligne, carte, pied de sidebar) | `jobId`, `label`, `onDone?`, `compact?` | `role="progressbar"` + `aria-valuenow` + `aria-label` ; texte « 1 240 / 2 410 » visible ; fin annoncée en `aria-live` |
| `KpiCard` | KPI cliquable (Vue d'ensemble) | `label`, `value`, `hint`, `to`, `progress?` | carte entière = un lien, nom accessible = label + valeur |
| `RuleSheet` | Création/édition de règle depuis le contexte (I3) | `prefill: {from?, query?, labelId?}`, `ruleId?` | `Sheet` (desktop droite) / `Drawer` (mobile bas) ; `fieldset`/`legend` pour « Alors » ; aperçu en `aria-live` |
| `AccountSwitcher` | Compte courant + « Tous les comptes » (P2) | `value`, `onChange`, `allowAll` | `Select` labellisé « Compte Gmail » |

---

## 6. Patterns

### 6.1 Liste responsive (M1, M2)

- Une instance `useTable` par écran ; `DataList` choisit le rendu via `useIsMobile()` (hook `use-mobile` de shadcn, seuil `md` = 768 px).
- Features v9 : `tableFeatures({ rowSelectionFeature, rowSortingFeature, columnVisibilityFeature, rowPaginationFeature, columnMeta: metaHelper<NidColumnMeta>() })` ; `useTable({ features, columns, data, getRowId, manualSorting: true, manualPagination: true, rowCount })` ; rendu des cellules via `table.FlexRender`.
- `type NidColumnMeta = { mobile: 'title' | 'subtitle' | 'meta' | 'hidden' | 'leading' | 'menu'; align?: 'start' | 'end' }` (`leading` = avatar/checkbox, `menu` = actions).
- Carte : ligne 1 `title` + `meta` alignée à droite (date), ligne 2 `subtitle` (2 lignes max), ligne 3 autres `meta` (badges, taille) ; menu `⋯` à droite.
- Tap carte → détail plein écran (mail, archive) ou bottom sheet (expéditeur, règle, job). Appui long ou checkbox → mode sélection (prototype 3 : barre haute « Quitter la sélection », barre basse Archiver / NAS / Règle / Supprimer / Plus).
- Desktop : pagination « Lignes par page 50/100 · Page 1 sur N » ; mobile : bouton « Afficher plus » (`useInfiniteQuery`, `initialPageParam`, `getNextPageParam` = `nextPageToken`). Pas de scroll infini automatique.
- Visibilité des colonnes persistée par table dans `localStorage` (try/catch).

### 6.2 Sheets & dialogs

| Besoin | Desktop | Mobile |
|---|---|---|
| Détail d'objet (mail, archive) | `Sheet` latérale droite (≥ 560 px) | page plein écran (route dédiée, bouton retour) |
| Formulaire court (règle, partage, webhook) | `Sheet` droite | `Drawer` bas, poignée, max 90 dvh |
| Choix d'action (menu « Plus », actions ligne) | `DropdownMenu` | `Drawer` avec items 52 px |
| Action définitive (D2) | `AlertDialog` | `AlertDialog` |

Règles : focus piégé, `Échap` ferme, focus rendu au déclencheur ; titre obligatoire (`SheetTitle`/`DrawerTitle`, caché visuellement si besoin) ; fermeture par bouton « Fermer » explicite (`aria-label`).

### 6.3 Annuler vs confirmer

| Action | Mécanisme |
|---|---|
| Corbeille Gmail, archiver (retirer de la boîte), marquer lu/non lu, libellé, sauvegarder sur le NAS, « Tout supprimer » d'un expéditeur | D1 : job différé 10 s + `UndoToast` ; UI optimiste immédiate, rollback à l'annulation |
| Exécuter une règle sur l'existant | D1 (même mécanisme) |
| Suppression définitive d'archives, vider la corbeille d'archives, se désabonner | D2 : `ConfirmDialog` |
| Supprimer une règle, un webhook, un lien de partage, déconnecter un compte | toast avec « Annuler » (restauration client) ; déconnexion compte = `ConfirmDialog` (perte d'accès) |
| Désabonnement sans `List-Unsubscribe` | D3 : bouton désactivé (`aria-disabled` + tooltip/texte « Cet expéditeur ne propose pas de désabonnement automatique ») ; « Tout supprimer » et « Toujours faire ça » restent actifs |

Texte du toast : « {N} mails mis à la corbeille dans 10 s — Annuler ». Après échéance : toast de résultat avec lien « Voir dans Activité ».

### 6.4 Sélection & « tous les résultats » (I2)

1. Checkbox d'en-tête = page courante (`table.toggleAllPageRowsSelected`).
2. Si page entière sélectionnée et `estimatedCount > pageSize` : bannière « Les 50 mails de cette page sont sélectionnés. **Sélectionner les ~12 431 résultats de la recherche** ».
3. Mode `query` : la sélection = `{ accountId, query }` ; les actions envoient la requête, pas d'ids (B5). Le compteur affiche « ~12 431 » (estimation Gmail).
4. Changer la requête vide la sélection.

### 6.5 Chargement / vide / erreur

- Chargement : `Skeleton` à la forme du contenu (lignes de table, cartes, KPI) ; jamais de spinner pleine page (le `Spinner` reste toléré dans un bouton en cours d'envoi).
- Vide : `EmptyState` avec action pertinente (« Aucun mail ne correspond — Effacer les filtres », « Aucune règle — Partir d'un modèle »).
- Erreur : `Alert` destructive inline avec « Réessayer » (`refetch`) ; erreurs de mutation → toast + rollback optimiste (`onMutate` snapshot / `onError` restore / `onSettled` invalidate).
- React Query : `staleTime` 5 min et `retry: 1` conservés ; clés via `queryKeys` existant.

### 6.6 Progression des jobs

- Le lanceur affiche `JobProgressInline` à l'endroit de l'action (ligne d'expéditeur dans Nettoyage, bandeau Archives, carte de règle) via `useJobSSE(jobId)` existant ; bouton « Arrêter » = `DELETE /api/jobs/:id`.
- Fin : état final inline (« Désabonné · 640 mails supprimés · Annuler » si réversible) + notification.
- Le `JobProgressModal` actuel est supprimé ; Activité liste tous les jobs.

### 6.7 Images distantes (I4, P5)

- HTML du mail rendu dans `<iframe sandbox srcdoc>` (pas de scripts) ; avant injection : `img[src^=http]`, `srcset`, `background` CSS distants remplacés par un placeholder (dimensions conservées, `alt` d'origine + « (image bloquée) »).
- Bandeau `--warning-soft` « Images distantes bloquées — Afficher » ; « Toujours afficher pour cet expéditeur » (préférence par expéditeur, stockée côté serveur avec les préférences utilisateur).
- Pixels de suivi détectés (1×1, domaines connus) : jamais chargés, mention « 1 pixel de suivi bloqué ».

### 6.8 Formulaires

- `Field` + `Label` visibles (pas de placeholder seul) ; erreurs liées (`aria-describedby`, `aria-invalid`), message texte + icône (pas la couleur seule).
- Validation client avec les mêmes contraintes que les schémas Zod du backend ; erreurs serveur affichées sur le champ concerné.
- Mobile : champs 44 px, `font-size ≥ 16px`, `inputmode`/`autocomplete` adaptés ; bouton principal collé en bas de sheet.
- Groupes de radios en cartes (prototype RuleSheet : `min-height 48px`, état coché `--primary-soft` + bordure `--primary`).

---

## 7. Écrans par page

Endpoints : existants (`frontend/src/api/index.ts`) ; **nouveaux** en gras (détail §8).

### 7.1 Vue d'ensemble (`/overview`) — artboards 9, 10

- **But** : état du compte en 5 s et la prochaine action utile.
- **Sections** : salutation + compte/sync ; KPI : Mails dans Gmail (quota Google), Récupérable (→ Nettoyage), Sauvegarde NAS % (→ Archives), Règles actives (→ Règles, « 1 284 mails traités ces 30 derniers jours ») ; Top encombreurs (barres, → Nettoyage) ; Suggestions (« LinkedIn vous a envoyé 3 812 mails… » : Se désabonner et nettoyer / Toujours faire ça / Ignorer) ; jobs en cours.
- **Desktop** : grille 4 KPI + 2 colonnes (Top encombreurs | Suggestions). **Mobile** : KPI 2×2, sections empilées, « Tout voir ».
- **Données** : `GET /api/dashboard/:id/stats`, `/archive-stats`, `GET /api/quota/:id` (usage stockage) ou stats existantes, `GET /api/analytics/:id/cleanup-suggestions`, `PATCH /api/analytics/suggestions/:id/dismiss`, `GET /api/analytics/:id/sender-scores`, `GET /api/jobs?status=active`.
- **Nouveau** : **stats de règles sur 30 j** (agrégat jobs `run_rule`, S) ; heatmap et inbox-zero non repris (§10).

### 7.2 Mails (`/mails`) — artboards 1–4, 13

- **But** : voir, filtrer, agir en masse, annuler.
- **Sections** : en-tête (fil d'Ariane, « Synchronisé il y a 3 min », Synchroniser) ; résumé « 48 212 mails · 6,4 Go » ; chips (Tous, Promotions > 6 mois, Non lus, Gros mails > 10 Mo, Factures, Newsletters, + « Enregistrer la recherche ») ; `SearchBar` à jetons ; Filtres, Colonnes ; table (Expéditeur, Objet+snippet, Libellés, Taille, Date, Actions) ; `BulkActionBar` (Archiver (retirer de la boîte), Sauvegarder sur le NAS, Marquer comme lu, Créer une règle, Supprimer) ; pagination.
- **Mobile** : titre + compte, recherche, chips défilants, `MailCard`, mode sélection (artboard 3), lecteur plein écran (artboard 4) avec barre Supprimer / Sauver NAS / Créer une règle / Plus.
- **Compte « Tous les comptes »** (P2) : colonne Compte (couleur d'avatar par compte), actions groupées par compte côté client.
- **Données** : `GET /api/gmail/:id/messages`, `POST …/messages/batch`, `GET …/messages/:mid/full`, `POST …/messages/bulk`, `GET/POST /api/gmail/:id/labels`, `GET /api/unified/messages`, `GET/POST/PUT/DELETE /api/saved-searches`, `PUT /api/saved-searches/reorder`, `POST /api/archive/:id/archive`.
- **Nouveau** : **`bulk` avec `delayMs` + `{query}`** (B1, B5) ; **compteurs SSE** (B3) ; **libellés résolus via `gmail_labels`** (B4).

### 7.3 Nettoyage (`/cleanup`) — artboards 5, 6

- **But** : récupérer de l'espace en peu de gestes.
- **Sections** : phrase-résumé (« 6,1 Go récupérables. Les 8 premiers expéditeurs pèsent 4,6 Go. ») ; onglets **Expéditeurs & newsletters** / **Gros mails & pièces jointes** (avec volume) ; tri (Nombre de mails, Taille, Jamais ouverts) ; filtre « Newsletters uniquement (List-Unsubscribe) » ; ligne expéditeur : avatar, nom/email, mails, taille, jamais ouverts, actions (Se désabonner et nettoyer, Tout supprimer, Toujours faire ça → `RuleSheet` pré-rempli) ; progression inline (« Désabonnement fait · nettoyage… 1 240 / 2 410 · Arrêter ») ; lien « Voir les N règles suggérées ».
- **Gros mails & PJ** : liste triée par taille, source Gmail / Archives (toggle), aperçu/téléchargement PJ, actions Sauvegarder sur le NAS puis supprimer / Supprimer.
- **Mobile** : onglets en `tablist`, cartes expéditeur, sheet d'actions.
- **Données** : `GET /api/unsubscribe/:id/newsletters`, `POST …/scan`, `GET …/newsletters/:sender/messages`, `POST …/newsletters/:sender/delete`, `GET /api/analytics/:id/sender-scores`, `GET /api/attachments/:id/live|archived`, URLs de téléchargement existantes.
- **Nouveau** : **`delete` d'expéditeur en job différé** (B1). D3 : pas de nouvel endpoint, désabonnement possible si `unsubscribeUrl` ou `unsubscribeMailto` non nul (déjà dans le payload).

### 7.4 Règles (`/rules`) — artboard 12

- **But** : automatiser ; créer une règle là où le besoin apparaît.
- **Sections** : onglet **Mes règles** (nom, conditions en clair, action, dernière exécution, mails traités, interrupteur actif, menu Exécuter/Modifier/Supprimer) ; onglet **Modèles** (ex-Expiration + L5, carte « Créer » en un clic) ; `RuleSheet` : « Quand un mail arrive de » (modifiable), « Et qu'il a plus de » (7 jours / 30 jours / 6 mois), « Alors » (Sauvegarder sur le NAS puis supprimer · Archiver (retirer de la boîte) · Supprimer · Appliquer un libellé · Expire dans X jours), « Appliquer aussi aux mails déjà reçus », aperçu « 143 mails concernés · 58 Mo » + 3 exemples + « Voir les 143 mails » (→ Mails avec la requête).
- **Points d'entrée contextuels** : lecteur de mail, ligne expéditeur (Nettoyage), barre de sélection et recherche (Mails), palette ⌘K, suggestions (Vue d'ensemble).
- **Données** : `GET/POST/PUT/DELETE /api/rules/:id[/…]`, `PATCH …/toggle`, `POST …/run`, `POST …/preview`, `GET /api/rules/templates`, `POST …/from-template`.
- **Nouveau** : **preview avec `samples` et `sizeBytes`** (B6) ; **modèles libellé+règle** et action « expire » (B8).

### 7.5 Archives (`/archives`) — artboards 7, 8

- **But** : copie locale consultable, même supprimée de Gmail.
- **Sections** : en-tête (« Exporter (.mbox) », « Sauvegarder sur le NAS maintenant ») ; bandeau état (« Dernière sauvegarde réussie il y a 2 h · 47 108 mails · 5,9 Go sur NAS… », Couverture 98 %, « Voir les 1 104 mails non sauvegardés ») ; `LabelTree` (Tous les mails, Boîte de réception, Envoyés, libellés imbriqués « Factures / EDF », Supprimés de Gmail) ; recherche plein texte (D4) + filtres (Expéditeur, Période, Avec pièce jointe, Taille, Présent dans Gmail) ; résultats : libellé, objet et extrait surlignés (`<mark>`), PJ, date, « Plus dans Gmail » ; « 38 résultats · 0,12 s ».
- **Lecteur d'archive** : `MailViewer source="archive"` + fil (threads), PJ, actions **Partager** (P7 : durée, lien copiable, révocation), Restaurer, Supprimer définitivement (D2).
- **Onglets secondaires** : **Corbeille** (liste, restaurer, vider = D2, réglages rétention/purge) ; **Rétention** (politiques, libellé = Select L6, exécuter).
- **Mobile** : recherche en tête, filtres en sheet, cartes résultat avec extrait 3 lignes.
- **Données** : `GET /api/archive/:id/mails[/:mid]`, `GET …/threads[/:tid]`, `POST …/archive`, `POST …/mails/trash|restore`, `GET|DELETE …/trash`, `GET|PUT /api/archive/config/trash`, `POST /api/import/:id/export-mbox`, `GET/POST/PUT/DELETE /api/retention`, `POST /api/retention/run`, `GET/POST/DELETE /api/shares`, `GET /api/integrity/check` (action « Vérifier l'intégrité »).
- **Nouveau** : **FTS corps + `highlight`** (B2) ; **`GET /api/labels/:id` + compteurs par libellé** (B4) ; **mails non sauvegardés / couverture** (S, si absent de `archive-stats`).

### 7.6 Activité (`/activity`) — artboard à venir

- **But** : ce qui tourne, ce qui a tourné, qui a fait quoi.
- **Sections** : En cours (progression live, Arrêter) ; Historique (type, statut, compte, début, durée, résultat, erreur dépliable) ; Journal d'audit (action, cible, date, détails) ; jobs différés D1 visibles avec « Annuler » jusqu'à l'échéance.
- **Mobile** : cartes, filtre statut en chips.
- **Données** : `GET /api/jobs`, `GET /api/jobs/:id`, `DELETE /api/jobs/:id`, SSE `GET /api/jobs/:id/events`, `GET /api/audit`, `GET /api/notifications` (cloche de l'en-tête conservée).
- **Nouveau** : statut **`scheduled`** (B1).

### 7.7 Paramètres (`/settings/:section`) — artboard à venir

| Section | Contenu (existant sauf mention) |
|---|---|
| `accounts` Comptes | comptes Gmail (connecter, synchro on/off, forcer la sauvegarde, déconnecter = ConfirmDialog), stockage d'archive |
| `security` Profil & sécurité | profil, 2FA (QR, code), **liens de partage actifs** (ex-Sharing, révoquer) |
| `notifications` Notifications | préférences in-app / webhook par événement (dont rapport hebdo, P1), webhooks (CRUD, test), ntfy |
| `display` Affichage | thème (système/clair/sombre), langue, images distantes (I4, par défaut bloquées), raccourcis à une touche (R3) |
| `data` Données | import mbox (Takeout, L4) / IMAP, export mbox, export/import de configuration |

- Desktop : nav secondaire à gauche ; mobile : liste de sections → page.
- Données : `/api/auth/2fa/*`, `/api/notifications/preferences`, `/api/webhooks*`, `/api/config/export|import`, `/api/import/:id/mbox|imap|export-mbox`, `/api/shares`.
- Chiffrement : masqué (P5, §10). Tracking/PII : supprimés de l'UI.

### 7.8 Admin (`/admin`, D7) — artboard à venir

- **Sections** : Statistiques (utilisateurs, comptes, stockage, jobs) ; Utilisateurs (rôle, actif, nb comptes, stockage, dernière connexion, modifier) ; Jobs (tous utilisateurs) ; Quota API (par compte : endpoint, unités, appels, par heure — ex-Ops) ; Pièces jointes dédupliquées (stats + backfill).
- **Données** : `GET /api/admin/stats|users|jobs`, `GET|PATCH /api/admin/users/:id`, `GET /api/quota/:id`, `GET /api/attachments/dedup-stats`, `POST /api/attachments/dedup-backfill`.
- Accès : `AdminRoute` existant ; entrée de nav absente pour les non-admins.

---

## 8. Prérequis backend

À livrer AVANT l'écran qui en dépend. Effort : S ≤ 1 j, M ≤ 3 j, L > 3 j.

| ID | Travail | Détail | Écrans | Effort |
|---|---|---|---|---|
| B1 | Jobs différés + annulation (D1) | `enqueueJob(type, payload, { delay })` (option BullMQ `delay`) ; `bulk` et `unsubscribe …/delete` acceptent `delayMs` (défaut 10 000) ; statut DB `scheduled` ; `DELETE /api/jobs/:id` existant appelle déjà `bullJob.remove()` → vérifier pour un job `delayed` + test ; réponse `{ jobId, runAt }` | Mails, Nettoyage, Règles | M |
| B2 | FTS sur le corps (D4) | migration : colonne `body_text` (texte brut extrait de l'EML : `text/plain` sinon HTML dépouillé, tronqué ~100 Ko) ; trigger `update_mail_search_vector` + poids `D` ; job de backfill par lots ; réponse de recherche avec `highlight` = `ts_headline('french', body_text, query, 'StartSel=<mark>,StopSel=</mark>,MaxFragments=2')` (échappement HTML avant, seules les balises `mark` autorisées) | Archives | L |
| B3 | Compteurs SSE (D6) | `GET /api/events` (flux utilisateur) : `counters` {mails, cleanupBytes, activeRules, activeJobs} + `job` (début/fin) ; publication Redis pub/sub à chaque fin de job/synchro ; heartbeat 30 s | Shell (sidebar, barre mobile) | M |
| B4 | Table `gmail_labels` (L1, L2) | migration `gmail_labels (gmail_account_id, id, name, color_bg, color_text, type: system\|user\|category\|imported, deleted_at)` ; sync à chaque synchro + `GET /api/labels/:accountId` avec compteurs archives ; jamais de suppression physique (noms conservés) ; noms des catégories traduits côté frontend | Mails, Archives, Règles, Rétention | M |
| B5 | Select-all par requête (I2) | `POST …/messages/bulk` accepte `{ query }` à la place de `messageIds` (XOR, Zod) ; le job pagine `messages.list` et traite par lots via le throttle existant ; plafond configurable + audit du nombre réel | Mails | M |
| B6 | Aperçu de règle (I3) | `POST /api/rules/:id/preview` renvoie en plus `samples` (5 : id, from, subject, date) et `sizeBytes` estimée (sur un échantillon) | Règles (`RuleSheet`) | S |
| B7 | Import `X-Gmail-Labels` (L4) | `import.service` (aujourd'hui `label_ids: []`) : lire l'en-tête, mapper noms → `gmail_labels` (créer `type=imported` si absent) | Paramètres > Données, Archives | S |
| B8 | Modèles libellé + règle (L5, P4) | modèles Factures, Livraisons, Banque, Billets & voyages, OTP (expire après 1 jour) + catégories ex-Expiration ; `from-template` crée le libellé Gmail si absent puis la règle ; action « expire dans X jours » = condition `older_than` + `trash` exécutée par le planificateur de règles ; migration des expirations existantes (§10) | Règles | M |
| B9 | Rétention par libellé (L6) | Zod : `label` doit exister dans `gmail_labels` du compte (id, plus de texte libre) | Archives > Rétention | S |
| B10 | Préférences lecteur (I4) | préférences utilisateur `remote_images: 'block'\|'allow'` + liste d'expéditeurs autorisés | Lecteurs, Paramètres | S |

Ordre : B1 → B5 → B3 → B4 → B6/B8/B9 → B2 → B7/B10. Chaque prérequis = PR backend séparée avec tests Vitest, puis `graphify update .`.

---

## 9. Plan de migration

### 9.1 Cohabitation antd / shadcn

- Routes déjà `lazy()` : chaque page est un chunk. Les pages migrées n'importent plus `antd` ; `ConfigProvider` + `AntApp` sortent de `main.tsx` vers un wrapper `<LegacyAntd>` appliqué route par route aux pages non migrées → antd n'est chargé que par elles.
- `AppShell` (shadcn) remplace `AppLayout` dès L0 pour toutes les pages (anciennes comprises).
- CSS : Tailwind preflight vs styles antd à valider en L0 (ordre des `@layer` ; à défaut, preflight limité jusqu'à L10). Critère : captures e2e des pages legacy inchangées.
- Contrôle CI : script `grep` interdisant `from 'antd'` dans les fichiers listés comme migrés.
- Ratchet a11y : les clés de `a11y-baseline.json` suivent les nouvelles routes ; une page fusionnée part de la somme des anciennes et doit descendre ; cible 0.

### 9.2 Lots (une PR chacun, dans l'ordre)

| Lot | Contenu | Dépend de | Critères de fin |
|---|---|---|---|
| L0 | Tailwind v4 + `shadcn init` + tokens §4 + polices + thème `.dark` ; `AppShell`, `AppSidebar`, `BottomNav`, `CommandPalette` (navigation seule) ; nouvelles routes + redirections §3.3 ; `LegacyAntd` | — | e2e smoke + a11y verts, aucune page legacy cassée, redirections testées |
| L1 | Composants app §5.2 (DataList, BulkActionBar, UndoToast, ConfirmDialog, EmptyState, PageHeader, JobProgressInline, LabelBadge, SearchBar) + tests Vitest | L0 | tests unitaires (table ↔ cartes depuis la même instance, rôles mobiles, a11y de base) |
| L2 | Backend B1 + B5 | — | tests backend, annulation d'un job différé testée |
| L3 | **Mails** (+ MailViewer, chips, « Tous les comptes ») ; suppression UnifiedInbox, SavedSearches, JobProgressModal | L1, L2 | e2e Mails desktop+mobile (sélection, select-all, undo) ; baseline `mails` en baisse ; 0 import antd |
| L4 | Backend B4, B9, B2 (migration + backfill) | — | tests ; backfill idempotent |
| L5 | **Archives** (arbre, FTS, lecteur, Partager, Corbeille, Rétention) ; suppression Sharing, Archive | L1, L4 | e2e recherche + surlignage + partage ; baseline en baisse ; 0 antd |
| L6 | **Nettoyage** ; suppression Unsubscribe, Attachments | L1, L2 | e2e désabonnement (D2, D3) + undo ; 0 antd |
| L7 | **Règles** (+ B6, B8, RuleSheet contextuel partout) ; suppression Expiration | L1, L4 | e2e création depuis expéditeur avec aperçu ; 0 antd |
| L8 | **Vue d'ensemble** (+ B3 compteurs SSE) ; suppression Dashboard, Analytics, Insights | L1 | e2e KPI → navigation ; compteurs live ; 0 antd |
| L9 | **Activité**, **Paramètres** (+ B7, B10), **Admin** ; suppression Jobs, OpsResilience, Privacy | L1 | e2e par page ; 0 antd |
| L10 | Login, SharedMail ; retrait `antd`, `@ant-design/charts`, `LegacyAntd`, `AppLayout` ; nettoyage i18n (clés orphelines) | tous | `npm ls antd` vide ; bundle initial réduit (mesuré) ; baseline a11y ≤ état L9 |
| L11 | Backend : retrait PII / tracking scan / saved-searches inutilisés (après décision §10) | L10 | migration de suppression réversible documentée |

Chaque lot : CI verte (`typecheck`, `test --coverage`, `build`, e2e), captures mobile 390 px et desktop 1440 px comparées au prototype, clés i18n fr + en ajoutées.

---

## 10. Points ouverts

| # | Sujet | À décider |
|---|---|---|
| O1 | Chiffrement des archives (P5) | Terminer (déchiffrement à la lecture, rotation, recherche impossible sur contenu chiffré vs D4) ou retirer ; masqué d'ici là. |
| O2 | Classification automatique par LLM | Hors périmètre ; éventuel modèle de règle « intelligent » plus tard. |
| O3 | i18n des notifications backend | Textes générés côté serveur aujourd'hui ; passer des clés + paramètres traduits par le frontend, ou langue utilisateur en DB. |
| O4 | Rapport hebdo par email (P1) | Le backend n'a pas d'envoi SMTP : ajouter un canal email (dépendance + config) ou se limiter à in-app/ntfy/webhook. |
| O5 | Données Expiration existantes (P4) | Convertir les expirations en règles/libellés ou les laisser expirer puis supprimer la table. |
| O6 | Heatmap et inbox-zero (ex-Analytics) | Non repris en Vue d'ensemble : confirmer l'abandon (et l'endpoint `snapshot`). |
| O7 | Données PII / tracking existantes | Purge des tables et endpoints (L11). |
| O8 | Labels de la barre mobile en 11 px | Proposé 12 px (lisibilité, pas d'exigence RGAA stricte). |
| O9 | Tokens sombres success/warning/danger-soft/progress | Proposés §4.1, absents du prototype : à valider visuellement. |
| O10 | Lecteur desktop | Prototype mobile seulement : sheet latérale proposée vs volet scindé permanent. |
| O11 | Artboards Activité, Paramètres, Admin, Libellés | En cours ; mettre à jour §7.6–7.8 et §3 à leur validation. |
| O12 | Undo hors ligne (PWA) | Comportement si le réseau tombe pendant les 10 s (job déjà en file côté serveur : l'annulation échoue → message explicite). |
| O13 | Plafond du select-all serveur (B5) | Valeur par défaut (ex. 50 000) et comportement au-delà. |
| O14 | Préflight Tailwind vs antd | Stratégie exacte de cascade validée en L0. |
