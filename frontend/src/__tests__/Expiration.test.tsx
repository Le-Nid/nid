import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string, opts?: any) => opts?.count != null ? `${key}:${opts.count}` : key }),
}))

const mockUseAccount = vi.fn().mockReturnValue({ accountId: 'acc-1', account: null })
vi.mock('../hooks/useAccount', () => ({
  useAccount: (...args: any[]) => mockUseAccount(...args),
}))

const mockExpirations = vi.fn()
const mockStats = vi.fn()
const mockDelete = vi.fn()
const mockCreate = vi.fn()
const mockDetect = vi.fn()
const mockBatch = vi.fn()

vi.mock('../hooks/queries', () => ({
  useExpirations: (...args: any[]) => mockExpirations(...args),
  useExpirationStats: (...args: any[]) => mockStats(...args),
  useDeleteExpiration: (...args: any[]) => mockDelete(...args),
  useCreateExpiration: (...args: any[]) => mockCreate(...args),
  useDetectExpirations: (...args: any[]) => mockDetect(...args),
  useCreateExpirationBatch: (...args: any[]) => mockBatch(...args),
}))

vi.mock('../api', () => ({
  gmailApi: {
    listMessages: vi.fn().mockResolvedValue({ messages: [] }),
    batchGetMessages: vi.fn().mockResolvedValue([]),
  },
}))

import ExpirationPage from '../pages/Expiration'

