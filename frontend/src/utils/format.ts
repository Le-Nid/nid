export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'Ko', 'Mo', 'Go']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
}

export function formatSender(sender: string): string {
  // Extract display name if present: "John Doe <john@example.com>" → "John Doe"
  const match = sender.match(/^([^<]+)</)
  return match ? match[1].trim() : sender
}

export function formatEmail(sender: string): string {
  const match = sender.match(/<([^>]+)>/)
  return match ? match[1] : sender
}
