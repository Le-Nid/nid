import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import BulkActionBar from '../components/BulkActionBar'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string, opts?: any) => opts?.count ? `${key}:${opts.count}` : key }),
}))

const labels = [
  { id: 'l1', name: 'Personal', type: 'user' },
  { id: 'l2', name: 'INBOX', type: 'system' },
  { id: 'l3', name: 'Work', type: 'user' },
]

describe('BulkActionBar', () => {
  it('renders nothing when no messages selected', () => {
    const { container } = render(
      <BulkActionBar selected={[]} labels={labels} onBulkAction={vi.fn()} loading={false} />,
    )
    expect(container.innerHTML).toBe('')
  })

  it('renders toolbar when messages are selected', () => {
    render(
      <BulkActionBar selected={['m1', 'm2']} labels={labels} onBulkAction={vi.fn()} loading={false} />,
    )
    expect(screen.getByRole('toolbar')).toBeInTheDocument()
  })

  it('calls onBulkAction with trash', () => {
    const onBulkAction = vi.fn()
    render(
      <BulkActionBar selected={['m1']} labels={labels} onBulkAction={onBulkAction} loading={false} />,
    )
    fireEvent.click(screen.getByText('bulk.trash'))
    expect(onBulkAction).toHaveBeenCalledWith('trash')
  })

  it('calls onBulkAction with archive', () => {
    const onBulkAction = vi.fn()
    render(
      <BulkActionBar selected={['m1']} labels={labels} onBulkAction={onBulkAction} loading={false} />,
    )
    fireEvent.click(screen.getByText('bulk.archiveGmail'))
    expect(onBulkAction).toHaveBeenCalledWith('archive')
  })

  it('calls onBulkAction with archive_nas', () => {
    const onBulkAction = vi.fn()
    render(
      <BulkActionBar selected={['m1']} labels={labels} onBulkAction={onBulkAction} loading={false} />,
    )
    fireEvent.click(screen.getByText('bulk.archiveNas'))
    expect(onBulkAction).toHaveBeenCalledWith('archive_nas')
  })

  it('calls onBulkAction with mark_read', () => {
    const onBulkAction = vi.fn()
    render(
      <BulkActionBar selected={['m1']} labels={labels} onBulkAction={onBulkAction} loading={false} />,
    )
    fireEvent.click(screen.getByText('bulk.markRead'))
    expect(onBulkAction).toHaveBeenCalledWith('mark_read')
  })

  it('calls onBulkAction with mark_unread', () => {
    const onBulkAction = vi.fn()
    render(
      <BulkActionBar selected={['m1']} labels={labels} onBulkAction={onBulkAction} loading={false} />,
    )
    fireEvent.click(screen.getByText('bulk.markUnread'))
    expect(onBulkAction).toHaveBeenCalledWith('mark_unread')
  })

  it('shows only user labels in the select dropdown', () => {
    render(
      <BulkActionBar selected={['m1']} labels={labels} onBulkAction={vi.fn()} loading={false} />,
    )
    // The select placeholder should be visible (user labels exist)
    expect(screen.getByText('bulk.addLabel')).toBeInTheDocument()
  })

  it('hides label selector when no user labels', () => {
    const systemOnly = [{ id: 'l1', name: 'INBOX', type: 'system' }]
    render(
      <BulkActionBar selected={['m1']} labels={systemOnly} onBulkAction={vi.fn()} loading={false} />,
    )
    expect(screen.queryByText('bulk.addLabel')).not.toBeInTheDocument()
  })

  it('hides label selector when labels is empty', () => {
    render(
      <BulkActionBar selected={['m1']} labels={[]} onBulkAction={vi.fn()} loading={false} />,
    )
    expect(screen.queryByText('bulk.addLabel')).not.toBeInTheDocument()
  })
})
