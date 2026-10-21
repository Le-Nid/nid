import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { toast } from 'sonner'
import i18n from '../i18n'
import { JobProgressInline } from '../components/app/JobProgressInline'
import { useJobSSE, type JobState } from '../hooks/useJobSSE'
import { jobsApi } from '../api'

vi.mock('../hooks/useJobSSE', () => ({ useJobSSE: vi.fn() }))
vi.mock('../api', () => ({ jobsApi: { cancel: vi.fn() } }))
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }))

const job = (patch: Partial<JobState>): JobState => ({
  id: 'job-1', bullmq_id: '1', type: 'bulk_operation', status: 'active', progress: 51, total: 2410, processed: 1240, ...patch,
})
const sse = (j: JobState | null) => vi.mocked(useJobSSE).mockReturnValue({ job: j, connected: true })

beforeAll(() => i18n.changeLanguage('fr'))
beforeEach(() => vi.clearAllMocks())

describe('JobProgressInline', () => {
  it('shows an accessible progress bar and the processed / total count', () => {
    sse(job({}))
    render(<JobProgressInline jobId="job-1" label="Sauvegarde NAS" />)
    expect(useJobSSE).toHaveBeenCalledWith('job-1')
    expect(screen.getByRole('progressbar', { name: 'Sauvegarde NAS' })).toHaveAttribute('aria-valuenow', '51')
    expect(screen.getByText(/1\s240 \/ 2\s410/)).toBeInTheDocument()
  })

  it('is indeterminate before the first event', () => {
    sse(null)
    render(<JobProgressInline jobId="job-1" label="Sauvegarde NAS" />)
    expect(screen.getByRole('progressbar')).not.toHaveAttribute('aria-valuenow')
    expect(screen.queryByRole('button', { name: 'Arrêter' })).not.toBeInTheDocument()
  })

  it('stops the job with DELETE /api/jobs/:id, and says so when it fails', async () => {
    sse(job({}))
    vi.mocked(jobsApi.cancel).mockRejectedValueOnce(new Error('offline'))
    render(<JobProgressInline jobId="job-1" label="Sauvegarde NAS" />)
    await userEvent.click(screen.getByRole('button', { name: 'Arrêter' }))
    expect(jobsApi.cancel).toHaveBeenCalledWith('job-1')
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Impossible d'arrêter la tâche"))
  })

  it('announces the end and calls onDone once', () => {
    const onDone = vi.fn()
    sse(job({}))
    const { rerender } = render(<JobProgressInline jobId="job-1" label="Sauvegarde NAS" onDone={onDone} />)
    const done = job({ status: 'completed', progress: 100, processed: 640 })
    sse(done)
    rerender(<JobProgressInline jobId="job-1" label="Sauvegarde NAS" onDone={onDone} />)
    rerender(<JobProgressInline jobId="job-1" label="Sauvegarde NAS" onDone={onDone} />)

    expect(screen.getByText('Terminé · 640 mails traités')).toHaveAttribute('aria-live', 'polite')
    expect(onDone).toHaveBeenCalledOnce()
    expect(onDone).toHaveBeenCalledWith(done)
    expect(screen.queryByRole('button', { name: 'Arrêter' })).not.toBeInTheDocument()
  })

  it.each([
    [{ status: 'failed', error: 'Quota dépassé' } as const, 'Échec : Quota dépassé'],
    [{ status: 'cancelled' } as const, 'Arrêté'],
  ])('shows the final state %o', (patch, text) => {
    sse(job(patch))
    render(<JobProgressInline jobId="job-1" label="Sauvegarde NAS" />)
    expect(screen.getByText(text)).toBeInTheDocument()
  })
})
