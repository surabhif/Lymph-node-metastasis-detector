import { Link } from 'react-router-dom'
import { goToExplainerStep } from './landingNav'

export function LandingHow() {
  return (
    <section id="how" className="landing-section" aria-labelledby="how-heading">
      <div className="landing-partbanner">
        <span className="k">Part 3</span>
        <span className="t" id="how-heading">
          How
        </span>
        <span className="d">Using the detector in your browser</span>
      </div>

      <ol className="landing-steps">
        <li>
          <strong>Start with the explainer (recommended).</strong>
          <p>
            Step through the five 3D scenes for context on lymph nodes, deposit sizes, surgery, and
            patches.{' '}
            <button type="button" className="landing-jumplink inline" onClick={() => goToExplainerStep()}>
              Start the tour
            </button>
          </p>
        </li>
        <li>
          <strong>Open “Try the detector.”</strong>
          <p>
            The model downloads once (~11&nbsp;MB) with a progress indicator. Later visits load it
            from your browser cache.
          </p>
        </li>
        <li>
          <strong>Choose an image.</strong>
          <p>
            Pick a gallery sample (real PCam test patches) or upload your own. H&amp;E lymph-node
            patches around 96×96 pixels give the most meaningful results.
          </p>
        </li>
        <li>
          <strong>Read the result.</strong>
          <p>
            Note the tumor probability, then look at the CAM heatmap to see where the evidence came
            from. For gallery samples, compare with the known label.
          </p>
        </li>
        <li>
          <strong>Interpret carefully.</strong>
          <p>
            Visit{' '}
            <Link to="/results">Results</Link> and the{' '}
            <Link to="/model-card">Model card</Link> to understand accuracy and failure modes. A
            patch score is not a patient diagnosis.
          </p>
        </li>
      </ol>

      <p className="landing-callout note">
        <strong>Runs in your browser.</strong> Inference uses ONNX Runtime Web on your device.
        Uploaded images are not sent to a server for analysis.
      </p>

      <div className="landing-actions">
        <Link className="btn" to="/demo">
          Try the detector
        </Link>
        <button type="button" className="btn secondary" onClick={() => goToExplainerStep()}>
          Back to the tour
        </button>
      </div>
    </section>
  )
}
