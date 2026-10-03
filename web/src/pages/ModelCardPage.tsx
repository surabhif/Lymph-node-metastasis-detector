export default function ModelCardPage() {
  return (
    <article className="panel prose fade-in">
      <h1>Model card</h1>
      <p>
        Template following Mitchell et al. (2019). Surabhi fills this in after training —
        every claim should match what she can explain.
      </p>

      <div className="placeholder-box">
        <h2 style={{ marginTop: 0 }}>Model details</h2>
        <ul>
          <li>Developer: Surabhi (high-school research project)</li>
          <li>Model date: _TBD_</li>
          <li>Architecture: _ResNet-18 / MobileNetV2 / other — choose in notebook_</li>
          <li>Training data: PatchCamelyon (PCam), official train split</li>
          <li>License of this demo code: MIT; PCam data: CC0</li>
        </ul>

        <h2>Intended use</h2>
        <ul>
          <li>Intended: educational research demo on public PCam patches</li>
          <li>Out of scope: any clinical diagnosis, triage, or surgical decision support</li>
        </ul>

        <h2>Factors &amp; limitations</h2>
        <ul>
          <li>Patch-level labels ≠ whole-slide or patient-level decisions</li>
          <li>Stain, scanner, and population shift can degrade performance</li>
          <li>Official PCam splits must be respected; reshuffling risks leakage</li>
          <li>Current bundled weights (if still the placeholder): untrained / not evaluated</li>
        </ul>

        <h2>Metrics</h2>
        <p className="muted">Copy from the Results page once evaluation is done. No fabricated scores.</p>

        <h2>Ethical considerations</h2>
        <ul>
          <li>Public de-identified research data only</li>
          <li>Prominent non-clinical disclaimer on every page</li>
          <li>Credit dataset authors; disclose AI help on scaffolding honestly</li>
        </ul>
      </div>
    </article>
  )
}
