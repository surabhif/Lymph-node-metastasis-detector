import { Link } from 'react-router-dom'
import { goToExplainerStep } from './landingNav'
import { SITE } from '../../lib/constants'

export function LandingHero() {
  return (
    <header className="landing-hero">
      <p className="landing-eyebrow">High-school research demo</p>
      <h1 className="landing-title" tabIndex={-1}>
        {SITE.title}
      </h1>
      <p className="landing-byline">
        A research project by <strong>Surabhi Fadnavis</strong>
      </p>
      <p className="landing-lede">
        One question that matters in breast-cancer care: has cancer reached the lymph nodes? This
        site first shows that story in a short 3D tour. Then you can try a research tool that scores
        small microscope images of lymph-node tissue in your browser and paints a heatmap over the
        areas that most influenced the score.
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
          <span>Why lymph nodes matter, and how computers can help people review them.</span>
        </a>
        <a href="#what">
          <b>What</b>
          <span>The tour, the detector, results, and the model card.</span>
        </a>
        <a href="#how">
          <b>How</b>
          <span>How to try the detector in your browser.</span>
        </a>
      </nav>
      <p className="landing-disclaimer" role="note">
        <strong>For learning only, not medical care.</strong> This project uses a public research
        dataset. It is not a diagnostic tool and must never guide anyone&apos;s health decisions.
      </p>
    </header>
  )
}
