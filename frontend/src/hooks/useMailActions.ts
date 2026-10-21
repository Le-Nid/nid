import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { showUndoToast } from '@/components/app/UndoToast'
import type { ViewerAction } from '@/components/app/MailViewer'
import { archiveApi, gmailApi, jobsApi } from '@/api'
import type { JobState } from '@/hooks/useJobSSE'

export type MailAction = ViewerAction | 'mark_read' | 'mark_unread' | 'label'
export type Target = { ids: string[] } | { query: string }
/** A launched action: rows hidden optimistically until its job ends or is undone (D1). */
export type Pending = { key: number; accountId: string; jobId: string | null; label: string; hidden: string[] }

const UNDOABLE = new Set<MailAction>(['trash', 'archive'])

function launch(accountId: string, action: MailAction, target: Target, labelId?: string): Promise<{ jobId: string }> {
  const scope = 'ids' in target ? { messageIds: target.ids } : { query: target.query }
  if (action === 'archive_nas') return archiveApi.triggerArchive(accountId, { ...scope, differential: true })
  // Trash and archive wait out the server's undo window (D1); the others run now, progress shown inline
  return gmailApi.bulkOperation(accountId, { action, labelId, ...scope, ...(UNDOABLE.has(action) ? {} : { delayMs: 0 }) })
}

/** Mail actions (Mails, Nettoyage): launches them, offers undo for the recoverable ones and refreshes the list when their job ends. */
export function useMailActions(accountId: string | null, refreshKey: (accountId: string) => readonly unknown[]) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [pending, setPending] = useState<Pending[]>([])
  const nextKey = useRef(0)
  const drop = (key: number) => setPending((list) => list.filter((p) => p.key !== key))

  const undo = (key: number, jobId: string) =>
    jobsApi.cancel(jobId).then(() => drop(key), () => toast.error(t('mails.undoFailed')))

  const run = async (action: MailAction, target: Target, opts: { count: number; hidden: string[]; labelId?: string; label?: string }) => {
    if (!accountId) return
    const key = nextKey.current++
    const label = opts.label ?? t(`mails.job.${action}`, { count: opts.count })
    const undoable = UNDOABLE.has(action)
    setPending((list) => [...list, { key, accountId, jobId: null, label, hidden: undoable ? opts.hidden : [] }])
    try {
      const { jobId } = await launch(accountId, action, target, opts.labelId)
      setPending((list) => list.map((p) => (p.key === key ? { ...p, jobId } : p)))
      if (undoable) {
        showUndoToast({ message: label, description: t(`mails.undoDescription.${action}`), onUndo: () => void undo(key, jobId) })
      }
    } catch {
      drop(key)
      toast.error(t('mails.actionFailed'))
    }
  }

  const done = async (entry: Pending, job: JobState) => {
    if (job.status === 'failed') toast.error(t('mails.jobFailed'))
    // Keep the rows hidden until the refetched list no longer has them
    await qc.invalidateQueries({ queryKey: refreshKey(entry.accountId) })
    drop(entry.key)
  }

  return { pending, run, done }
}

