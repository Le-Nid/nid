/** Saves a URL (same origin: the session cookie goes along) or a fetched blob as a file. */
export function saveFile(href: string, filename: string) {
  const a = document.createElement('a')
  a.href = href
  a.download = filename
  a.click()
}

export function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  saveFile(url, filename)
  URL.revokeObjectURL(url)
}
