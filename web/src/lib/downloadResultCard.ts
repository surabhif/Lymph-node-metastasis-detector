/** Build a single PNG card: patch + heatmap + score text + disclaimer. */

export type ResultCardInput = {
  /** Current demo canvas (patch with heatmap already drawn). */
  overlayCanvas: HTMLCanvasElement
  /** Optional raw patch without overlay (falls back to overlayCanvas). */
  patchUrl?: string | null
  score: number
  label: string
  modelVersion: string
  patchSize?: number
}

function formatPct(p: number) {
  return `${(p * 100).toFixed(1)}%`
}

async function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Failed to load patch for download'))
    img.src = src
  })
}

/**
 * Compose and download a PNG. Returns the blob for callers that need it (tests).
 */
export async function downloadResultCard(input: ResultCardInput): Promise<Blob> {
  const tile = input.patchSize ?? 160
  const pad = 20
  const textBlock = 120
  const width = pad * 3 + tile * 2
  const height = pad * 2 + tile + textBlock

  const out = document.createElement('canvas')
  out.width = width
  out.height = height
  const ctx = out.getContext('2d')
  if (!ctx) throw new Error('Canvas unavailable')

  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, width, height)

  // Patch (no overlay if we have a source URL)
  if (input.patchUrl) {
    const img = await loadImage(input.patchUrl)
    ctx.drawImage(img, pad, pad, tile, tile)
  } else {
    ctx.drawImage(input.overlayCanvas, pad, pad, tile, tile)
  }

  // Heatmap view (current overlay canvas)
  ctx.drawImage(input.overlayCanvas, pad * 2 + tile, pad, tile, tile)

  ctx.fillStyle = '#1a1a1a'
  ctx.font = '600 14px system-ui, sans-serif'
  ctx.fillText('Patch', pad, pad + tile + 18)
  ctx.fillText('Heatmap', pad * 2 + tile, pad + tile + 18)

  const y0 = pad + tile + 40
  ctx.font = '600 16px system-ui, sans-serif'
  ctx.fillText(`Score: ${formatPct(input.score)}  ·  ${input.label}`, pad, y0)
  ctx.font = '13px system-ui, sans-serif'
  ctx.fillStyle = '#444'
  ctx.fillText(`Model: ${input.modelVersion}`, pad, y0 + 22)
  ctx.fillStyle = '#9B5654'
  ctx.font = '600 12px system-ui, sans-serif'
  ctx.fillText('Research demo, not for clinical use.', pad, y0 + 46)

  const blob = await new Promise<Blob>((resolve, reject) => {
    out.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG encode failed'))), 'image/png')
  })

  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `pcam-demo-${input.modelVersion}-${Date.now()}.png`
  a.click()
  URL.revokeObjectURL(url)
  return blob
}
