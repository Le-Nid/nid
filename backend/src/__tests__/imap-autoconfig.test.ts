const lookup = vi.hoisted(() => vi.fn())
vi.mock('node:dns/promises', () => ({ lookup }))

import { discoverImap, parseAutoconfig } from '../imap/autoconfig'

const xml = (servers: string) => `<?xml version="1.0"?><clientConfig version="1.1"><emailProvider id="x">${servers}
  <outgoingServer type="smtp"><hostname>smtp.x.fr</hostname><port>465</port><socketType>SSL</socketType></outgoingServer></emailProvider></clientConfig>`
const imap = (host: string, port: number, socket: string) =>
  `<incomingServer type="imap"><hostname>${host}</hostname><port>${port}</port><socketType>${socket}</socketType></incomingServer>`
const pop = '<incomingServer type="pop3"><hostname>pop.x.fr</hostname><port>995</port><socketType>SSL</socketType></incomingServer>'

const fetchMock = vi.fn()
beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock)
  fetchMock.mockReset()
  lookup.mockReset().mockResolvedValue([{ address: '93.184.216.34' }])
})
afterAll(() => vi.unstubAllGlobals())

const ok = (body: string) => ({ ok: true, body: [new TextEncoder().encode(body)] })

describe('parseAutoconfig', () => {
  it('takes the IMAP server, SSL before STARTTLS, with %EMAILDOMAIN% filled; never plain text', () => {
    expect(parseAutoconfig(xml(pop + imap('imap.%EMAILDOMAIN%', 143, 'STARTTLS') + imap('IMAP.ex.fr', 993, 'SSL')), 'ex.fr'))
      .toEqual({ host: 'imap.ex.fr', port: 993, secure: true })
    expect(parseAutoconfig(xml(imap('mail.ex.fr', 143, 'STARTTLS')), 'ex.fr')).toEqual({ host: 'mail.ex.fr', port: 143, secure: false })
    expect(parseAutoconfig(xml(imap('mail.ex.fr', 143, 'plain')), 'ex.fr')).toBeNull()
    expect(parseAutoconfig(xml(imap('%EMAILLOCALPART%.ex.fr', 993, 'SSL') + imap('m.ex.fr', 0, 'SSL')), 'ex.fr')).toBeNull()
    expect(parseAutoconfig('not xml', 'ex.fr')).toBeNull()
  })
})

describe('discoverImap', () => {
  it('ISPDB first; both lookups bounded, no redirect followed', async () => {
    fetchMock.mockImplementation(async (url: string) => (url.includes('thunderbird') ? ok(xml(imap('imap.gmx.net', 993, 'SSL'))) : ok(xml(imap('other.gmx.fr', 993, 'SSL')))))
    expect(await discoverImap('ana@gmx.fr')).toEqual({ host: 'imap.gmx.net', port: 993, secure: true, source: 'ispdb' })
    expect(fetchMock.mock.calls.map((c) => c[0])).toEqual([
      'https://autoconfig.thunderbird.net/v1.1/gmx.fr',
      'https://autoconfig.gmx.fr/mail/config-v1.1.xml?emailaddress=ana%40gmx.fr',
    ])
    for (const [, init] of fetchMock.mock.calls) {
      expect(init.redirect).toBe('error')
      expect(init.signal).toBeInstanceOf(AbortSignal)
    }
  })

  it("then the domain's own autoconfig; else imap.<domain>:993 TLS", async () => {
    fetchMock.mockImplementation(async (url: string) => (url.includes('thunderbird') ? { ok: false } : ok(xml(imap('mail.perso.fr', 993, 'SSL')))))
    expect(await discoverImap('a@perso.fr')).toMatchObject({ host: 'mail.perso.fr', source: 'domain' })
    fetchMock.mockRejectedValue(new Error('timeout'))
    expect(await discoverImap('a@perso.fr')).toEqual({ host: 'imap.perso.fr', port: 993, secure: true, source: 'guess' })
  })

  it('SSRF: a domain resolving to a private address is never fetched', async () => {
    lookup.mockImplementation(async (host: string) => (host === 'autoconfig.corp.fr' ? [{ address: '10.0.0.5' }] : [{ address: '93.184.216.34' }]))
    fetchMock.mockResolvedValue({ ok: false })
    await discoverImap('a@corp.fr')
    expect(fetchMock.mock.calls.map((c) => c[0])).toEqual(['https://autoconfig.thunderbird.net/v1.1/corp.fr'])
    lookup.mockRejectedValue(new Error('ENOTFOUND'))
    fetchMock.mockClear()
    expect((await discoverImap('a@nowhere.fr')).source).toBe('guess')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('an answer over 64 KB is dropped', async () => {
    fetchMock.mockImplementation(async (url: string) => (url.includes('thunderbird') ? ok(xml(imap('imap.big.fr', 993, 'SSL')) + ' '.repeat(70_000)) : { ok: false }))
    expect((await discoverImap('a@big.fr')).source).toBe('guess')
  })
})
