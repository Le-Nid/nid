import { useId, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { FormField } from '@/components/app/FormField'
import { useDecryptArchives, useEncryptionStatus } from '@/hooks/queries'
import { SettingsCard } from './shared'

/**
 * Archive encryption was removed (its metadata stayed in clear, and it broke search, reading and restore):
 * an account still holding encrypted archives gets them back in clear here. Hidden when there are none.
 */
export function DecryptArchivesCard({ accountId, email }: Readonly<{ accountId: string; email: string }>) {
  const { t } = useTranslation()
  const id = useId()
  const [passphrase, setPassphrase] = useState('')
  const encrypted = useEncryptionStatus(accountId).data?.encrypted ?? 0
  const decrypt = useDecryptArchives(accountId)
  if (!encrypted) return null

  const submit = (e: FormEvent) => {
    e.preventDefault()
    decrypt.mutate(passphrase, {
      onSuccess: () => {
        setPassphrase('')
        toast.success(t('settings.data.decryptStarted'), { description: t('settings.data.decryptStartedHint') })
      },
      onError: (err) => {
        const status = (err as { response?: { status?: number } }).response?.status
        toast.error(t(status === 403 ? 'settings.data.decryptWrong' : 'settings.data.decryptFailed'))
      },
    })
  }

  return (
    <SettingsCard title={t('settings.data.decrypt')} description={t('settings.data.decryptHint', { count: encrypted, email })}>
      <form onSubmit={submit} className="flex flex-col gap-3 md:flex-row md:items-end">
        <FormField id={`${id}-pass`} label={t('settings.data.decryptPassphrase')}>
          <Input
            id={`${id}-pass`}
            type="password"
            autoComplete="off"
            value={passphrase}
            onChange={(e) => setPassphrase(e.target.value)}
            className="h-11 text-base md:h-9 md:text-sm"
          />
        </FormField>
        <Button type="submit" className="h-11 w-fit md:h-9" disabled={!passphrase || decrypt.isPending}>
          {t('settings.data.decryptSubmit')}
        </Button>
      </form>
    </SettingsCard>
  )
}
