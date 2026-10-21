import * as React from "react"

const MOBILE_BREAKPOINT = 768

export function useIsMobile() {
  const query = `(max-width: ${MOBILE_BREAKPOINT - 1}px)`
  // Read synchronously (SPA, no SSR): no desktop-layout flash on the first mobile render
  const [isMobile, setIsMobile] = React.useState(() => window.matchMedia(query).matches)

  React.useEffect(() => {
    const mql = window.matchMedia(query)
    // mql.matches rather than innerWidth: same answer in browsers, and mockable in jsdom tests
    const onChange = () => setIsMobile(mql.matches)
    mql.addEventListener("change", onChange)
    setIsMobile(mql.matches)
    return () => mql.removeEventListener("change", onChange)
  }, [query])

  return isMobile
}
