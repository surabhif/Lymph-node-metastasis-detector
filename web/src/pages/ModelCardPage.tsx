export default function ModelCardPage() {
  return (
    <article className="panel prose fade-in">
      <h1>Model card</h1>
      <p>
        Template following Mitchell et al. (2019). Surabhi fills this in after training — every claim
        should match what she can explain.
      </p>

      <section id="current-model" className="current-model-note">
        <h2>Current served model</h2>
        <p>
          The live demo currently runs a <strong>quick Cursor-assisted baseline</strong> (subset of
          the official PCam splits, short training) so visitors can try the interface. Scores on the
          Results page are labeled as that baseline. When Surabhi finishes her own training run, she
          will replace the in-browser weights and refresh the Results export — details and file
          paths are in the repository README.
        </p>
      </section>

      <div className="model-card-grid">
        <section className="placeholder-box">
          <h2>Model details</h2>
          <ul>
            <li>Developer: Surabhi (high-school research project)</li>
            <li>Model date: <em>_TBD_</em></li>
            <li>Architecture: <em>_ResNet-18 / MobileNetV2 / other_</em></li>
            <li>Training data: PatchCamelyon (PCam), official train split</li>
            <li>License: demo code MIT; PCam data CC0</li>
          </ul>
        </section>

        <section className="placeholder-box">
          <h2>Intended use</h2>
          <ul>
            <li>Intended: educational research demo on public PCam patches</li>
            <li>Out of scope: any clinical diagnosis, triage, or surgical decision support</li>
          </ul>
        </section>

        <section className="placeholder-box">
          <h2>Factors &amp; limitations</h2>
          <ul>
            <li>Patch-level labels ≠ whole-slide or patient-level decisions</li>
            <li>Stain, scanner, and population shift can degrade performance</li>
            <li>Official PCam splits must be respected; reshuffling risks leakage</li>
          </ul>
        </section>

        <section className="placeholder-box">
          <h2>Metrics</h2>
          <p className="muted">
            Copy from the Results page once your evaluation is done. No fabricated scores.
          </p>
        </section>

        <section className="placeholder-box">
          <h2>Ethical considerations</h2>
          <ul>
            <li>Public de-identified research data only</li>
            <li>Prominent non-clinical disclaimer</li>
            <li>Credit dataset authors; disclose AI help on scaffolding honestly</li>
          </ul>
        </section>
      </div>
    </article>
  )
}
