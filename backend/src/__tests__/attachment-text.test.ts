import { DummyDriver, Kysely, PostgresAdapter, PostgresIntrospector, PostgresQueryCompiler, sql, type CompiledQuery } from 'kysely'
import { zipSync, strToU8 } from 'fflate'

// Real SQL compiled, each query answered by `answer(sql)`
const seen: CompiledQuery[] = []
let answer: (sql: string) => unknown[] = () => []
const fakeDb = new Kysely<any>({
  dialect: {
    createAdapter: () => new PostgresAdapter(),
    createDriver: () => Object.assign(new DummyDriver(), {
      acquireConnection: async () => ({
        executeQuery: async (q: CompiledQuery) => { seen.push(q); return { rows: answer(q.sql), numAffectedRows: 1n } },
        streamQuery: async function* () {},
      }),
    }),
    createIntrospector: (db) => new PostgresIntrospector(db),
    createQueryCompiler: () => new PostgresQueryCompiler(),
  },
})
vi.mock('../db', () => ({ getDb: () => fakeDb }))
const files = new Map<string, Buffer>()
vi.mock('../storage/storage.service', () => ({
  getLocalStorage: () => ({ readFile: async (p: string) => files.get(p) ?? Promise.reject(new Error('ENOENT')) }),
}))

import { attachmentMatches, backfillAttachmentText, countPendingAttachmentText, docxXmlText, extractAttachmentText, textKind } from '../archive/attachment-text'

/** Minimal one-page PDF showing `text` (Helvetica). */
function makePdf(text: string): Buffer {
  const stream = `BT /F1 12 Tf 10 50 Td (${text}) Tj ET`
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 100] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ]
  let out = '%PDF-1.4\n'
  const offsets = objs.map((o, i) => { const at = out.length; out += `${i + 1} 0 obj\n${o}\nendobj\n`; return at })
  const xref = out.length
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return Buffer.from(out, 'latin1')
}
const makeDocx = (xml: string) => Buffer.from(zipSync({ 'word/document.xml': strToU8(xml), '[Content_Types].xml': strToU8('<Types/>') }))

beforeEach(() => { seen.length = 0; files.clear(); answer = () => [] })

describe('extractAttachmentText', () => {
  it('reads a PDF, by MIME type or by extension, and leaves the buffer intact', async () => {
    const pdf = makePdf('Facture electricite 42')
    expect(await extractAttachmentText('scan.bin', 'application/pdf', pdf)).toBe('Facture electricite 42')
    expect(await extractAttachmentText('Relevé.PDF', 'application/octet-stream', pdf)).toBe('Facture electricite 42')
    expect(pdf.subarray(0, 8).toString()).toBe('%PDF-1.4')
  })

  it('reads a DOCX: paragraphs become spaces, entities are decoded', async () => {
    const docx = makeDocx('<w:document><w:body><w:p><w:r><w:t>Contrat &amp; avenant</w:t></w:r></w:p><w:p><w:r><w:t>sign&#233;</w:t></w:r></w:p></w:body></w:document>')
    expect(await extractAttachmentText('contrat.docx', null, docx)).toBe('Contrat & avenant signé')
  })

  it('other types: null (not extractable); unreadable or oversized: empty, never a throw', async () => {
    expect(await extractAttachmentText('photo.jpg', 'image/jpeg', Buffer.from('x'))).toBeNull()
    expect(await extractAttachmentText('broken.pdf', 'application/pdf', Buffer.from('not a pdf'))).toBe('')
    expect(await extractAttachmentText('broken.docx', null, Buffer.from('not a zip'))).toBe('')
    expect(await extractAttachmentText('huge.pdf', null, Buffer.alloc(20 * 1024 * 1024 + 1))).toBe('')
  })

  it('textKind and docxXmlText edge cases', () => {
    expect(textKind('a.DOCX', null)).toBe('docx')
    expect(textKind('a.doc', 'application/msword')).toBeNull()
    expect(docxXmlText('<w:t>a</w:t><w:tab/><w:t>b &#x41; &bogus; &#0;</w:t>')).toBe('a b A &bogus; ')
  })
})

describe('backfill', () => {
  it('counts and fills pending PDF/DOCX of readable archives; an unreadable file gets an empty text', async () => {
    answer = (q) => (q.includes('count(*)') ? [{ count: '2' }] : [])
    expect(await countPendingAttachmentText()).toBe(2)
    expect(seen[0].sql).toContain('"archived_attachments"."text_content" is null and "archived_mails"."is_encrypted" = $1 and (mime_type IN ($2, $3) OR lower(filename) LIKE \'%.pdf\' OR lower(filename) LIKE \'%.docx\')')

    files.set('/nas/a.pdf', makePdf('Avis impot'))
    let batch = 0
    answer = (q) => (q.startsWith('select') && batch++ === 0
      ? [{ id: 'att-1', filename: 'a.pdf', mime_type: 'application/pdf', file_path: '/nas/a.pdf' }, { id: 'att-2', filename: 'b.pdf', mime_type: null, file_path: '/nas/gone.pdf' }]
      : [])
    const progress = vi.fn()
    expect(await backfillAttachmentText(progress)).toBe(2)
    const updates = seen.filter((q) => q.sql.startsWith('update'))
    expect(updates.map((u) => u.parameters)).toEqual([['Avis impot', 'att-1'], ['', 'att-2']])
    expect(progress).toHaveBeenCalledWith(2)
  })
})

describe('attachmentMatches', () => {
  it('first matching attachment per mail of the page, its excerpt as safe HTML', async () => {
    answer = () => [{ archived_mail_id: 'm1', filename: 'avis.pdf', highlight: 'votre \u0001impot\u0002 <b>' }]
    const out = await attachmentMatches(['m1', 'm2'], sql`websearch_to_tsquery('nid_french', ${'impot'})`)
    expect(out.get('m1')).toEqual({ filename: 'avis.pdf', highlight: 'votre <mark>impot</mark> &lt;b&gt;' })
    expect(seen[0].sql).toMatch(/^select distinct on \("archived_mail_id"\) "archived_mail_id", "filename", ts_headline\('nid_french', text_content/)
    expect(seen[0].sql).toContain('where "archived_mail_id" in ($3, $4) and "text_content" <> $5 and to_tsvector(\'nid_french\', COALESCE(archived_attachments.text_content, \'\')) @@ websearch_to_tsquery')
    expect(await attachmentMatches([], sql``)).toEqual(new Map())
  })
})
