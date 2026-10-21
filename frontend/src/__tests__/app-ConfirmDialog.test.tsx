import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import i18n from '../i18n'
import { ConfirmDialog } from '../components/app/ConfirmDialog'

beforeAll(() => i18n.changeLanguage('fr'))

function renderDialog(onConfirm = vi.fn()) {
  render(
    <ConfirmDialog
      trigger={<button type="button">Vider la corbeille</button>}
      title="Supprimer définitivement 12 archives ?"
      description="Cette action est irréversible."
      confirmLabel="Supprimer définitivement 12 archives"
      onConfirm={onConfirm}
      destructive
    />,
  )
  return onConfirm
}

describe('ConfirmDialog', () => {
  it('opens on the trigger with focus on « Annuler », and cancels without confirming', async () => {
    const onConfirm = renderDialog()
    const trigger = screen.getByRole('button', { name: 'Vider la corbeille' })
    await userEvent.click(trigger)

    const dialog = await screen.findByRole('alertdialog', { name: 'Supprimer définitivement 12 archives ?' })
    expect(dialog).toHaveAccessibleDescription('Cette action est irréversible.')
    expect(screen.getByRole('button', { name: 'Annuler' })).toHaveFocus()

    await userEvent.click(screen.getByRole('button', { name: 'Annuler' }))
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(onConfirm).not.toHaveBeenCalled()
    expect(trigger).toHaveFocus()
  })

  it('confirms with the explicit, destructive action', async () => {
    const onConfirm = renderDialog()
    await userEvent.click(screen.getByRole('button', { name: 'Vider la corbeille' }))
    const confirm = await screen.findByRole('button', { name: 'Supprimer définitivement 12 archives' })
    expect(confirm).toHaveClass('bg-destructive-solid')

    await userEvent.click(confirm)
    expect(onConfirm).toHaveBeenCalledOnce()
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })

  it('closes on Escape', async () => {
    renderDialog()
    await userEvent.click(screen.getByRole('button', { name: 'Vider la corbeille' }))
    await screen.findByRole('alertdialog')
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })
})
