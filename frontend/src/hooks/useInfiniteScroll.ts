import { useEffect, useRef, useCallback } from 'react'

interface Options {
  onLoadMore: () => void
  hasMore:    boolean
  loading:    boolean
}

/**
 * Retourne une ref à attacher à un sentinel div en bas de liste.
 * Quand le sentinel est visible, appelle onLoadMore.
 */
export function useInfiniteScroll({ onLoadMore, hasMore, loading }: Options) {
  const sentinelRef = useRef<HTMLDivElement | null>(null)

  const handleIntersect = useCallback(
    (entries: IntersectionObserverEntry[]) => {
      const [entry] = entries
      if (entry.isIntersecting && hasMore && !loading) {
        onLoadMore()
      }
    },
    [onLoadMore, hasMore, loading]
  )

  useEffect(() => {
    const el = sentinelRef.current
    if (!el) return

    const observer = new IntersectionObserver(handleIntersect, {
      root:       null,
      rootMargin: '200px', // pré-charger avant d'atteindre le bas
      threshold:  0,
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [handleIntersect])

  return sentinelRef
}
