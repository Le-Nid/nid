import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string, opts?: any) => opts?.count != null ? `${key}:${opts.count}` : key }),
}))

const mockWeeklyReport = vi.fn()

vi.mock('../hooks/queries', () => ({
  useWeeklyReport: (...args: any[]) => mockWeeklyReport(...args),
}))

import InsightsPage from '../pages/Insights'

describe('InsightsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows loading spinner when loading', () => {
    mockWeeklyReport.mockReturnValue({ data: null, isLoading: true, isError: false })
    render(<InsightsPage />)
    expect(document.querySelector('.ant-spin')).toBeInTheDocument()
  })

  it('shows empty state on error', () => {
    mockWeeklyReport.mockReturnValue({ data: null, isLoading: false, isError: true })
    render(<InsightsPage />)
    expect(screen.getByText('insights.noData')).toBeInTheDocument()
  })

  it('shows empty state when no report', () => {
    mockWeeklyReport.mockReturnValue({ data: null, isLoading: false, isError: false })
    render(<InsightsPage />)
    expect(screen.getByText('insights.noData')).toBeInTheDocument()
  })

  it('displays report data', () => {
    mockWeeklyReport.mockReturnValue({
      data: {
        stats: {
          jobsCompleted: 5,
          jobsFailed: 1,
          mailsArchived: 100,
          archiveSizeBytes: 1024 * 1024,
          rulesExecuted: 3,
          topSenders: [
            { sender: 'alice@test.com', count: 20 },
          ],
        },
        period: {
          from: '2026-03-24T00:00:00.000Z',
          to: '2026-03-31T00:00:00.000Z',
        },
      },
      isLoading: false,
      isError: false,
    })

    render(<InsightsPage />)
    expect(screen.getByText('insights.title')).toBeInTheDocument()
    expect(screen.getByText('5')).toBeInTheDocument()
    expect(screen.getByText('1')).toBeInTheDocument()
    expect(screen.getByText('100')).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
  })

  it('shows no activity message when all stats are zero', () => {
    mockWeeklyReport.mockReturnValue({
      data: {
        stats: {
          jobsCompleted: 0,
          jobsFailed: 0,
          mailsArchived: 0,
          archiveSizeBytes: 0,
          rulesExecuted: 0,
          topSenders: [],
        },
        period: {
          from: '2026-03-24T00:00:00.000Z',
          to: '2026-03-31T00:00:00.000Z',
        },
      },
      isLoading: false,
      isError: false,
    })

    render(<InsightsPage />)
    expect(screen.getByText('insights.noActivity')).toBeInTheDocument()
  })
})
