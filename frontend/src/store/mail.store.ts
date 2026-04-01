import { create } from 'zustand'

interface MailRow {
  id: string
  threadId: string
  subject: string
  from: string
  date: string
  sizeEstimate: number
  snippet: string
  labelIds: string[]
  hasAttachments: boolean
}

interface CacheEntry {
  mails: MailRow[]
  total: number
  pageToken: string | null
  hasMore: boolean
  timestamp: number
}

interface MailCacheState {
  cache: Record<string, CacheEntry>
  getEntry: (key: string) => CacheEntry | null
  setEntry: (key: string, entry: Omit<CacheEntry, 'timestamp'>) => void
  clearCache: () => void
}

const CACHE_TTL = 5 * 60 * 1000 // 5 minutes

export const useMailCache = create<MailCacheState>((set, get) => ({
  cache: {},

  getEntry: (key: string) => {
    const entry = get().cache[key]
    if (!entry) return null
    if (Date.now() - entry.timestamp > CACHE_TTL) {
      set((state) => {
        const { [key]: _, ...rest } = state.cache
        return { cache: rest }
      })
      return null
    }
    return entry
  },

  setEntry: (key: string, entry: Omit<CacheEntry, 'timestamp'>) => {
    set((state) => ({
      cache: { ...state.cache, [key]: { ...entry, timestamp: Date.now() } },
    }))
  },

  clearCache: () => set({ cache: {} }),
}))

export function cacheKey(accountId: string, query: string, quickFilter: string) {
  return `${accountId}:${query}:${quickFilter}`
}
