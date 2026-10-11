import { goToExplainerStep } from './landingNav'

export function LandingWhy() {
  return (
    <section id="why" className="landing-section" aria-labelledby="why-heading">
      <div className="landing-partbanner">
        <span className="k">Part 1</span>
        <span className="t" id="why-heading">
          Why
        </span>
        <span className="d">The medical question behind the app</span>
      </div>

      <div className="landing-block">
        <h2>Why lymph nodes matter</h2>
        <p className="landing-tldr">
          <b>In short:</b> cancer cells that leave a breast tumor often travel first to nearby lymph
          nodes. Checking those nodes helps doctors stage the disease and plan treatment.
        </p>
        <p>
          Most lymph from the breast drains toward nodes in the armpit (the axillary lymph nodes).
          Whether those nodes contain cancer, and how much, helps guide surgery and follow-up care.
        </p>
        <p>
          <button type="button" className="landing-jumplink" onClick={() => goToExplainerStep('lymphatic')}>
            Open Step 1, Lymphatics, in the 3D tour
          </button>
        </p>
      </div>

      <div className="landing-block">
        <h2>Size categories pathologists use</h2>
        <p>
          When tumor cells are found in a node, the size of the largest deposit matters. The tour
          shows these size cutoffs inside a 3D lymph node.
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
            Open Step 3, Inside a node
          </button>
        </p>
      </div>

      <div className="landing-block">
        <h2>Nodes and surgery</h2>
        <div className="landing-cards two">
          <article className="landing-card">
            <h3>Sentinel lymph node biopsy (SLNB)</h3>
            <p>
              The surgeon finds and removes the first one or few nodes that drain the tumor area
              (the sentinel nodes). A pathologist then examines them under the microscope.
            </p>
          </article>
          <article className="landing-card">
            <h3>Axillary lymph node dissection (ALND)</h3>
            <p>
              A larger operation that removes more armpit nodes. Doctors use it in selected cases.
              It has a higher chance of side effects such as arm swelling (lymphedema).
            </p>
          </article>
        </div>
        <p className="landing-callout note">
          This summary is simplified for a general reader. Real staging and surgery choices depend
          on many factors and are made by clinical teams.
        </p>
        <p>
          <button type="button" className="landing-jumplink" onClick={() => goToExplainerStep('surgery')}>
            Open Step 4, Surgery
          </button>
        </p>
      </div>

      <div className="landing-block">
        <h2>Why computer help?</h2>
        <p>
          Reading lymph-node slides under the microscope takes careful time. Very small deposits
          can be easy to miss. Digitized slides are huge, often billions of pixels, so software can
          scan every region the same way.
        </p>
        <p>
          Researchers ask whether models can{' '}
          <strong>flag suspicious regions for a human expert to review</strong>. This app is a
          teaching example of that idea: what the model looks at, what it outputs, and where it
          fails.
        </p>
        <p>
          <button type="button" className="landing-jumplink" onClick={() => goToExplainerStep('patches')}>
            Open Step 5, Patches
          </button>
        </p>
      </div>
    </section>
  )
}
