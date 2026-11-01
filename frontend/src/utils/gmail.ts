import type { GmailLabel } from '@/components/app/LabelBadge'

/** Gmail's base64url → bytes (message bodies and attachments). */
export function base64UrlToBytes(str: string): Uint8Array {
  return Uint8Array.from(atob(str.replaceAll('-', '+').replaceAll('_', '/')), (c) => c.codePointAt(0)!)
}

function decodeBase64Url(str: string): string {
  try {
    return new TextDecoder().decode(base64UrlToBytes(str))
  } catch {
    return ''
  }
}

type Part = { mimeType?: string; filename?: string; body?: { data?: string; size?: number; attachmentId?: string }; parts?: Part[] }

export function extractBody(payload: Part | undefined): { html: string; text: string } {
  let html = ''
  let text = ''
  const walk = (part?: Part) => {
    if (!part) return
    const data = part.body?.data ?? ''
    if (part.mimeType === 'text/html' && data) html = decodeBase64Url(data)
    else if (part.mimeType === 'text/plain' && data) text = decodeBase64Url(data)
    else part.parts?.forEach(walk)
  }
  walk(payload)
  return { html, text }
}

export type Attachment = { filename: string; mimeType: string; size: number; attachmentId: string }

export function extractAttachments(payload: Part | undefined): Attachment[] {
  const result: Attachment[] = []
  const walk = (part?: Part) => {
    if (!part) return
    if (part.filename && part.body?.attachmentId) {
      result.push({
        filename: part.filename,
        mimeType: part.mimeType ?? 'application/octet-stream',
        size: part.body.size ?? 0,
        attachmentId: part.body.attachmentId,
      })
    }
    part.parts?.forEach(walk)
  }
  walk(payload)
  return result
}

// Remote URL in an attribute (src, srcset, background, poster) or in CSS url(): what I4 blocks
const REMOTE_ATTR = /\b(?:src|srcset|background|poster)\s*=\s*(?:["']\s*)?(?:https?:)?\/\//i
const REMOTE_CSS = /url\(\s*(?:["']\s*)?(?:https?:)?\/\//i

export const hasRemoteContent = (html: string) => REMOTE_ATTR.test(html) || REMOTE_CSS.test(html)

/**
 * srcdoc of a mail body (I4, §6.7). A CSP blocks every remote fetch (images, CSS, fonts) without rewriting
 * the HTML, until `allowRemote`; scripts never run (sandbox without allow-scripts, default-src 'none').
 * <base target="_blank">: links open in a new tab, outside the sandbox.
 */
export function mailSrcDoc(html: string, allowRemote: boolean): string {
  const csp = allowRemote
    ? "default-src 'none'; img-src * data: blob:; style-src * 'unsafe-inline'; font-src * data:; media-src *"
    : "default-src 'none'; img-src data: blob:; style-src 'unsafe-inline'; font-src data:"
  return `<meta http-equiv="Content-Security-Policy" content="${csp}"><base target="_blank">${html}`
}

/** A synced label as `GET /api/labels/:id` returns it (B4). */
export type ApiLabel = {
  id: string
  name: string
  type: 'system' | 'user' | 'category' | 'imported'
  color_bg?: string | null
  deleted_at?: string | null
  archived_count?: number
}

/** Label of a mail as `LabelBadge` takes it. */

export function toBadge(labels: ApiLabel[], id: string): GmailLabel {
  const label = labels.find((l) => l.id === id)
  // Unknown id (list not loaded yet): treat as system, so INBOX-like ids never show as user labels
  if (!label) return { name: id, type: 'system' }
  // Imported (mbox) labels are user labels Gmail no longer knows: same dot + text badge
  const isUser = label.type === 'user' || label.type === 'imported'
  return { name: label.name, type: isUser ? 'user' : 'system', color: label.color_bg }
}
