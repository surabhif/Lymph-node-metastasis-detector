import { useId, useState, type ReactNode } from 'react'

/** Short plain-language definitions for first-use tooltips. */
export const GLOSSARY: Record<string, string> = {
  AUC: 'How well the model ranks tumor patches above normal ones. 1.0 is perfect ranking; 0.5 is chance.',
  sensitivity:
    'Among true tumor patches, the share the model correctly calls tumor (also called recall).',
  specificity: 'Among true normal patches, the share the model correctly calls normal.',
  'H&E':
    'Hematoxylin and eosin stain — the common pink-and-purple dye used on tissue slides in this demo.',
  'Grad-CAM':
    'A heatmap that highlights image regions that most influenced the model’s tumor score. This demo uses a CAM built from final features and weights (no gradients in the browser).',
  CAM: 'Class-activation map — a heatmap of where the model focused for its score.',
  calibration:
    'Adjusting scores so a predicted chance (for example 70%) matches how often that outcome really happens.',
  patch: 'A small image tile cut from a larger slide. Here each patch is 96×96 pixels.',
}

type Props = {
  term: keyof typeof GLOSSARY | string
  children?: ReactNode
  /** Override definition text if needed. */
  definition?: string
}

/**
 * Accessible hover/focus tooltip for a glossary term.
 * Uses a native button so keyboard users can focus it.
 */
export default function GlossaryTip({ term, children, definition }: Props) {
  const id = useId()
  const tipId = `${id}-tip`
  const [open, setOpen] = useState(false)
  const text = definition ?? GLOSSARY[term] ?? ''
  if (!text) return <>{children ?? term}</>

  return (
    <span className={`glossary-wrap${open ? ' open' : ''}`}>
      <button
        type="button"
        className="glossary-term"
        aria-describedby={open ? tipId : undefined}
        aria-expanded={open}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') setOpen(false)
        }}
      >
        {children ?? term}
      </button>
      <span id={tipId} role="tooltip" className="glossary-tip" hidden={!open}>
        {text}
      </span>
    </span>
  )
}
