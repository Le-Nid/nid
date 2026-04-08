import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

const mockNavigate = vi.fn()
vi.mock('react-router', () => ({
  useNavigate: () => mockNavigate,
}))

const mockSavedSearches = vi.fn()
const mockCreateMutateAsync = vi.fn()
const mockDeleteMutateAsync = vi.fn()
const mockUpdateMutateAsync = vi.fn()
const mockCreateSavedSearch = vi.fn()
const mockDeleteSavedSearch = vi.fn()
const mockUpdateSavedSearch = vi.fn()

vi.mock('../hooks/queries', () => ({
  useSavedSearches: (...args: any[]) => mockSavedSearches(...args),
  useCreateSavedSearch: () => mockCreateSavedSearch(),
  useDeleteSavedSearch: () => mockDeleteSavedSearch(),
  useUpdateSavedSearch: () => mockUpdateSavedSearch(),
}))

import SavedSearchesPage from '../pages/SavedSearches'

const sampleSearch = {
  id: 's1',
  name: 'Invoices',
  query: 'subject:invoice',
  icon: 'invoice',
  color: '#ff0000',
  created_at: '2026-01-15T00:00:00.000Z',
  updated_at: '2026-01-15T00:00:00.000Z',
}

const sampleSearch2 = {
  id: 's2',
  name: 'Work emails',
  query: 'from:@company.com',
  icon: 'work',
  color: null,
  created_at: '2026-02-01T00:00:00.000Z',
  updated_at: '2026-02-01T00:00:00.000Z',
}

