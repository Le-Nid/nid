import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'
import ipaddr from 'ipaddr.js'

/**
 * Anything but a public unicast address: loopback, private, link-local (cloud metadata), CGNAT, unique-local,
 * multicast, reserved… Ranges named by ipaddr.js (RFC lists), an IPv4-mapped IPv6 checked as IPv4.
 */
export function isPrivateAddress(address: string): boolean {
  if (!ipaddr.isValid(address)) return true
  return ipaddr.process(address).range() !== 'unicast'
}

/**
 * True when the host (name or IP literal, IPv6 bracketed or not) resolves only to public addresses.
 * shortcut: DNS is resolved again by fetch (rebinding window), pin the resolved IP if this app is exposed publicly.
 */
export async function isPublicHost(hostname: string): Promise<boolean> {
  const host = hostname.startsWith('[') ? hostname.slice(1, -1) : hostname
  const addresses = isIP(host) ? [{ address: host }] : await lookup(host, { all: true })
  return addresses.length > 0 && !addresses.some((a) => isPrivateAddress(a.address))
}
