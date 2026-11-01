import { isPublicHost } from '../utils/net'

export type ImapServer = { host: string; port: number; secure: boolean }
export type ImapDiscovery = ImapServer & { source: 'ispdb' | 'domain' | 'guess' }

const TIMEOUT_MS = 3000
const MAX_BYTES = 64 * 1024

/** The `imap` incoming servers of a Thunderbird autoconfig file, SSL first, then STARTTLS; plain text is never offered. */
export function parseAutoconfig(xml: string, domain: string): ImapServer | null {
  const servers: (ImapServer & { rank: number })[] = []
  for (const [, block] of xml.matchAll(/<incomingServer\s+type="imap"\s*>([\s\S]*?)<\/incomingServer>/gi)) {
    const tag = (name: string) => new RegExp(`<${name}>\\s*([^<]*?)\\s*</${name}>`, 'i').exec(block)?.[1] ?? ''
    const host = tag('hostname').replaceAll('%EMAILDOMAIN%', domain).toLowerCase()
    const port = Number(tag('port'))
    const rank = ['SSL', 'STARTTLS'].indexOf(tag('socketType').toUpperCase())
    if (host && !host.includes('%') && Number.isInteger(port) && port > 0 && port < 65536 && rank >= 0) {
      servers.push({ host, port, secure: rank === 0, rank })
    }
  }
  const best = servers.sort((a, b) => a.rank - b.rank)[0]
  return best ? { host: best.host, port: best.port, secure: best.secure } : null
}

/**
 * The body of a GET on a public host, or null: private network (SSRF guard), redirect, error, slow or large answer.
 * The domain comes from what the user typed, so its autoconfig host may point anywhere.
 */
async function fetchText(url: string): Promise<string | null> {
  try {
    if (!(await isPublicHost(new URL(url).hostname))) return null
    const res = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(TIMEOUT_MS) })
    if (!res.ok || !res.body) return null
    let text = ''
    const decoder = new TextDecoder()
    for await (const chunk of res.body) {
      text += decoder.decode(chunk, { stream: true })
      if (text.length > MAX_BYTES) return null
    }
    return text
  } catch {
    return null
  }
}

/**
 * Server settings for an address: Mozilla's ISPDB, then the domain's own autoconfig file, else `imap.<domain>:993` TLS.
 * Both lookups run at once (3 s each at most); the ISPDB wins when both answer.
 */
export async function discoverImap(email: string): Promise<ImapDiscovery> {
  const domain = email.slice(email.lastIndexOf('@') + 1).toLowerCase()
  const [ispdb, own] = await Promise.all([
    fetchText(`https://autoconfig.thunderbird.net/v1.1/${encodeURIComponent(domain)}`),
    fetchText(`https://autoconfig.${domain}/mail/config-v1.1.xml?emailaddress=${encodeURIComponent(email)}`),
  ])
  const fromIspdb = ispdb && parseAutoconfig(ispdb, domain)
  if (fromIspdb) return { ...fromIspdb, source: 'ispdb' }
  const fromDomain = own && parseAutoconfig(own, domain)
  if (fromDomain) return { ...fromDomain, source: 'domain' }
  return { host: `imap.${domain}`, port: 993, secure: true, source: 'guess' }
}
