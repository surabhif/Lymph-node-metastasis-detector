import type { ReactNode } from 'react'
import { SITE } from '../lib/constants'

type Props = {
  /** Visible link text. Defaults to “LinkedIn”. */
  children?: ReactNode
  className?: string
}

/** External LinkedIn profile link with a stable accessible name. */
export default function LinkedInLink({ children = 'LinkedIn', className }: Props) {
  return (
    <a
      href={SITE.linkedinUrl}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Surabhi Fadnavis on LinkedIn"
      className={className ? `linkedin-link ${className}` : 'linkedin-link'}
    >
      {children}
    </a>
  )
}
