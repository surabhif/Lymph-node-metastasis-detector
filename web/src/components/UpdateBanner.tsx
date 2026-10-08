import { useEffect, useState } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'

export default function UpdateBanner() {
  const [offlineReady, setOfflineReady] = useState(false)
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW() {
      /* registered */
    },
    onOfflineReady() {
      setOfflineReady(true)
    },
  })

  useEffect(() => {
    if (!offlineReady) return
    const t = window.setTimeout(() => setOfflineReady(false), 6000)
    return () => window.clearTimeout(t)
  }, [offlineReady])

  if (!needRefresh && !offlineReady) return null

  return (
    <div className="sw-banner" role="status" aria-live="polite">
      {needRefresh ? (
        <>
          <span>New version available.</span>
          <button
            type="button"
            className="btn"
            onClick={() => void updateServiceWorker(true)}
          >
            Reload
          </button>
          <button
            type="button"
            className="btn secondary"
            onClick={() => setNeedRefresh(false)}
          >
            Later
          </button>
        </>
      ) : (
        <span>Available offline.</span>
      )}
    </div>
  )
}
