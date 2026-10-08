import { Link } from 'react-router-dom'
import { goToExplainerStep } from './landingNav'
import { SITE } from '../../lib/constants'

export function LandingHero() {
  return (
    <header className="landing-hero">
      <p className="landing-eyebrow">Educational research demo</p>
      <h1 className="landing-title" tabIndex={-1}>
        {SITE.title}
      </h1>
      <p className="landing-byline">
        A research project by <strong>Surabhi Fadnavis</strong>
      </p>
      <p className="landing-lede">
        An educational web app about one question that shapes breast-cancer care:{' '}
        <em>has cancer reached the lymph nodes?</em> Explore the clinical story in an interactive
        3D explainer, then try a research demo that scores microscope patches of lymph-node tissue
        and highlights the regions behind its estimate — all in your browser.
      </p>
      <div className="landing-actions">
        <a
          className="btn"
          href="#explainer"
          onClick={(e) => {
            e.preventDefault()
            goToExplainerStep()
          }}
        >
          Start the tour
        </a>
        <Link className="btn secondary" to="/demo">
          Try the detector
        </Link>
        <Link className="btn secondary" to="/quiz">
          You vs. the model
        </Link>
      </div>
      <nav className="landing-wwh" aria-label="Guide sections">
        <a href="#why">
          <b>Why</b>
          <span>Why lymph nodes matter and why computers might help.</span>
        </a>
        <a href="#what">
          <b>What</b>
          <span>Explainer, detector, results, and model card.</span>
        </a>
        <a href="#how">
          <b>How</b>
          <span>How to use the detector in your browser.</span>
        </a>
      </nav>
      <p className="landing-disclaimer" role="note">
        <strong>Educational only — not for clinical use.</strong> Built on a public research
        dataset. Not a diagnostic tool, not clinically validated, and never for decisions about
        anyone&apos;s health.
      </p>
    </header>
  )
}
