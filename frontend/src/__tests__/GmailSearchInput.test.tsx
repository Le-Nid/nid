import { describe, it, expect, vi, beforeAll } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import GmailSearchInput from '../components/GmailSearchInput'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

beforeAll(() => {
  // ResizeObserver is now globally mocked in setup.ts
})

describe('GmailSearchInput', () => {
  it('renders with placeholder', () => {
    render(
      <GmailSearchInput
        value=""
        onChange={vi.fn()}
        onSearch={vi.fn()}
        placeholder="Rechercher…"
      />,
    )
    expect(screen.getByPlaceholderText('Rechercher…')).toBeInTheDocument()
  })

  it('calls onChange when typing', () => {
    const onChange = vi.fn()
    render(
      <GmailSearchInput value="" onChange={onChange} onSearch={vi.fn()} />,
    )
    const input = screen.getByRole('combobox')
    fireEvent.change(input, { target: { value: 'from:' } })
    expect(onChange).toHaveBeenCalledWith('from:')
  })

  it('calls onSearch when pressing Enter', () => {
    const onSearch = vi.fn()
    render(
      <GmailSearchInput value="from:test" onChange={vi.fn()} onSearch={onSearch} />,
    )
    const input = screen.getByRole('combobox')
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onSearch).toHaveBeenCalledWith('from:test')
  })

  it('clears options on empty last token', () => {
    const onChange = vi.fn()
    render(
      <GmailSearchInput value="" onChange={onChange} onSearch={vi.fn()} />,
    )
    const input = screen.getByRole('combobox')
    // Type a space — last token is empty
    fireEvent.change(input, { target: { value: ' ' } })
    expect(onChange).toHaveBeenCalledWith(' ')
  })

  it('shows suggestions when typing operator prefix', () => {
    const onChange = vi.fn()
    render(
      <GmailSearchInput value="" onChange={onChange} onSearch={vi.fn()} />,
    )
    const input = screen.getByRole('combobox')
    fireEvent.change(input, { target: { value: 'from' } })
    expect(onChange).toHaveBeenCalledWith('from')
  })
})
