import type { ExplainerStep } from './steps'

/** Static illustrated fallback when WebGL is unavailable or reduced motion is preferred. */
export default function ExplainerFallback({ step }: { step: ExplainerStep }) {
  return (
    <div className="explainer-fallback" role="img" aria-label={step.alt}>
      <svg viewBox="0 0 480 320" className="explainer-fallback-svg" aria-hidden="true">
        <defs>
          <linearGradient id="fb-bg" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#d7ebe3" />
            <stop offset="100%" stopColor="#efe6d8" />
          </linearGradient>
        </defs>
        <rect width="480" height="320" rx="16" fill="url(#fb-bg)" />
        {step.id === 'lymphatic' && (
          <>
            <ellipse cx="190" cy="170" rx="70" ry="110" fill="#c4b5a0" />
            <circle cx="230" cy="150" r="36" fill="#b9a48c" />
            <path d="M250 150 C300 140 340 120 370 90" stroke="#3d8f7a" strokeWidth="4" fill="none" />
            <circle cx="370" cy="90" r="14" fill="#0b6b54" />
            <circle cx="390" cy="120" r="11" fill="#0b6b54" />
            <circle cx="355" cy="55" r="10" fill="#0e8a6c" />
            <text x="300" y="40" fill="#1a2421" fontSize="14" fontFamily="IBM Plex Sans, sans-serif">
              Axillary nodes
            </text>
          </>
        )}
        {step.id === 'spread' && (
          <>
            <circle cx="110" cy="180" r="40" fill="#b9a48c" />
            <circle cx="120" cy="175" r="14" fill="#9f2d22" />
            <path d="M134 175 C200 150 260 140 320 130" stroke="#3d8f7a" strokeWidth="4" fill="none" />
            <circle cx="200" cy="155" r="6" fill="#c45c4a" />
            <circle cx="250" cy="142" r="6" fill="#c45c4a" />
            <circle cx="320" cy="130" r="18" fill="#0b6b54" />
            <circle cx="380" cy="90" r="14" fill="#0e8a6c" />
            <text x="290" y="110" fill="#1a2421" fontSize="13" fontFamily="IBM Plex Sans, sans-serif">
              Sentinel first
            </text>
          </>
        )}
        {step.id === 'inside' && (
          <>
            <circle cx="240" cy="160" r="95" fill="#0b6b54" opacity="0.25" />
            <circle cx="240" cy="160" r="88" fill="#d8e8e1" />
            <circle cx="200" cy="140" r="8" fill="#e8a598" />
            <circle cx="270" cy="175" r="18" fill="#d47868" />
            <circle cx="230" cy="120" r="32" fill="#9f2d22" />
            <text x="40" y="50" fill="#1a2421" fontSize="13" fontFamily="IBM Plex Sans, sans-serif">
              ITC · micro · macro deposits
            </text>
          </>
        )}
        {step.id === 'surgery' && (
          <>
            <rect x="40" y="60" width="170" height="200" rx="12" fill="#fffcf6" stroke="#c6bdae" />
            <rect x="270" y="60" width="170" height="200" rx="12" fill="#fffcf6" stroke="#c6bdae" />
            <text x="70" y="90" fill="#084c3c" fontSize="14" fontFamily="IBM Plex Sans, sans-serif">
              Sentinel biopsy
            </text>
            <text x="290" y="90" fill="#084c3c" fontSize="14" fontFamily="IBM Plex Sans, sans-serif">
              Axillary dissection
            </text>
            <circle cx="120" cy="160" r="12" fill="#0b6b54" />
            <circle cx="320" cy="150" r="10" fill="#0b6b54" />
            <circle cx="350" cy="180" r="10" fill="#0b6b54" />
            <circle cx="310" cy="200" r="10" fill="#0b6b54" />
            <circle cx="360" cy="130" r="10" fill="#0b6b54" />
            <text x="185" y="300" fill="#1a2421" fontSize="16" fontFamily="Source Serif 4, serif">
              T · <tspan fill="#0b6b54" fontWeight="700">N</tspan> · M
            </text>
          </>
        )}
        {step.id === 'patches' && (
          <>
            {Array.from({ length: 24 }).map((_, i) => {
              const c = i % 6
              const r = Math.floor(i / 6)
              const hot = c === 2 && r === 1
              return (
                <rect
                  key={i}
                  x={90 + c * 50}
                  y={70 + r * 50}
                  width="42"
                  height="42"
                  rx="4"
                  fill={hot ? '#0b6b54' : '#b8c9c0'}
                  stroke="#fffcf6"
                />
              )
            })}
            <text x="120" y="290" fill="#1a2421" fontSize="14" fontFamily="IBM Plex Sans, sans-serif">
              Slide tiled into 96×96 patches
            </text>
          </>
        )}
      </svg>
      <p className="explainer-fallback-caption">{step.alt}</p>
    </div>
  )
}
