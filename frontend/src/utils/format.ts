export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'Ko', 'Mo', 'Go']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${Number.parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
}

export function formatSender(sender: string): string {
  if (!sender) return '—'
  // Extract display name if present: "John Doe <john@example.com>" → "John Doe"
  const match = /^([^<]+)</.exec(sender)
  return match ? match[1].trim() : sender
}

export function formatEmail(sender: string): string {
  if (!sender) return '—'
  const match = /<([^<>]+)>/.exec(sender)
  return match ? match[1] : sender
}

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [['year', 31_536_000], ['month', 2_592_000], ['day', 86_400], ['hour', 3_600], ['minute', 60]]

/** « il y a 3 heures », « hier »… */
export function formatRelative(date: string, locale: string): string {
  const seconds = (new Date(date).getTime() - Date.now()) / 1000
  const [unit, size] = UNITS.find(([, s]) => Math.abs(seconds) >= s) ?? ['second', 1]
  return new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }).format(Math.round(seconds / size), unit)
}

/** i18n key of a job type: `bulk_operation` → `jobs.bulkOperation`. */
export const jobTypeKey = (type: string) => `jobs.${type.replace(/_(\w)/g, (_, c: string) => c.toUpperCase())}`
