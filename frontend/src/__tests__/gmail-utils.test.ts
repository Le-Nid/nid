import { extractAttachments, extractBody, hasRemoteContent, mailSrcDoc, toBadge } from '../utils/gmail'

const b64 = (s: string) => btoa(String.fromCodePoint(...new TextEncoder().encode(s))).replace(/\+/g, '-').replace(/\//g, '_')

describe('gmail payload helpers', () => {
  it('finds the html and text bodies in nested parts, decoding UTF-8', () => {
    const payload = {
      mimeType: 'multipart/mixed',
      parts: [{ mimeType: 'multipart/alternative', parts: [
        { mimeType: 'text/plain', body: { data: b64('Été') } },
        { mimeType: 'text/html', body: { data: b64('<b>Été</b>') } },
      ] }],
    }
    expect(extractBody(payload)).toEqual({ html: '<b>Été</b>', text: 'Été' })
    expect(extractBody(undefined)).toEqual({ html: '', text: '' })
    expect(extractBody({ mimeType: 'text/plain', body: { data: '%%%' } })).toEqual({ html: '', text: '' })
  })

  it('lists attachments with defaults', () => {
    const payload = { parts: [{ filename: 'a.bin', body: { attachmentId: 'x' } }, { filename: '', body: {} }] }
    expect(extractAttachments(payload)).toEqual([{ filename: 'a.bin', mimeType: 'application/octet-stream', size: 0, attachmentId: 'x' }])
    expect(extractAttachments(undefined)).toEqual([])
  })

  it.each([
    ['<img src="https://t.example/p.gif">', true],
    ["<img src='//cdn.example/a.png'>", true],
    ['<img srcset="http://a.example/1x.png 1x">', true],
    ['<td background="https://a.example/bg.jpg">', true],
    ['<div style="background:url( \'https://a.example/x\')">', true],
    ['<img src="cid:logo"><a href="https://shop.example">lien</a>', false],
    ['<img src="data:image/png;base64,AA">', false],
  ])('detects remote content in %s', (html, remote) => {
    expect(hasRemoteContent(html)).toBe(remote)
  })

  it('wraps the body with a blocking CSP until remote content is allowed, and opens links in a new tab', () => {
    expect(mailSrcDoc('<p>x</p>', false)).toBe(
      `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: blob:; style-src 'unsafe-inline'; font-src data:"><base target="_blank"><p>x</p>`,
    )
    expect(mailSrcDoc('<p>x</p>', true)).toContain("img-src * data: blob:; style-src * 'unsafe-inline'")
  })

  it('maps label ids to LabelBadge labels', () => {
    const labels = [
      { id: 'Label_1', name: 'Factures', type: 'user', color: { backgroundColor: '#16a765' } },
      { id: 'CATEGORY_SOCIAL', name: 'CATEGORY_SOCIAL', type: 'system' },
      { id: 'Label_2', name: 'Sans couleur', type: 'user', color: null },
    ]
    expect(toBadge(labels, 'Label_1')).toEqual({ name: 'Factures', type: 'user', color: '#16a765' })
    expect(toBadge(labels, 'CATEGORY_SOCIAL')).toEqual({ name: 'CATEGORY_SOCIAL', type: 'system', color: undefined })
    expect(toBadge(labels, 'Label_2')).toEqual({ name: 'Sans couleur', type: 'user', color: undefined })
    expect(toBadge([], 'INBOX')).toEqual({ name: 'INBOX', type: 'system' })
  })
})
