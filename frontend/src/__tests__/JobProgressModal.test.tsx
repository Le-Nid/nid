import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import JobProgressModal from '../components/JobProgressModal'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string, opts?: any) => opts?.count != null ? `${key}:${opts.count}` : key }),
}))

const mockUseJobSSE = vi.fn()
vi.mock('../hooks/useJobSSE', () => ({
  useJobSSE: (...args: any[]) => mockUseJobSSE(...args),
}))

describe('JobProgressModal', () => {
  it('does not render when jobId is null', () => {
    mockUseJobSSE.mockReturnValue({ job: null, connected: false })
    const { container } = render(<JobProgressModal jobId={null} onClose={vi.fn()} />)
    // Modal with open={false} should not show content
    expect(container.querySelector('.ant-modal')).toBeNull()
  })

  it('shows connecting message when no job data yet', () => {
    mockUseJobSSE.mockReturnValue({ job: null, connected: false })
    render(<JobProgressModal jobId="job-1" onClose={vi.fn()} />)
    expect(screen.getByText('jobModal.connecting')).toBeInTheDocument()
  })

  it('shows progress for active job', () => {
    mockUseJobSSE.mockReturnValue({
      job: { id: 'job-1', status: 'active', progress: 50, total: 100, processed: 50, type: 'bulk_operation' },
      connected: true,
    })
    render(<JobProgressModal jobId="job-1" onClose={vi.fn()} />)
    expect(screen.getByText('ACTIVE')).toBeInTheDocument()
    expect(screen.getByText('50 / 100')).toBeInTheDocument()
  })

  it('shows success alert for completed job', () => {
    mockUseJobSSE.mockReturnValue({
      job: { id: 'job-1', status: 'completed', progress: 100, total: 100, processed: 100, type: 'bulk_operation' },
      connected: false,
    })
    render(<JobProgressModal jobId="job-1" onClose={vi.fn()} />)
    expect(screen.getByText('COMPLETED')).toBeInTheDocument()
    expect(screen.getByText('jobModal.done:100')).toBeInTheDocument()
  })

  it('shows error alert for failed job', () => {
    mockUseJobSSE.mockReturnValue({
      job: { id: 'job-1', status: 'failed', progress: 30, total: 100, processed: 30, type: 'bulk_operation', error: 'Timeout occurred' },
      connected: false,
    })
    render(<JobProgressModal jobId="job-1" onClose={vi.fn()} />)
    expect(screen.getByText('FAILED')).toBeInTheDocument()
    expect(screen.getByText('Timeout occurred')).toBeInTheDocument()
  })

  it('shows reconnecting message when disconnected but not terminal', () => {
    mockUseJobSSE.mockReturnValue({
      job: { id: 'job-1', status: 'active', progress: 25, total: 100, processed: 25, type: 'run_rule' },
      connected: false,
    })
    render(<JobProgressModal jobId="job-1" onClose={vi.fn()} />)
    expect(screen.getByText('jobModal.reconnecting')).toBeInTheDocument()
  })
})
