import { Link } from 'react-router-dom'
import { goToExplainerStep } from './landingNav'

export function LandingWhat() {
  return (
    <section id="what" className="landing-section" aria-labelledby="what-heading">
      <div className="landing-partbanner">
        <span className="k">Part 2</span>
        <span className="t" id="what-heading">
          What
        </span>
        <span className="d">What you&apos;ll find in the app</span>
      </div>

      <p className="landing-intro">
        A static website: no account, no installation, and no server running the model. Main areas:
      </p>

      <div className="landing-cards tour">
        <article className="landing-card">
          <span className="landing-card-kicker">On this page</span>
          <h3>3D explainer</h3>
          <p>Five interactive scenes covering lymphatics, spread, deposit sizes, surgery, and patches.</p>
          <button type="button" className="landing-jumplink" onClick={() => goToExplainerStep()}>
            Open the tour →
          </button>
        </article>
        <article className="landing-card">
          <span className="landing-card-kicker">Try it</span>
          <h3>Detector</h3>
          <p>Score a sample PCam patch or upload an image; see a tumor probability and CAM heatmap.</p>
          <Link className="landing-jumplink" to="/demo">
            Go to Demo →
          </Link>
        </article>
        <article className="landing-card">
          <span className="landing-card-kicker">Evaluation</span>
          <h3>Results</h3>
          <p>Metrics for the model on the site, plus confident mistakes and stain-shift checks.</p>
          <Link className="landing-jumplink" to="/results">
            View Results →
          </Link>
        </article>
        <article className="landing-card">
          <span className="landing-card-kicker">Transparency</span>
          <h3>Model card</h3>
          <p>Intended use, training data, and known limitations — educational, not clinical.</p>
          <Link className="landing-jumplink" to="/model-card">
            Read the model card →
          </Link>
        </article>
        <article className="landing-card">
          <span className="landing-card-kicker">Project</span>
          <h3>About</h3>
          <p>Background on the project and its educational purpose.</p>
          <Link className="landing-jumplink" to="/about">
            About the project →
          </Link>
        </article>
      </div>

      <div className="landing-block">
        <h2>Explainer chapters</h2>
        <div className="landing-cards steps">
          {(
            [
              ['lymphatic', '1', 'Lymphatics', 'Where lymph drains near the breast.'],
              ['spread', '2', 'Spread', 'How cancer cells travel through lymphatic vessels.'],
              ['inside', '3', 'Inside a node', 'ITC, micro-, and macrometastasis at scale.'],
              ['surgery', '4', 'Surgery', 'Sentinel node biopsy vs axillary dissection.'],
              ['patches', '5', 'Patches', 'How whole-slide images become 96×96 patches.'],
            ] as const
          ).map(([id, num, title, blurb]) => (
            <button
              key={id}
              type="button"
              className="landing-card landing-card-button"
              onClick={() => goToExplainerStep(id)}
            >
              <span className="stepno">{num}</span>
              <h3>{title}</h3>
              <p>{blurb}</p>
            </button>
          ))}
        </div>
      </div>
    </section>
  )
}
