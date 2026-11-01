import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { Toaster } from 'sonner'
import i18n from '../i18n'
import { showUndoToast } from '../components/app/UndoToast'

beforeAll(() => i18n.changeLanguage('fr'))
beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }))
afterEach(() => vi.useRealTimers())

const message = () => 'Suppression de 3 mails'

describe('showUndoToast', () => {
  it('counts down, then closes on its own at the deadline', async () => {
    render(<Toaster />)
    act(() => { showUndoToast({ message: message(), description: 'Vers la corbeille Gmail · suivi dans Activité', onUndo: vi.fn() }) })

    // Announced once, politely, through the sonner region; the ticking copy is hidden from it
    expect(await screen.findByText('Suppression de 3 mails dans 10 s', { selector: '.sr-only' })).toBeInTheDocument()
    expect(screen.getByText('Vers la corbeille Gmail · suivi dans Activité')).toBeInTheDocument()

    act(() => { vi.advanceTimersByTime(3000) })
    expect(screen.getByText('Suppression de 3 mails dans 7 s')).toHaveAttribute('aria-hidden', 'true')

    act(() => { vi.advanceTimersByTime(7500) })
    act(() => { vi.advanceTimersByTime(1000) }) // sonner exit animation
    expect(screen.queryByRole('button', { name: 'Annuler' })).not.toBeInTheDocument()
  })

  it('calls onUndo and closes when « Annuler » is pressed', async () => {
    const onUndo = vi.fn()
    render(<Toaster />)
    act(() => { showUndoToast({ message: message(), onUndo, delayMs: 5000 }) })

    // fireEvent: sonner's swipe handler needs setPointerCapture, missing from jsdom
    fireEvent.click(await screen.findByRole('button', { name: 'Annuler' }))
    expect(onUndo).toHaveBeenCalledOnce()
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Annuler' })).not.toBeInTheDocument())
  })
})
