import { goToExplainerStep } from './landingNav'

export function LandingWhy() {
  return (
    <section id="why" className="landing-section" aria-labelledby="why-heading">
      <div className="landing-partbanner">
        <span className="k">Part 1</span>
        <span className="t" id="why-heading">
          Why
        </span>
        <span className="d">The clinical question behind the app</span>
      </div>

      <div className="landing-block">
        <h2>Why lymph nodes matter</h2>
        <p className="landing-tldr">
          <b>In short:</b> cancer cells that leave a breast tumor often travel first to nearby lymph
          nodes, so checking those nodes is a key part of staging and treatment planning.
        </p>
        <p>
          Most lymph from the breast drains toward nodes in the armpit — the{' '}
          <strong>axillary</strong> lymph nodes. Whether nodes contain cancer, and how much, helps
          clinicians plan surgery and further care.
        </p>
        <p>
          <button type="button" className="landing-jumplink" onClick={() => goToExplainerStep('lymphatic')}>
            See Step 1 · Lymphatics in the 3D tour →
          </button>
        </p>
      </div>

      <div className="landing-block">
        <h2>Size categories pathologists use</h2>
        <p>
          When tumor cells are found in a node, the size of the largest deposit matters. The
          explainer visualizes these thresholds inside a 3D lymph node.
        </p>
        <div className="landing-sizes">
          <div className="landing-size">
            <span className="dot" style={{ width: 10, height: 10 }} aria-hidden="true" />
            <h3>Isolated tumor cells (ITC)</h3>
            <p>Single cells or tiny clusters, no larger than 0.2&nbsp;mm</p>
          </div>
          <div className="landing-size">
            <span className="dot" style={{ width: 24, height: 24 }} aria-hidden="true" />
            <h3>Micrometastasis</h3>
            <p>Larger than 0.2&nbsp;mm, up to 2&nbsp;mm</p>
          </div>
          <div className="landing-size">
            <span className="dot" style={{ width: 46, height: 46 }} aria-hidden="true" />
            <h3>Macrometastasis</h3>
            <p>Larger than 2&nbsp;mm</p>
          </div>
        </div>
        <p>
          <button type="button" className="landing-jumplink" onClick={() => goToExplainerStep('inside')}>
            See Step 3 · Inside a node →
          </button>
        </p>
      </div>

      <div className="landing-block">
        <h2>Nodes and surgery</h2>
        <div className="landing-cards two">
          <article className="landing-card">
            <h3>Sentinel lymph node biopsy (SLNB)</h3>
            <p>
              The surgeon identifies and removes the first one or few nodes the tumor drains to —
              the “sentinel” nodes — so a pathologist can examine them.
            </p>
          </article>
          <article className="landing-card">
            <h3>Axillary lymph node dissection (ALND)</h3>
            <p>
              A more extensive removal of axillary nodes, used in selected situations. It carries a
              higher risk of side effects such as lymphedema (arm swelling).
            </p>
          </article>
        </div>
        <p className="landing-callout note">
          This summary is simplified for a general audience. Real staging and surgical decisions
          depend on many factors and are made by clinical teams.
        </p>
        <p>
          <button type="button" className="landing-jumplink" onClick={() => goToExplainerStep('surgery')}>
            See Step 4 · Surgery →
          </button>
        </p>
      </div>

      <div className="landing-block">
        <h2>Why computer assistance?</h2>
        <p>
          Examining lymph-node sections under the microscope is careful, time-consuming work, and
          very small deposits can be easy to miss. Digitized slides are enormous — often billions of
          pixels — which makes them a natural fit for software that can scan every region
          consistently.
        </p>
        <p>
          Researchers study whether models can <strong>flag suspicious regions for a human expert
          to review</strong>. This app is an educational window into that idea: what such a model
          looks at, what it outputs, and where it falls short.
        </p>
        <p>
          <button type="button" className="landing-jumplink" onClick={() => goToExplainerStep('patches')}>
            See Step 5 · Patches →
          </button>
        </p>
      </div>
    </section>
  )
}
