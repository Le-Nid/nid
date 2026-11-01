import { useId, useRef, useState, type ChangeEvent, type DragEvent, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Download, Trash2, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ConfirmDialog } from '@/components/app/ConfirmDialog'
import { FormField } from '@/components/app/FormField'
import { useDeleteMe, useExportConfig, useExportMyData, useImportConfig, useImportEml, useImportImap, useImportMbox } from '@/hooks/queries'
import { useAuthStore } from '@/store/auth.store'
import { useAccount } from '@/hooks/useAccount'
import { saveBlob } from '@/utils/download'
import { useMboxExport } from '../archives/shared'
import { SettingsCard } from './shared'
import { DecryptArchivesCard } from './DecryptArchivesCard'

const today = () => new Date().toISOString().slice(0, 10)

/** « Import lancé — suivi dans Activité » with a link there. */
function useJobStarted() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  return () => toast.success(t('settings.data.importStarted'), {
    action: { label: t('shell.activity'), onClick: () => navigate('/activity') },
  })
}

/** Hidden file input behind a real button (the native one cannot be styled or named consistently); files can be dropped on it. */
function FilePicker({ label, accept, multiple, disabled, onFiles }: Readonly<{
  label: string; accept: string; multiple?: boolean; disabled?: boolean; onFiles: (files: File[]) => void
}>) {
  const ref = useRef<HTMLInputElement>(null)
  const pick = (list: FileList | null) => {
    const files = [...(list ?? [])].slice(0, multiple ? undefined : 1)
    if (files.length) onFiles(files)
  }
  const change = (e: ChangeEvent<HTMLInputElement>) => {
    pick(e.target.files)
    e.target.value = '' // the same file can be picked again
  }
  const drop = (e: DragEvent<HTMLButtonElement>) => {
    e.preventDefault()
    if (!disabled) pick(e.dataTransfer.files)
  }
  return (
    <>
      <input ref={ref} type="file" accept={accept} multiple={multiple} className="hidden" tabIndex={-1} aria-hidden="true" onChange={change} />
      <Button variant="outline" className="h-11 w-fit md:h-9" disabled={disabled} onClick={() => ref.current?.click()} onDragOver={(e) => e.preventDefault()} onDrop={drop}>
        <Upload aria-hidden="true" />{label}
      </Button>
    </>
  )
}

function MailImportCards({ accountId, email }: Readonly<{ accountId: string; email: string }>) {
  const { t } = useTranslation()
  const id = useId()
  const started = useJobStarted()
  const mbox = useImportMbox(accountId)
  const eml = useImportEml(accountId)
  const imap = useImportImap(accountId)
  const exporter = useMboxExport(accountId)
  const failed = () => toast.error(t('settings.data.importFailed'))

  const submitImap = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    const text = (name: string) => { const v = form.get(name); return typeof v === 'string' ? v : '' }
    const field = (name: string) => text(name).trim()
    imap.mutate({
      host: field('host'),
      port: Number(field('port')) || 993,
      secure: form.get('secure') === 'on',
      user: field('user'),
      pass: text('pass'),
      folder: field('folder') || undefined,
      maxMessages: Number(field('max')) || undefined,
    }, { onSuccess: started, onError: failed })
  }
  const input = 'h-11 text-base md:h-9 md:text-sm'

  return (
    <>
      <SettingsCard title={t('settings.data.mbox')} description={t('settings.data.mboxHint', { email })}>
        <FilePicker label={t('settings.data.mboxPick')} accept=".mbox,.mbx" disabled={mbox.isPending} onFiles={([file]) => mbox.mutate(file, { onSuccess: started, onError: failed })} />
      </SettingsCard>

      <SettingsCard title={t('settings.data.eml')} description={t('settings.data.emlHint', { email })}>
        <FilePicker
          label={t('settings.data.emlPick')}
          accept=".eml,message/rfc822"
          multiple
          disabled={eml.isPending}
          onFiles={(files) => eml.mutate(files, {
            onSuccess: (r) => (r.imported || r.skipped ? toast.success : toast.error)(t('settings.data.emlDone', { count: r.imported, skipped: r.skipped, errors: r.errors })),
            onError: failed,
          })}
        />
      </SettingsCard>

      <SettingsCard title={t('settings.data.imap')} description={t('settings.data.imapHint', { email })}>
        <form onSubmit={submitImap} className="grid gap-4 md:grid-cols-2">
          <FormField id={`${id}-host`} label={t('settings.data.host')}>
            <Input id={`${id}-host`} name="host" required autoComplete="off" placeholder="imap.example.com" className={input} />
          </FormField>
          <FormField id={`${id}-port`} label={t('settings.data.port')}>
            <Input id={`${id}-port`} name="port" type="number" inputMode="numeric" min={1} max={65535} defaultValue={993} className={input} />
          </FormField>
          <FormField id={`${id}-user`} label={t('settings.data.user')}>
            <Input id={`${id}-user`} name="user" required autoComplete="off" className={input} />
          </FormField>
          <FormField id={`${id}-pass`} label={t('settings.data.pass')}>
            <Input id={`${id}-pass`} name="pass" type="password" required autoComplete="off" className={input} />
          </FormField>
          <FormField id={`${id}-folder`} label={t('settings.data.folder')}>
            <Input id={`${id}-folder`} name="folder" placeholder="INBOX" className={input} />
          </FormField>
          <FormField id={`${id}-max`} label={t('settings.data.max')}>
            <Input id={`${id}-max`} name="max" type="number" inputMode="numeric" min={1} className={input} />
          </FormField>
          <label className="flex min-h-11 items-center gap-3 text-sm md:col-span-2">
            <input type="checkbox" name="secure" defaultChecked className="size-4 accent-primary" />
            {t('settings.data.secure')}
          </label>
          <Button type="submit" className="h-11 w-fit md:h-9" disabled={imap.isPending}>{t('settings.data.imapStart')}</Button>
        </form>
      </SettingsCard>

      <SettingsCard title={t('settings.data.export')} description={t('settings.data.exportHint', { email })}>
        <Button variant="outline" className="h-11 w-fit md:h-9" disabled={exporter.isPending} onClick={() => exporter.run()}>
          <Download aria-hidden="true" />{t('settings.data.exportMbox')}
        </Button>
      </SettingsCard>
    </>
  )
}