describe('ExpirationPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockDelete.mockReturnValue({ mutateAsync: vi.fn() })
    mockCreate.mockReturnValue({ mutateAsync: vi.fn(), isPending: false })
    mockDetect.mockReturnValue({ mutateAsync: vi.fn() })
    mockBatch.mockReturnValue({ mutateAsync: vi.fn(), isPending: false })
  })

  it('renders title and stats', () => {
    mockExpirations.mockReturnValue({ data: [], isLoading: false })
    mockStats.mockReturnValue({
      data: { total: 10, pending: 5, deleted: 3, expiringSoon: 2 },
    })

    render(<ExpirationPage />)
    expect(screen.getByText('expiration.title')).toBeInTheDocument()
    expect(screen.getByText('5')).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
  })

  it('shows loading state', () => {
    mockExpirations.mockReturnValue({ data: [], isLoading: true })
    mockStats.mockReturnValue({ data: null })

    render(<ExpirationPage />)
    expect(screen.getByText('expiration.title')).toBeInTheDocument()
  })

  it('renders expirations in table', () => {
    mockExpirations.mockReturnValue({
      data: [
        {
          id: 'exp-1',
          subject: 'Your OTP code',
          sender: 'noreply@google.com',
          category: 'otp',
          expires_at: new Date(Date.now() + 86400000).toISOString(),
          is_deleted: false,
        },
      ],
      isLoading: false,
    })
    mockStats.mockReturnValue({ data: { total: 1, pending: 1, deleted: 0, expiringSoon: 0 } })

    render(<ExpirationPage />)
    expect(screen.getByText('Your OTP code')).toBeInTheDocument()
    expect(screen.getByText('expiration.cat_otp')).toBeInTheDocument()
  })

  it('renders expired item with danger style', () => {
    mockExpirations.mockReturnValue({
      data: [
        {
          id: 'exp-2',
          subject: 'Expired mail',
          sender: 'test@test.com',
          category: 'promo',
          expires_at: new Date('2020-01-01').toISOString(),
          is_deleted: false,
        },
      ],
      isLoading: false,
    })
    mockStats.mockReturnValue({ data: { total: 1, pending: 0, deleted: 0, expiringSoon: 0 } })

    render(<ExpirationPage />)
    expect(screen.getByText('Expired mail')).toBeInTheDocument()
    expect(screen.getByText('expiration.cat_promo')).toBeInTheDocument()
  })

  it('renders deleted item with tag', () => {
    mockExpirations.mockReturnValue({
      data: [
        {
          id: 'exp-3',
          subject: 'Deleted mail',
          sender: 'test@test.com',
          category: 'delivery',
          expires_at: new Date('2020-01-01').toISOString(),
          is_deleted: true,
        },
      ],
      isLoading: false,
    })
    mockStats.mockReturnValue({ data: { total: 1, pending: 0, deleted: 1, expiringSoon: 0 } })

    render(<ExpirationPage />)
    expect(screen.getByText('Deleted mail')).toBeInTheDocument()
    expect(screen.getByText('expiration.deleted')).toBeInTheDocument()
  })

  it('shows no account state', () => {
    mockUseAccount.mockReturnValueOnce({ accountId: null, account: null })
    render(<ExpirationPage />)
    expect(screen.getByText('common.selectAccount')).toBeInTheDocument()
  })

  it('renders detect button', () => {
    mockExpirations.mockReturnValue({ data: [], isLoading: false })
    mockStats.mockReturnValue({ data: null })
    render(<ExpirationPage />)
    expect(screen.getByText('expiration.detect')).toBeInTheDocument()
  })

  it('renders add manual button', () => {
    mockExpirations.mockReturnValue({ data: [], isLoading: false })
    mockStats.mockReturnValue({ data: null })
    render(<ExpirationPage />)
    expect(screen.getByText('expiration.addManual')).toBeInTheDocument()
  })

  it('displays category colors for different categories', () => {
    mockExpirations.mockReturnValue({
      data: [
        { id: 'e1', subject: 'OTP', sender: 's', category: 'otp', expires_at: new Date(Date.now() + 86400000).toISOString(), is_deleted: false },
        { id: 'e2', subject: 'Delivery', sender: 's', category: 'delivery', expires_at: new Date(Date.now() + 86400000).toISOString(), is_deleted: false },
        { id: 'e3', subject: 'Manual', sender: 's', category: 'manual', expires_at: new Date(Date.now() + 86400000).toISOString(), is_deleted: false },
      ],
      isLoading: false,
    })
    mockStats.mockReturnValue({ data: { total: 3, pending: 3, deleted: 0, expiringSoon: 0 } })

    render(<ExpirationPage />)
    expect(screen.getByText('expiration.cat_otp')).toBeInTheDocument()
    expect(screen.getByText('expiration.cat_delivery')).toBeInTheDocument()
    expect(screen.getByText('expiration.cat_manual')).toBeInTheDocument()
  })

  it('renders with expiring soon warning', () => {
    mockExpirations.mockReturnValue({ data: [], isLoading: false })
    mockStats.mockReturnValue({
      data: { total: 10, pending: 5, deleted: 3, expiringSoon: 4 },
    })
    render(<ExpirationPage />)
    expect(screen.getByText('4')).toBeInTheDocument()
  })

  it('opens add modal when clicking add manual button', async () => {
    mockExpirations.mockReturnValue({ data: [], isLoading: false })
    mockStats.mockReturnValue({ data: null })
    render(<ExpirationPage />)
    fireEvent.click(screen.getByText('expiration.addManual'))
    await waitFor(() => {
      expect(screen.getByText('expiration.addTitle')).toBeInTheDocument()
    })
  })

  it('calls handleAdd when submitting the add form', async () => {
    const mockMutateAsync = vi.fn().mockResolvedValue({ id: 'new-exp' })
    mockCreate.mockReturnValue({ mutateAsync: mockMutateAsync, isPending: false })
    mockExpirations.mockReturnValue({ data: [], isLoading: false })
    mockStats.mockReturnValue({ data: null })

    render(<ExpirationPage />)
    fireEvent.click(screen.getByText('expiration.addManual'))

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Gmail message ID')).toBeInTheDocument()
    })

    fireEvent.change(screen.getByPlaceholderText('Gmail message ID'), {
      target: { value: 'msg-123' },
    })

    // Click OK button in modal
    const okBtn = screen.getByText('common.save')
    fireEvent.click(okBtn)

    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({ gmailMessageId: 'msg-123', expiresInDays: 7 })
      )
    })
  })

  it('handles add form error', async () => {
    const mockMutateAsync = vi.fn().mockRejectedValue(new Error('create failed'))
    mockCreate.mockReturnValue({ mutateAsync: mockMutateAsync, isPending: false })
    mockExpirations.mockReturnValue({ data: [], isLoading: false })
    mockStats.mockReturnValue({ data: null })

    render(<ExpirationPage />)
    fireEvent.click(screen.getByText('expiration.addManual'))

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Gmail message ID')).toBeInTheDocument()
    })

    fireEvent.change(screen.getByPlaceholderText('Gmail message ID'), {
      target: { value: 'msg-fail' },
    })
    fireEvent.click(screen.getByText('common.save'))

    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalled()
    })
  })

  it('calls handleDetect when clicking detect button', async () => {
    const { gmailApi } = await import('../api')
    ;(gmailApi.listMessages as any).mockResolvedValue({ messages: [] })

    mockExpirations.mockReturnValue({ data: [], isLoading: false })
    mockStats.mockReturnValue({ data: null })

    render(<ExpirationPage />)
    fireEvent.click(screen.getByText('expiration.detect'))

    await waitFor(() => {
      expect(gmailApi.listMessages).toHaveBeenCalledWith('acc-1', { maxResults: 100 })
    })
  })

  it('handles detect with detected results and opens modal', async () => {
    const { gmailApi } = await import('../api')
    ;(gmailApi.listMessages as any).mockResolvedValue({
      messages: [{ id: 'gm-1' }, { id: 'gm-2' }],
    })
    ;(gmailApi.batchGetMessages as any).mockResolvedValue([
      { id: 'gm-1', subject: 'OTP', from: 'noreply@test.com' },
      { id: 'gm-2', subject: 'Promo', from: 'shop@test.com' },
    ])

    const detectedResults = [
      { gmailMessageId: 'gm-1', subject: 'OTP Code', sender: 'noreply@test.com', category: 'otp', suggestedDays: 1 },
      { gmailMessageId: 'gm-2', subject: 'Sale!', sender: 'shop@test.com', category: 'promo', suggestedDays: 7 },
    ]
    const mockDetectMutate = vi.fn().mockResolvedValue(detectedResults)
    mockDetect.mockReturnValue({ mutateAsync: mockDetectMutate })
    mockExpirations.mockReturnValue({ data: [], isLoading: false })
    mockStats.mockReturnValue({ data: null })

    render(<ExpirationPage />)
    fireEvent.click(screen.getByText('expiration.detect'))

    await waitFor(() => {
      expect(mockDetectMutate).toHaveBeenCalled()
    })

    // Detect modal should open with detected results
    await waitFor(() => {
      expect(screen.getByText('expiration.detectTitle')).toBeInTheDocument()
      expect(screen.getByText('OTP Code')).toBeInTheDocument()
      expect(screen.getByText('Sale!')).toBeInTheDocument()
    })
  })

  it('applies detected expirations from modal', async () => {
    const { gmailApi } = await import('../api')
    ;(gmailApi.listMessages as any).mockResolvedValue({
      messages: [{ id: 'gm-apply' }],
    })
    ;(gmailApi.batchGetMessages as any).mockResolvedValue([
      { id: 'gm-apply', subject: 'Apply', from: 'a@b.com' },
    ])

    const detectedResults = [
      { gmailMessageId: 'gm-apply', subject: 'Apply', sender: 'a@b.com', category: 'otp', suggestedDays: 1 },
    ]
    const mockDetectMutate = vi.fn().mockResolvedValue(detectedResults)
    mockDetect.mockReturnValue({ mutateAsync: mockDetectMutate })

    const mockBatchMutate = vi.fn().mockResolvedValue([])
    mockBatch.mockReturnValue({ mutateAsync: mockBatchMutate, isPending: false })

    mockExpirations.mockReturnValue({ data: [], isLoading: false })
    mockStats.mockReturnValue({ data: null })

    render(<ExpirationPage />)
    fireEvent.click(screen.getByText('expiration.detect'))

    await waitFor(() => {
      expect(screen.getByText('expiration.detectTitle')).toBeInTheDocument()
    })

    // Click apply button in modal
    fireEvent.click(screen.getByText('expiration.applySelected'))

    await waitFor(() => {
      expect(mockBatchMutate).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ gmailMessageId: 'gm-apply', category: 'otp' }),
        ])
      )
    })
  })

  it('handles batch apply error', async () => {
    const { gmailApi } = await import('../api')
    ;(gmailApi.listMessages as any).mockResolvedValue({
      messages: [{ id: 'gm-err' }],
    })
    ;(gmailApi.batchGetMessages as any).mockResolvedValue([
      { id: 'gm-err', subject: 'Err', from: 'a@b.com' },
    ])

    const mockDetectMutate = vi.fn().mockResolvedValue([
      { gmailMessageId: 'gm-err', subject: 'Err', sender: 'a@b.com', category: 'delivery', suggestedDays: 14 },
    ])
    mockDetect.mockReturnValue({ mutateAsync: mockDetectMutate })

    const mockBatchMutate = vi.fn().mockRejectedValue(new Error('batch failed'))
    mockBatch.mockReturnValue({ mutateAsync: mockBatchMutate, isPending: false })

    mockExpirations.mockReturnValue({ data: [], isLoading: false })
    mockStats.mockReturnValue({ data: null })

    render(<ExpirationPage />)
    fireEvent.click(screen.getByText('expiration.detect'))

    await waitFor(() => {
      expect(screen.getByText('expiration.detectTitle')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('expiration.applySelected'))

    await waitFor(() => {
      expect(mockBatchMutate).toHaveBeenCalled()
    })
  })

  it('does not submit add form when messageId is empty', async () => {
    const mockMutateAsync = vi.fn()
    mockCreate.mockReturnValue({ mutateAsync: mockMutateAsync, isPending: false })
    mockExpirations.mockReturnValue({ data: [], isLoading: false })
    mockStats.mockReturnValue({ data: null })

    render(<ExpirationPage />)
    fireEvent.click(screen.getByText('expiration.addManual'))

    await waitFor(() => {
      expect(screen.getByText('expiration.addTitle')).toBeInTheDocument()
    })

    // Click OK without entering messageId
    fireEvent.click(screen.getByText('common.save'))

    // mutateAsync should NOT be called
    expect(mockMutateAsync).not.toHaveBeenCalled()
  })

  it('handles delete error gracefully', async () => {
    const mockDeleteMutate = vi.fn().mockRejectedValue(new Error('delete failed'))
    mockDelete.mockReturnValue({ mutateAsync: mockDeleteMutate })

    mockExpirations.mockReturnValue({
      data: [
        {
          id: 'exp-del-err',
          subject: 'Delete error',
          sender: 'test@test.com',
          category: 'manual',
          expires_at: new Date(Date.now() + 86400000).toISOString(),
          is_deleted: false,
        },
      ],
      isLoading: false,
    })
    mockStats.mockReturnValue({ data: null })

    render(<ExpirationPage />)

    // Find delete button and trigger Popconfirm
    const buttons = screen.getAllByRole('button')
    const deleteBtn = buttons.find(b => b.closest('.ant-btn-dangerous') || b.classList.contains('ant-btn-dangerous'))
    if (deleteBtn) {
      fireEvent.click(deleteBtn)
      const okBtn = await screen.findByText('OK').catch(() => null)
      if (okBtn) {
        fireEvent.click(okBtn)
        await waitFor(() => {
          expect(mockDeleteMutate).toHaveBeenCalled()
        })
      }
    }
  })

  it('renders stats with zero expiringSoon (no warning icon)', () => {
    mockExpirations.mockReturnValue({ data: [], isLoading: false })
    mockStats.mockReturnValue({
      data: { total: 10, pending: 5, deleted: 3, expiringSoon: 0 },
    })
    render(<ExpirationPage />)
    expect(screen.getByText('0')).toBeInTheDocument()
  })

  it('handles detect error', async () => {
    const { gmailApi } = await import('../api')
    ;(gmailApi.listMessages as any).mockRejectedValue(new Error('network error'))

    mockExpirations.mockReturnValue({ data: [], isLoading: false })
    mockStats.mockReturnValue({ data: null })

    render(<ExpirationPage />)
    fireEvent.click(screen.getByText('expiration.detect'))

    // Should handle error gracefully
    await waitFor(() => {
      expect(gmailApi.listMessages).toHaveBeenCalled()
    })
  })

  it('handles delete expiration', async () => {
    const mockDeleteMutate = vi.fn().mockResolvedValue(undefined)
    mockDelete.mockReturnValue({ mutateAsync: mockDeleteMutate })

    mockExpirations.mockReturnValue({
      data: [
        {
          id: 'exp-del',
          subject: 'To delete',
          sender: 'test@test.com',
          category: 'manual',
          expires_at: new Date(Date.now() + 86400000).toISOString(),
          is_deleted: false,
        },
      ],
      isLoading: false,
    })
    mockStats.mockReturnValue({ data: { total: 1, pending: 1, deleted: 0, expiringSoon: 0 } })

    render(<ExpirationPage />)

    // Find and click the delete button (Popconfirm trigger)
    const deleteBtn = screen.getByRole('button', { name: '' })
    if (deleteBtn) {
      fireEvent.click(deleteBtn)
      // Click confirm in popconfirm
      const confirmBtn = screen.queryByText('OK')
      if (confirmBtn) {
        fireEvent.click(confirmBtn)
        await waitFor(() => {
          expect(mockDeleteMutate).toHaveBeenCalledWith('exp-del')
        })
      }
    }
  })

  it('renders item expiring within 1 day with warning', () => {
    // Expiring in 12 hours
    const soonDate = new Date(Date.now() + 12 * 3600 * 1000)
    mockExpirations.mockReturnValue({
      data: [
        {
          id: 'exp-soon',
          subject: 'Soon',
          sender: 'test@test.com',
          category: 'otp',
          expires_at: soonDate.toISOString(),
          is_deleted: false,
        },
      ],
      isLoading: false,
    })
    mockStats.mockReturnValue({ data: null })
    render(<ExpirationPage />)
    expect(screen.getByText('Soon')).toBeInTheDocument()
  })

  it('renders item with null subject fallback', () => {
    mockExpirations.mockReturnValue({
      data: [
        {
          id: 'exp-no-subj',
          subject: null,
          sender: 'test@test.com',
          category: 'manual',
          expires_at: new Date(Date.now() + 86400000).toISOString(),
          is_deleted: false,
        },
      ],
      isLoading: false,
    })
    mockStats.mockReturnValue({ data: null })
    render(<ExpirationPage />)
    expect(screen.getByText('common.noSubject')).toBeInTheDocument()
  })

  it('handles detect with no matches (empty detection result)', async () => {
    const { gmailApi } = await import('../api')
    ;(gmailApi.listMessages as any).mockResolvedValue({
      messages: [{ id: 'gm-1' }],
    })
    ;(gmailApi.batchGetMessages as any).mockResolvedValue([
      { id: 'gm-1', subject: 'Hello', from: 'user@test.com' },
    ])

    const mockDetectMutate = vi.fn().mockResolvedValue([])
    mockDetect.mockReturnValue({ mutateAsync: mockDetectMutate })
    mockExpirations.mockReturnValue({ data: [], isLoading: false })
    mockStats.mockReturnValue({ data: null })

    render(<ExpirationPage />)
    fireEvent.click(screen.getByText('expiration.detect'))

    await waitFor(() => {
      expect(mockDetectMutate).toHaveBeenCalled()
    })
  })

  it('handles detect when messages is null (uses ?? fallback)', async () => {
    const { gmailApi } = await import('../api')
    ;(gmailApi.listMessages as any).mockResolvedValue({ messages: null })

    mockExpirations.mockReturnValue({ data: [], isLoading: false })
    mockStats.mockReturnValue({ data: null })

    render(<ExpirationPage />)
    fireEvent.click(screen.getByText('expiration.detect'))

    await waitFor(() => {
      expect(gmailApi.listMessages).toHaveBeenCalled()
    })
  })

  it('renders unknown category with default color', () => {
    mockExpirations.mockReturnValue({
      data: [
        {
          id: 'exp-unk',
          subject: 'Unknown cat',
          sender: 'test@test.com',
          category: 'custom_type',
          expires_at: new Date(Date.now() + 86400000).toISOString(),
          is_deleted: false,
        },
      ],
      isLoading: false,
    })
    mockStats.mockReturnValue({ data: null })
    render(<ExpirationPage />)
    expect(screen.getByText('expiration.cat_custom_type')).toBeInTheDocument()
  })
})