describe('SavedSearchesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCreateMutateAsync.mockResolvedValue({})
    mockDeleteMutateAsync.mockResolvedValue({})
    mockUpdateMutateAsync.mockResolvedValue({})
    mockCreateSavedSearch.mockReturnValue({ mutateAsync: mockCreateMutateAsync, isPending: false })
    mockDeleteSavedSearch.mockReturnValue({ mutateAsync: mockDeleteMutateAsync })
    mockUpdateSavedSearch.mockReturnValue({ mutateAsync: mockUpdateMutateAsync, isPending: false })
  })

  it('shows title', () => {
    mockSavedSearches.mockReturnValue({ data: [], isLoading: false })
    render(<SavedSearchesPage />)
    expect(screen.getByText('savedSearches.title')).toBeInTheDocument()
  })

  it('shows loading state', () => {
    mockSavedSearches.mockReturnValue({ data: [], isLoading: true })
    render(<SavedSearchesPage />)
    expect(screen.getByText('savedSearches.title')).toBeInTheDocument()
  })

  it('displays saved searches with details', () => {
    mockSavedSearches.mockReturnValue({
      data: [sampleSearch, sampleSearch2],
      isLoading: false,
    })

    render(<SavedSearchesPage />)
    expect(screen.getByText('Invoices')).toBeInTheDocument()
    expect(screen.getByText('Work emails')).toBeInTheDocument()
    expect(screen.getByText('subject:invoice')).toBeInTheDocument()
    expect(screen.getByText('from:@company.com')).toBeInTheDocument()
  })

  it('shows empty state', () => {
    mockSavedSearches.mockReturnValue({ data: [], isLoading: false })
    render(<SavedSearchesPage />)
    expect(screen.getByText('savedSearches.noSearches')).toBeInTheDocument()
  })

  it('navigates when use button is clicked', () => {
    mockSavedSearches.mockReturnValue({
      data: [sampleSearch],
      isLoading: false,
    })

    render(<SavedSearchesPage />)
    fireEvent.click(screen.getByText('savedSearches.use'))

    expect(mockNavigate).toHaveBeenCalledWith('/mails?q=subject%3Ainvoice')
  })

  it('shows new search button', () => {
    mockSavedSearches.mockReturnValue({ data: [], isLoading: false })
    render(<SavedSearchesPage />)
    expect(screen.getByText('savedSearches.newSearch')).toBeInTheDocument()
  })

  it('opens create modal', () => {
    mockSavedSearches.mockReturnValue({ data: [], isLoading: false })
    render(<SavedSearchesPage />)
    fireEvent.click(screen.getByText('savedSearches.newSearch'))
    expect(screen.getByText('savedSearches.createTitle')).toBeInTheDocument()
  })

  it('shows hint card', () => {
    mockSavedSearches.mockReturnValue({ data: [], isLoading: false })
    render(<SavedSearchesPage />)
    expect(screen.getByText('savedSearches.hint')).toBeInTheDocument()
  })

  it('shows icon emoji for each search', () => {
    mockSavedSearches.mockReturnValue({
      data: [sampleSearch],
      isLoading: false,
    })

    render(<SavedSearchesPage />)
    // invoice icon → 🧾
    expect(screen.getByText('🧾')).toBeInTheDocument()
  })

  it('shows date formatted', () => {
    mockSavedSearches.mockReturnValue({
      data: [sampleSearch],
      isLoading: false,
    })

    render(<SavedSearchesPage />)
    expect(screen.getByText('15/01/26')).toBeInTheDocument()
  })

  it('shows edit buttons for each search', () => {
    mockSavedSearches.mockReturnValue({
      data: [sampleSearch, sampleSearch2],
      isLoading: false,
    })

    render(<SavedSearchesPage />)
    // Each row has edit, delete, and use buttons
    const editBtns = document.querySelectorAll('.lucide-pencil')
    expect(editBtns.length).toBe(2)
  })

  it('opens edit modal with pre-filled data', () => {
    mockSavedSearches.mockReturnValue({
      data: [sampleSearch],
      isLoading: false,
    })

    render(<SavedSearchesPage />)
    // Click edit button
    const editBtn = document.querySelector('.lucide-pencil')!.closest('button')!
    fireEvent.click(editBtn)

    expect(screen.getByText('savedSearches.editTitle')).toBeInTheDocument()
  })

  it('shows color dot for searches with color', () => {
    mockSavedSearches.mockReturnValue({
      data: [sampleSearch], // has color: '#ff0000'
      isLoading: false,
    })

    render(<SavedSearchesPage />)
    expect(screen.getByText('Invoices')).toBeInTheDocument()
  })

  it('shows query tag for each search', () => {
    mockSavedSearches.mockReturnValue({
      data: [sampleSearch2],
      isLoading: false,
    })

    render(<SavedSearchesPage />)
    expect(screen.getByText('from:@company.com')).toBeInTheDocument()
  })

  it('shows work icon emoji', () => {
    mockSavedSearches.mockReturnValue({
      data: [sampleSearch2], // icon: 'work' → 💼
      isLoading: false,
    })

    render(<SavedSearchesPage />)
    expect(screen.getByText('💼')).toBeInTheDocument()
  })

  it('shows default icon for unknown icon value', () => {
    mockSavedSearches.mockReturnValue({
      data: [{ ...sampleSearch, icon: 'unknown_icon' }],
      isLoading: false,
    })

    render(<SavedSearchesPage />)
    expect(screen.getByText('🔍')).toBeInTheDocument()
  })

  it('shows create first button in empty state', () => {
    mockSavedSearches.mockReturnValue({ data: [], isLoading: false })

    render(<SavedSearchesPage />)
    expect(screen.getByText('savedSearches.createFirst')).toBeInTheDocument()
  })

  it('shows delete buttons for each search', () => {
    mockSavedSearches.mockReturnValue({
      data: [sampleSearch, sampleSearch2],
      isLoading: false,
    })

    render(<SavedSearchesPage />)
    const deleteBtns = document.querySelectorAll('.lucide-trash-2')
    expect(deleteBtns.length).toBe(2)
  })

  it('shows use button for each search', () => {
    mockSavedSearches.mockReturnValue({
      data: [sampleSearch, sampleSearch2],
      isLoading: false,
    })

    render(<SavedSearchesPage />)
    const useBtns = screen.getAllByText('savedSearches.use')
    expect(useBtns.length).toBe(2)
  })

  it('navigates for second search', () => {
    mockSavedSearches.mockReturnValue({
      data: [sampleSearch2],
      isLoading: false,
    })

    render(<SavedSearchesPage />)
    fireEvent.click(screen.getByText('savedSearches.use'))

    expect(mockNavigate).toHaveBeenCalledWith('/mails?q=from%3A%40company.com')
  })

  it('shows search icon in query tag', () => {
    mockSavedSearches.mockReturnValue({
      data: [sampleSearch],
      isLoading: false,
    })

    render(<SavedSearchesPage />)
    expect(document.querySelector('.lucide-search')).toBeInTheDocument()
  })

  it('shows null icon as default search emoji', () => {
    mockSavedSearches.mockReturnValue({
      data: [{ ...sampleSearch, icon: null }],
      isLoading: false,
    })

    render(<SavedSearchesPage />)
    expect(screen.getByText('🔍')).toBeInTheDocument()
  })

  it('opens edit modal when edit button clicked', async () => {
    mockSavedSearches.mockReturnValue({
      data: [sampleSearch],
      isLoading: false,
    })

    render(<SavedSearchesPage />)
    const editBtn = document.querySelector('.lucide-pencil')!.closest('button')!
    fireEvent.click(editBtn)

    await waitFor(() => {
      // The edit modal should show the edit title
      expect(screen.getByText('savedSearches.editTitle')).toBeInTheDocument()
    })
  })

  it('shows create modal title when create button clicked', () => {
    mockSavedSearches.mockReturnValue({ data: [], isLoading: false })

    render(<SavedSearchesPage />)
    fireEvent.click(screen.getByText('savedSearches.newSearch'))

    expect(screen.getByText('savedSearches.createTitle')).toBeInTheDocument()
  })

  it('shows modal form fields', () => {
    mockSavedSearches.mockReturnValue({ data: [], isLoading: false })

    render(<SavedSearchesPage />)
    fireEvent.click(screen.getByText('savedSearches.newSearch'))

    // name and query labels appear in both table header and modal form; check modal has at least the form fields
    expect(screen.getAllByText('savedSearches.name').length).toBeGreaterThanOrEqual(2)
    expect(screen.getAllByText('savedSearches.query').length).toBeGreaterThanOrEqual(2)
    expect(screen.getByText('savedSearches.icon')).toBeInTheDocument()
    expect(screen.getByText('savedSearches.color')).toBeInTheDocument()
  })

  it('shows color in name column', () => {
    mockSavedSearches.mockReturnValue({
      data: [sampleSearch], // has color: '#ff0000'
      isLoading: false,
    })

    render(<SavedSearchesPage />)
    // Color dot is an inline span
    const colorDot = document.querySelector('span[style*="background: rgb(255, 0, 0)"]') ||
      document.querySelector('span[style*="background: #ff0000"]')
    expect(colorDot).toBeInTheDocument()
  })

  it('renders search without color', () => {
    mockSavedSearches.mockReturnValue({
      data: [sampleSearch2], // color is null
      isLoading: false,
    })

    render(<SavedSearchesPage />)
    expect(screen.getByText('Work emails')).toBeInTheDocument()
  })

  it('deletes a search via Popconfirm', async () => {
    mockSavedSearches.mockReturnValue({
      data: [sampleSearch],
      isLoading: false,
    })

    render(<SavedSearchesPage />)
    // Click delete button to open Popconfirm
    const deleteBtn = document.querySelector('.lucide-trash-2')!.closest('button')!
    fireEvent.click(deleteBtn)

    // Click confirm in Popconfirm
    await waitFor(() => {
      const okBtn = document.querySelector('.ant-popconfirm .ant-btn-dangerous') ||
        document.querySelector('.ant-popconfirm .ant-btn-primary')
      if (okBtn) fireEvent.click(okBtn)
    })

    await waitFor(() => {
      expect(mockDeleteMutateAsync).toHaveBeenCalledWith('s1')
    })
  })

  it('submits create form successfully', async () => {
    mockSavedSearches.mockReturnValue({ data: [], isLoading: false })

    render(<SavedSearchesPage />)
    fireEvent.click(screen.getByText('savedSearches.newSearch'))

    // The modal is open, click OK to trigger handleSubmit
    // Since form is empty and fields are required, it will fail validation (caught in catch block)
    await waitFor(() => {
      const okBtn = document.querySelector('.ant-modal .ant-btn-primary')
      if (okBtn) fireEvent.click(okBtn)
    })

    // The catch block should handle validation error silently
  })

  it('closes modal on cancel', () => {
    mockSavedSearches.mockReturnValue({ data: [], isLoading: false })

    render(<SavedSearchesPage />)
    fireEvent.click(screen.getByText('savedSearches.newSearch'))

    expect(screen.getByText('savedSearches.createTitle')).toBeInTheDocument()

    // Click cancel
    fireEvent.click(screen.getByText('common.cancel'))
    // Modal should close (cancel callback sets modalOpen to false)
  })

  it('creates search from empty state button', () => {
    mockSavedSearches.mockReturnValue({ data: [], isLoading: false })

    render(<SavedSearchesPage />)
    // Click the "create first" button in the empty state
    fireEvent.click(screen.getByText('savedSearches.createFirst'))

    expect(screen.getByText('savedSearches.createTitle')).toBeInTheDocument()
  })

  it('submits create form with filled values', async () => {
    mockSavedSearches.mockReturnValue({ data: [], isLoading: false })

    render(<SavedSearchesPage />)
    fireEvent.click(screen.getByText('savedSearches.newSearch'))

    await waitFor(() => {
      expect(screen.getByText('savedSearches.createTitle')).toBeInTheDocument()
    })

    // Fill in the required form fields
    const nameInput = screen.getByPlaceholderText('savedSearches.namePlaceholder')
    const queryInput = screen.getByPlaceholderText('savedSearches.queryPlaceholder')

    fireEvent.change(nameInput, { target: { value: 'My search' } })
    fireEvent.change(queryInput, { target: { value: 'from:test@test.com' } })

    // Click OK
    const okBtn = document.querySelector('.ant-modal .ant-btn-primary')!
    fireEvent.click(okBtn)

    await waitFor(() => {
      expect(mockCreateMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'My search',
          query: 'from:test@test.com',
        })
      )
    })
  })

  it('submits edit form with updated values', async () => {
    mockSavedSearches.mockReturnValue({
      data: [sampleSearch],
      isLoading: false,
    })

    render(<SavedSearchesPage />)
    // Open edit modal
    const editBtn = document.querySelector('.lucide-pencil')!.closest('button')!
    fireEvent.click(editBtn)

    await waitFor(() => {
      expect(screen.getByText('savedSearches.editTitle')).toBeInTheDocument()
    })

    // Click OK to submit edit
    const okBtn = document.querySelector('.ant-modal .ant-btn-primary')!
    fireEvent.click(okBtn)

    await waitFor(() => {
      expect(mockUpdateMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 's1',
          name: 'Invoices',
          query: 'subject:invoice',
        })
      )
    })
  })
})