/** Rules and webhooks as JSON (`/api/config/export|import`). */
function ConfigCard() {
  const { t } = useTranslation()
  const exportConfig = useExportConfig()
  const importConfig = useImportConfig()
  const failed = () => toast.error(t('settings.data.configFailed'))

  const save = () => exportConfig.mutate(undefined, {
    onSuccess: (data) => saveBlob(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }), `nid-config-${today()}.json`),
    onError: failed,
  })
  const load = (file: File) => {
    file.text()
      .then((text) => JSON.parse(text))
      .then((data) => importConfig.mutate(data, { onSuccess: () => toast.success(t('settings.data.configImported')), onError: failed }))
      .catch(() => toast.error(t('settings.data.configInvalid')))
  }

  return (
    <SettingsCard title={t('settings.data.config')} description={t('settings.data.configHint')}>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" className="h-11 md:h-9" disabled={exportConfig.isPending} onClick={save}>
          <Download aria-hidden="true" />{t('settings.data.configExport')}
        </Button>
        <FilePicker label={t('settings.data.configImport')} accept=".json,application/json" disabled={importConfig.isPending} onFiles={([file]) => load(file)} />
      </div>
    </SettingsCard>
  )
}

/** GDPR export (`/api/auth/me/export`): every stored datum as JSON, mails excepted (mbox export above). */
function MyDataCard() {
  const { t } = useTranslation()
  const exporter = useExportMyData()
  const save = () => exporter.mutate(undefined, {
    onSuccess: (data) => saveBlob(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }), `nid-export-${today()}.json`),
    onError: () => toast.error(t('common.error')),
  })
  return (
    <SettingsCard title={t('settings.data.myData')} description={t('settings.data.myDataHint')}>
      <Button variant="outline" className="h-11 w-fit md:h-9" disabled={exporter.isPending} onClick={save}>
        <Download aria-hidden="true" />{t('settings.data.myDataExport')}
      </Button>
    </SettingsCard>
  )
}

/** Account deletion (D2): confirmed with the password, or the e-mail for an SSO-only account, then a dialog. */
function DeleteAccountCard() {
  const { t } = useTranslation()
  const id = useId()
  const navigate = useNavigate()
  const { user, logout } = useAuthStore()
  const remove = useDeleteMe()
  const [secret, setSecret] = useState('')
  const [confirming, setConfirming] = useState(false)
  const hasPassword = !!user?.has_password

  const confirm = () => remove.mutate(hasPassword ? { password: secret } : { email: secret }, {
    onSuccess: async () => {
      await logout()
      navigate('/login', { replace: true })
    },
    onError: () => toast.error(t('settings.data.deleteFailed')),
  })

  return (
    <SettingsCard title={t('settings.data.delete')} description={t('settings.data.deleteHint')}>
      <form onSubmit={(e) => { e.preventDefault(); setConfirming(true) }} className="flex flex-col gap-3">
        <FormField id={id} label={hasPassword ? t('settings.data.deletePassword') : t('settings.data.deleteEmail', { email: user?.email })}>
          <Input
            id={id}
            type={hasPassword ? 'password' : 'email'}
            autoComplete={hasPassword ? 'current-password' : 'off'}
            required
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            className="h-11 text-base md:h-9 md:max-w-sm md:text-sm"
          />
        </FormField>
        <Button type="submit" variant="destructive" className="h-11 w-fit md:h-9" disabled={remove.isPending || !secret}>
          <Trash2 aria-hidden="true" />{t('settings.data.deleteSubmit')}
        </Button>
      </form>
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={t('settings.data.deleteTitle')}
        description={t('settings.data.deleteConfirm')}
        confirmLabel={t('settings.data.deleteSubmit')}
        onConfirm={confirm}
        destructive
      />
    </SettingsCard>
  )
}

/** « Données » (§7.7, P6): mbox (Takeout, L4) / IMAP import and mbox export into the active account, config export/import, GDPR export and account deletion. */
export function DataSection() {
  const { t } = useTranslation()
  const { accountId, account } = useAccount()
  return (
    <div className="flex flex-col gap-4">
      {accountId && account ? (
        <>
          <MailImportCards accountId={accountId} email={account.email} />
          {!account.shared_by && <DecryptArchivesCard accountId={accountId} email={account.email} />}
        </>
      ) : (
        <p className="text-sm text-muted-foreground">
          {t('settings.data.noAccount')}{' '}
          <Link to="/settings/gmail" className="font-medium text-primary-text underline">{t('settings.gmail.add')}</Link>
        </p>
      )}
      <ConfigCard />
      <MyDataCard />
      <DeleteAccountCard />
    </div>
  )
}
