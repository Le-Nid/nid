// Body of a raw EML (RFC 822 / MIME) for the archive reader: its first text/html and text/plain parts, decoded.

const splitHead = (raw: string): [string, string] => {
  const m = /\r?\n\r?\n/.exec(raw)
  return m ? [raw.slice(0, m.index), raw.slice(m.index + m[0].length)] : [raw, '']
}

function decode(body: string, headers: string): string {
  let binary: string
  if (/content-transfer-encoding:\s*base64/i.test(headers)) {
    try {
      binary = atob(body.replace(/\s/g, ''))
    } catch {
      return body
    }
  } else if (/content-transfer-encoding:\s*quoted-printable/i.test(headers)) {
    binary = body.replace(/=\r?\n/g, '').replace(/=([0-9A-F]{2})/gi, (_, hex: string) => String.fromCharCode(Number.parseInt(hex, 16)))
  } else {
    return body
  }
  const charset = /charset="?([\w-]+)/i.exec(headers)?.[1] ?? 'utf-8'
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0))
  try {
    return new TextDecoder(charset).decode(bytes)
  } catch {
    return new TextDecoder().decode(bytes) // unknown charset label
  }
}

export function emlBody(raw: string, depth = 0): { html: string; text: string } {
  const [headers, body] = splitHead(raw)
  const type = /content-type:\s*([\w/.+-]+)/i.exec(headers)?.[1].toLowerCase() ?? 'text/plain'
  const boundary = /boundary="?([^";\r\n]+)"?/i.exec(headers)?.[1]
  if (type.startsWith('multipart/') && boundary) {
    let html = ''
    let text = ''
    if (depth >= 5) return { html, text } // malformed nesting
    for (const part of body.split(`--${boundary}`).slice(1)) {
      if (part.startsWith('--')) break // closing delimiter
      const sub = part.replace(/^\r?\n/, '')
      if (/content-disposition:\s*attachment/i.test(splitHead(sub)[0])) continue
      const found = emlBody(sub, depth + 1)
      html ||= found.html
      text ||= found.text
    }
    return { html, text }
  }
  if (type === 'text/html') return { html: decode(body.trim(), headers), text: '' }
  if (type === 'text/plain') return { html: '', text: decode(body.trim(), headers) }
  return { html: '', text: '' }
}
