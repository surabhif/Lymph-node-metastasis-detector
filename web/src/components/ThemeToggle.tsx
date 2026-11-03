import { useEffect, useState } from 'react'
import {
  applyTheme,
  getStoredTheme,
  setStoredTheme,
  type ThemePreference,
} from '../lib/theme'

const OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'System' },
]

export default function ThemeToggle() {
  const [pref, setPref] = useState<ThemePreference>(() => getStoredTheme() ?? 'system')

  useEffect(() => {
    applyTheme(pref)
    if (pref !== 'system') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => applyTheme('system')
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [pref])

  const select = (mode: ThemePreference) => {
    setStoredTheme(mode)
    setPref(mode)
  }

  return (
    <div className="theme-toggle" role="group" aria-label="Color theme">
      {OPTIONS.map(({ value, label }) => (
        <button
          key={value}
          type="button"
          className={pref === value ? 'is-active' : undefined}
          aria-pressed={pref === value}
          onClick={() => select(value)}
        >
          {label}
        </button>
      ))}
    </div>
  )
}
