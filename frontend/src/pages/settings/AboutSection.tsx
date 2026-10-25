import { useTranslation } from 'react-i18next'
import { CircleCheck, CircleAlert, ExternalLink } from 'lucide-react'
import { useAbout } from '@/hooks/queries'
import { formatRelative } from '@/utils/format'
import { SettingsCard } from './shared'

const REPO = 'https://github.com/Le-Nid/nid'

type About = {
  version: string
  updateCheck: boolean
  latestVersion: string | null
  updateAvailable: boolean
  checkedAt: string | null
  checkFailed: boolean
}

function ExtLink({ href, children }: Readonly<{ href: string; children: string }>) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className="inline-flex min-h-11 w-fit items-center gap-1 text-sm font-medium text-primary-text underline-offset-4 hover:underline md:min-h-0">
      {children}<ExternalLink className="size-3.5" aria-hidden="true" />
    </a>
  )
}

function UpdateStatus({ about }: Readonly<{ about: About }>) {
  const { t, i18n } = useTranslation()
  if (!about.updateCheck) return <p className="text-sm text-muted-foreground">{t('settings.about.checkOff')}</p>
  if (!about.checkedAt) return <p className="text-sm text-muted-foreground">{t('settings.about.notChecked')}</p>
  const checked = t('settings.about.checkedAt', { when: formatRelative(about.checkedAt, i18n.language) })

  if (about.updateAvailable && about.latestVersion) {
    return (
      <div role="status" className="flex flex-col gap-2 rounded-lg border border-primary bg-primary-soft p-3 text-sm">
        <p className="flex items-center gap-2 font-medium">
          <CircleAlert className="size-4 shrink-0" aria-hidden="true" />{t('settings.about.updateAvailable', { version: about.latestVersion })}
        </p>
        <p>{t('settings.about.howToUpdate')} <code className="font-mono">docker compose pull &amp;&amp; docker compose up -d</code></p>
        <ExtLink href={`${REPO}/releases/tag/${about.latestVersion}`}>{t('settings.about.releaseNotes')}</ExtLink>
        <p className="text-muted-foreground">{checked}</p>
      </div>
    )
  }
  return (
    <p className="flex flex-wrap items-center gap-x-2 text-sm">
      {about.checkFailed
        ? <span className="text-muted-foreground">{t('settings.about.checkFailed')}</span>
        : <span className="flex items-center gap-2"><CircleCheck className="size-4 text-success" aria-hidden="true" />{t('settings.about.upToDate')}</span>}
      <span className="text-muted-foreground">· {checked}</span>
    </p>
  )
}

/** « À propos »: version and update check (ghcr.io, twice a day), what Nid talks to, licence and sources. */
export function AboutSection() {
  const { t } = useTranslation()
  const about = useAbout().data as About | undefined
  const services = ['google', 'registry', 'smtp', 'webhooks', 'sso'] as const

  return (
    <div className="flex flex-col gap-4">
      <SettingsCard title={t('settings.about.versionTitle')}>
        <p className="text-sm">
          {about?.version === 'dev' ? t('settings.about.devVersion') : t('settings.about.version', { version: about?.version ?? '…' })}
        </p>
        {about && <UpdateStatus about={about} />}
      </SettingsCard>

      <SettingsCard title={t('settings.about.transparencyTitle')} description={t('settings.about.transparencyHint')}>
        <ul className="flex list-disc flex-col gap-1 pl-5 text-sm">
          {services.map((key) => <li key={key}>{t(`settings.about.services.${key}`)}</li>)}
        </ul>
        <p className="text-sm text-muted-foreground">{t('settings.about.noTracking')}</p>
      </SettingsCard>

      <SettingsCard title={t('settings.about.projectTitle')} description={t('settings.about.license')}>
        <div className="flex flex-wrap gap-x-6">
          <ExtLink href={REPO}>{t('settings.about.source')}</ExtLink>
          <ExtLink href={`${REPO}/releases`}>{t('settings.about.releases')}</ExtLink>
          <ExtLink href={`${REPO}/issues`}>{t('settings.about.issues')}</ExtLink>
        </div>
      </SettingsCard>
    </div>
  )
}
