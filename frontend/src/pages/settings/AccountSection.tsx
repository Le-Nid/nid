import { useId } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { User } from 'lucide-react'
import { FormField } from '@/components/app/FormField'
import { useNotificationPreferences, useUpdateNotificationPreferences } from '@/hooks/queries'
import { useShortcutsPref } from '@/hooks/useKeyboardShortcuts'
import { useAuthStore } from '@/store/auth.store'
import { useThemeStore, type ThemePref } from '@/store/theme.store'
import { formatBytes } from '@/utils/format'
import { SettingsCard, SwitchRow, selectClass } from './shared'

const THEMES: ThemePref[] = ['system', 'light', 'dark']

/** « Compte » (§7.7): profile, language, theme, remote images (I4, B10), single-key shortcuts (R3). */
export function AccountSection() {
  const { t, i18n } = useTranslation()
  const id = useId()
  const { user, storageUsedBytes } = useAuthStore()
  const { pref, setPref } = useThemeStore()
  const prefs = useNotificationPreferences().data
  const updatePrefs = useUpdateNotificationPreferences()
  const [shortcuts, setShortcuts] = useShortcutsPref()

  return (
    <div className="flex flex-col gap-4">
      <SettingsCard title={t('settings.profile')}>
        <div className="flex items-center gap-4">
          <span className="grid size-14 shrink-0 place-items-center overflow-hidden rounded-full bg-avatar text-avatar-foreground">
            {user?.avatar_url
              ? <img src={user.avatar_url} alt="" crossOrigin="anonymous" className="size-full object-cover" />
              : <User className="size-6" aria-hidden="true" />}
          </span>
          <div className="flex min-w-0 flex-col">
            {user?.display_name && <span className="font-medium">{user.display_name}</span>}
            <span className="truncate text-muted-foreground">{user?.email}</span>
          </div>
        </div>
        <p className="text-sm text-muted-foreground">
          {t('settings.storage', { used: formatBytes(storageUsedBytes), quota: formatBytes(user?.storage_quota_bytes ?? 0) })}
        </p>
      </SettingsCard>

      <SettingsCard title={t('settings.display')}>
        <FormField id={`${id}-lang`} label={t('shell.language')}>
          <select
            id={`${id}-lang`}
            value={i18n.language?.startsWith('en') ? 'en' : 'fr'}
            onChange={(e) => void i18n.changeLanguage(e.target.value)}
            className={`${selectClass} w-fit`}
          >
            <option value="fr" lang="fr">Français</option>
            <option value="en" lang="en">English</option>
          </select>
        </FormField>
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1.5 text-sm font-medium">{t('settings.theme.label')}</legend>
          <div className="flex flex-wrap gap-2">
            {THEMES.map((theme) => (
              <label
                key={theme}
                className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border px-3 text-sm has-checked:border-primary has-checked:bg-primary-soft has-focus-visible:ring-3 has-focus-visible:ring-ring/50"
              >
                <input type="radio" name={`${id}-theme`} value={theme} checked={pref === theme} onChange={() => setPref(theme)} className="accent-primary" />
                {t(`settings.theme.${theme}`)}
              </label>
            ))}
          </div>
        </fieldset>
      </SettingsCard>

      <SettingsCard title={t('settings.reading')}>
        <SwitchRow
          label={t('settings.remoteImages')}
          description={t('settings.remoteImagesHint')}
          checked={prefs?.remote_images === 'allow'}
          disabled={!prefs}
          onChange={(allow) => updatePrefs.mutate({ remote_images: allow ? 'allow' : 'block' }, { onError: () => toast.error(t('settings.saveFailed')) })}
        />
        <SwitchRow label={t('settings.shortcuts')} description={t('settings.shortcutsHint')} checked={shortcuts} onChange={setShortcuts} />
      </SettingsCard>
    </div>
  )
}
