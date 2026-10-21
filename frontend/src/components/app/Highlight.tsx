const ENTITIES: Record<string, string> = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'" }
const unescape = (s: string) => s.replace(/&(?:amp|lt|gt|quot|#39);/g, (e) => ENTITIES[e])

/** Splits a search extract whose only markup is <mark>…</mark> (the rest HTML-escaped by the server) into text runs. */
export function highlightParts(html: string): { text: string; mark: boolean }[] {
  const parts: { text: string; mark: boolean }[] = []
  let mark = false
  for (const piece of html.split(/(<\/?mark>)/)) {
    if (piece === '<mark>') mark = true
    else if (piece === '</mark>') mark = false
    else if (piece) parts.push({ text: unescape(piece), mark })
  }
  return parts
}

/** Highlighted extract (§7.5) as React text and <mark> nodes: no dangerouslySetInnerHTML, any other tag stays text. */
export function Highlight({ html }: Readonly<{ html: string }>) {
  return (
    <>
      {highlightParts(html).map((p, i) => (p.mark
        ? <mark key={i} className="rounded-sm bg-primary-soft px-0.5 font-medium text-primary-text">{p.text}</mark>
        : p.text))}
    </>
  )
}
