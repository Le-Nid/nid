import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { toast } from 'sonner'
import i18n from '../i18n'
import { privacyApi } from '../api'

vi.mock('../api', () => ({ privacyApi: { getEncryptionStatus: vi.fn(), decryptAll: vi.fn() } }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

import { DecryptArchivesCard } from '../pages/settings/DecryptArchivesCard'

const wrap = () => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <DecryptArchivesCard accountId="acc-1" email="box@gmail.com" />
  </QueryClientProvider>,
)

beforeAll(() => i18n.changeLanguage('fr'))
beforeEach(() => vi.clearAllMocks())

describe('DecryptArchivesCard', () => {
  it('hidden without encrypted archives', async () => {
    vi.mocked(privacyApi.getEncryptionStatus).mockResolvedValue({ total: 5, encrypted: 0 })
    const { container } = wrap()
    await waitFor(() => expect(privacyApi.getEncryptionStatus).toHaveBeenCalledWith('acc-1'))
    expect(container).toBeEmptyDOMElement()
  })

  it('decrypts with the passphrase; a wrong one or a failure is reported', async () => {
    const user = userEvent.setup()
    vi.mocked(privacyApi.getEncryptionStatus).mockResolvedValue({ total: 5, encrypted: 2 })
    vi.mocked(privacyApi.decryptAll)
      .mockRejectedValueOnce(Object.assign(new Error('x'), { response: { status: 403 } }))
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce({ jobId: 'j1' })
    wrap()
    expect(await screen.findByText(/2 archives de box@gmail.com sont encore chiffrées/)).toBeInTheDocument()
    const field = screen.getByLabelText('Phrase secrète')
    expect(screen.getByRole('button', { name: 'Déchiffrer' })).toBeDisabled()

    await user.type(field, 'bad{Enter}')
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Phrase secrète incorrecte.'))
    await user.click(screen.getByRole('button', { name: 'Déchiffrer' }))
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Le déchiffrement n'a pas pu être lancé."))
    await user.click(screen.getByRole('button', { name: 'Déchiffrer' }))
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Déchiffrement lancé', { description: 'Une notification vous préviendra à la fin.' }))
    expect(privacyApi.decryptAll).toHaveBeenLastCalledWith('acc-1', 'bad')
    expect(field).toHaveValue('')
  })
})
