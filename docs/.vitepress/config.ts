import { defineConfig } from 'vitepress'
import { withMermaid } from 'vitepress-plugin-mermaid'

const base = '/nid/';

export default withMermaid(defineConfig({
  base,
  title: 'Nid',
  description: 'Application self-hosted de gestion et d\'archivage Gmail',

  head: [
    ['link', { rel: 'icon', href: `${base}assets/nid-favicon-light.svg` }],
  ],

  ignoreDeadLinks: [
    /localhost/,
  ],

  locales: {
    fr: {
      label: 'Français',
      lang: 'fr',
      link: '/fr/',
      themeConfig: {
        nav: [
          { text: 'Guide', link: '/fr/guide/' },
          { text: 'Installation', link: '/fr/installation/' },
          { text: 'Technique', link: '/fr/technical/overview' },
        ],
        sidebar: {
          '/fr/installation/': [
            {
              text: 'Installation',
              items: [
                { text: 'Démarrage rapide', link: '/fr/installation/' },
                { text: 'Configuration Google Cloud', link: '/fr/installation/google-cloud' },
                { text: 'Configuration détaillée', link: '/fr/installation/configuration' },
                { text: 'Déploiement production', link: '/fr/installation/production' },
                { text: 'Environnement de développement', link: '/fr/installation/development' },
              ],
            },
          ],
          '/fr/guide/': [
            {
              text: 'Guide utilisateur',
              items: [
                { text: 'Introduction', link: '/fr/guide/' },
                { text: 'Premiers pas', link: '/fr/guide/first-steps' },
                { text: 'Vue d\'ensemble', link: '/fr/guide/overview' },
                { text: 'Mails', link: '/fr/guide/mails' },
                { text: 'Nettoyage', link: '/fr/guide/cleanup' },
                { text: 'Règles & libellés', link: '/fr/guide/rules' },
                { text: 'Archives', link: '/fr/guide/archives' },
                { text: 'Activité', link: '/fr/guide/activity' },
                { text: 'Paramètres', link: '/fr/guide/settings' },
                { text: 'Pièces jointes', link: '/fr/guide/attachments' },
                { text: 'Notifications & webhooks', link: '/fr/guide/notifications' },
                { text: 'Administration', link: '/fr/guide/admin' },
              ],
            },
          ],
          '/fr/technical/': [
            {
              text: 'Documentation technique',
              items: [
                { text: 'Vue d\'ensemble', link: '/fr/technical/overview' },
                { text: 'Backend', link: '/fr/technical/backend' },
                { text: 'Frontend', link: '/fr/technical/frontend' },
                { text: 'Base de données', link: '/fr/technical/database' },
                { text: 'Jobs & Queue', link: '/fr/technical/jobs' },
                { text: 'Sécurité', link: '/fr/technical/security' },
                { text: 'Logging', link: '/fr/technical/logging' },
              ],
            },
            {
              text: 'Référence API',
              collapsed: true,
              items: [
                { text: 'Index', link: '/fr/technical/api/' },
                { text: 'Authentification', link: '/fr/technical/api/auth' },
                { text: 'Gmail', link: '/fr/technical/api/gmail' },
                { text: 'Archives', link: '/fr/technical/api/archive' },
                { text: 'Dashboard', link: '/fr/technical/api/dashboard' },
                { text: 'Jobs', link: '/fr/technical/api/jobs' },
                { text: 'Règles', link: '/fr/technical/api/rules' },
                { text: 'Notifications', link: '/fr/technical/api/notifications' },
                { text: 'Webhooks', link: '/fr/technical/api/webhooks' },
                { text: 'Admin', link: '/fr/technical/api/admin' },
                { text: 'Newsletters', link: '/fr/technical/api/unsubscribe' },
                { text: 'Pièces jointes', link: '/fr/technical/api/attachments' },
                { text: 'Analytics', link: '/fr/technical/api/analytics' },
                { text: 'Vie privée', link: '/fr/technical/api/privacy' },
                { text: 'Recherches sauvegardées', link: '/fr/technical/api/saved-searches' },
                { text: 'Libellés', link: '/fr/technical/api/labels' },
                { text: 'Boîte unifiée', link: '/fr/technical/api/unified' },
                { text: 'Rapports', link: '/fr/technical/api/reports' },
                { text: 'Configuration', link: '/fr/technical/api/config' },
                { text: 'Rétention', link: '/fr/technical/api/retention' },
                { text: 'Expiration', link: '/fr/technical/api/expiration' },
                { text: 'Partage', link: '/fr/technical/api/sharing' },
                { text: 'Import / Export mbox', link: '/fr/technical/api/import' },
                { text: 'Quota Gmail API', link: '/fr/technical/api/quota' },
                { text: 'Intégrité', link: '/fr/technical/api/integrity' },
                { text: 'Audit', link: '/fr/technical/api/audit' },
              ],
            },
            {
              text: 'Développement',
              items: [
                { text: 'Contribuer', link: '/fr/development/contributing' },
                { text: 'Roadmap', link: '/fr/development/roadmap' },
              ],
            },
          ],
        },
        outline: { label: 'Sur cette page' },
        docFooter: { prev: 'Précédent', next: 'Suivant' },
        lastUpdated: { text: 'Dernière mise à jour' },
        returnToTopLabel: 'Retour en haut',
        sidebarMenuLabel: 'Menu',
        darkModeSwitchLabel: 'Thème',
      },
    },
    en: {
      label: 'English',
      lang: 'en',
      link: '/en/',
      themeConfig: {
        nav: [
          { text: 'Guide', link: '/en/guide/' },
          { text: 'Installation', link: '/en/installation/' },
          { text: 'Technical', link: '/en/technical/overview' },
        ],
        sidebar: {
          '/en/installation/': [
            {
              text: 'Installation',
              items: [
                { text: 'Quick Start', link: '/en/installation/' },
                { text: 'Google Cloud Setup', link: '/en/installation/google-cloud' },
                { text: 'Detailed Configuration', link: '/en/installation/configuration' },
                { text: 'Production Deployment', link: '/en/installation/production' },
                { text: 'Development Environment', link: '/en/installation/development' },
              ],
            },
          ],
          '/en/guide/': [
            {
              text: 'User Guide',
              items: [
                { text: 'Introduction', link: '/en/guide/' },
                { text: 'First Steps', link: '/en/guide/first-steps' },
                { text: 'Overview', link: '/en/guide/overview' },
                { text: 'Mail', link: '/en/guide/mails' },
                { text: 'Cleanup', link: '/en/guide/cleanup' },
                { text: 'Rules & labels', link: '/en/guide/rules' },
                { text: 'Archives', link: '/en/guide/archives' },
                { text: 'Activity', link: '/en/guide/activity' },
                { text: 'Settings', link: '/en/guide/settings' },
                { text: 'Attachments', link: '/en/guide/attachments' },
                { text: 'Notifications & webhooks', link: '/en/guide/notifications' },
                { text: 'Administration', link: '/en/guide/admin' },
              ],
            },
          ],
          '/en/technical/': [
            {
              text: 'Technical Documentation',
              items: [
                { text: 'Overview', link: '/en/technical/overview' },
                { text: 'Backend', link: '/en/technical/backend' },
                { text: 'Frontend', link: '/en/technical/frontend' },
                { text: 'Database', link: '/en/technical/database' },
                { text: 'Jobs & Queue', link: '/en/technical/jobs' },
                { text: 'Security', link: '/en/technical/security' },
                { text: 'Logging', link: '/en/technical/logging' },
              ],
            },
            {
              text: 'API Reference',
              collapsed: true,
              items: [
                { text: 'Index', link: '/en/technical/api/' },
                { text: 'Authentication', link: '/en/technical/api/auth' },
                { text: 'Gmail', link: '/en/technical/api/gmail' },
                { text: 'Archives', link: '/en/technical/api/archive' },
                { text: 'Dashboard', link: '/en/technical/api/dashboard' },
                { text: 'Jobs', link: '/en/technical/api/jobs' },
                { text: 'Rules', link: '/en/technical/api/rules' },
                { text: 'Notifications', link: '/en/technical/api/notifications' },
                { text: 'Webhooks', link: '/en/technical/api/webhooks' },
                { text: 'Admin', link: '/en/technical/api/admin' },
                { text: 'Newsletters', link: '/en/technical/api/unsubscribe' },
                { text: 'Attachments', link: '/en/technical/api/attachments' },
                { text: 'Analytics', link: '/en/technical/api/analytics' },
                { text: 'Privacy', link: '/en/technical/api/privacy' },
                { text: 'Saved Searches', link: '/en/technical/api/saved-searches' },
                { text: 'Labels', link: '/en/technical/api/labels' },
                { text: 'Unified Inbox', link: '/en/technical/api/unified' },
                { text: 'Reports', link: '/en/technical/api/reports' },
                { text: 'Configuration', link: '/en/technical/api/config' },
                { text: 'Retention', link: '/en/technical/api/retention' },
                { text: 'Expiration', link: '/en/technical/api/expiration' },
                { text: 'Sharing', link: '/en/technical/api/sharing' },
                { text: 'mbox Import / Export', link: '/en/technical/api/import' },
                { text: 'Gmail API quota', link: '/en/technical/api/quota' },
                { text: 'Integrity', link: '/en/technical/api/integrity' },
                { text: 'Audit', link: '/en/technical/api/audit' },
              ],
            },
            {
              text: 'Development',
              items: [
                { text: 'Contributing', link: '/en/development/contributing' },
                { text: 'Roadmap', link: '/en/development/roadmap' },
              ],
            },
          ],
        },
      },
    },
  },

  themeConfig: {
    logo: '/assets/nid-logomark-dark.svg',
    socialLinks: [
      { icon: 'github', link: 'https://github.com/le-nid/nid' },
    ],
    search: {
      provider: 'local',
      options: {
        locales: {
          fr: {
            translations: {
              button: { buttonText: 'Rechercher', buttonAriaLabel: 'Rechercher' },
              modal: {
                noResultsText: 'Aucun résultat pour',
                resetButtonTitle: 'Effacer la recherche',
                footer: { selectText: 'Sélectionner', navigateText: 'Naviguer', closeText: 'Fermer' },
              },
            },
          },
        },
      },
    },
  },

  markdown: {
    // mermaid support via vitepress-plugin-mermaid
  },

  mermaid: {},
}))
