import { act, render } from '@testing-library/react'
import { useState } from 'react'
import { flushSync } from 'react-dom'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { useArchiveFilters } from '@/pages/archives/shared'

// Two filters written in a row with a render in between that still sees the old URL (the navigation is async):
// the second write must start from the first one, not from that render's params
it('quick successive writes never drop each other', async () => {
  const api: { set?: ReturnType<typeof useArchiveFilters>['set']; bump?: () => void } = {}
  function Probe() {
    const [, setN] = useState(0)
    api.set = useArchiveFilters().set
    api.bump = () => setN((n) => n + 1)
    return null
  }
  const router = createMemoryRouter([{ path: '/archives', element: <Probe /> }], { initialEntries: ['/archives'] })
  render(<RouterProvider router={router} />)
  await act(async () => {
    api.set!({ smin: '1' })
    flushSync(() => api.bump!()) // renders now, before the router applied smin
    api.set!({ smax: '2' })
  })
  expect(new URLSearchParams(router.state.location.search).toString()).toBe('smin=1&smax=2')
})
