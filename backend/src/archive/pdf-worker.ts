// Text of one PDF, in a worker thread (see pdfText in attachment-text.ts). Plain erasable TypeScript, imports only unpdf:
// dev and tests run this file with Node's type stripping, the build ships it as dist/pdf-worker.js.
import { parentPort, workerData } from 'node:worker_threads'
import { getDocumentProxy } from 'unpdf'

const { content, maxPages, maxChars, deadline } = workerData as { content: Uint8Array; maxPages: number; maxChars: number; deadline: number }

const pdf = await getDocumentProxy(content, { verbosity: 0 })
let text = ''
// Page by page: a bound reached between pages still returns the text read so far
for (let i = 1; i <= Math.min(pdf.numPages, maxPages) && text.length < maxChars && Date.now() < deadline; i++) {
  const page = await pdf.getPage(i) // NOSONAR: pages one after the other, to stop at a bound
  const { items } = await page.getTextContent() // NOSONAR
  text += ' ' + items.map((it) => ('str' in it ? it.str : '')).join(' ')
}
parentPort?.postMessage(text)
