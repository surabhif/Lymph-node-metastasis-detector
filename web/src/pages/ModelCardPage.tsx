export default function ModelCardPage() {
  return (
    <article className="panel prose fade-in">
      <h1>Model card</h1>
      <p>
        Template following Mitchell et al. (2019). Surabhi fills interpretive claims after she
        reviews the run — every scientific claim should match what she can explain.
      </p>

      <section id="current-model" className="current-model-note">
        <h2>Current served model</h2>
        <p>
          The live demo currently runs an <strong>improved Cursor-assisted baseline</strong>:
          ResNet-18 on a larger official-split subset than the original quick stub (see Results /
          <code>results/baseline_fuller_run.json</code> for exact train/val/test counts, epochs, and
          metrics). It may be dynamically INT8-quantized for browser size when the gallery
          probability delta stays small. <strong>Surabhi still owns the science narrative</strong>{' '}
          and can replace the in-browser weights with her own Colab export.
        </p>
        <p className="muted tiny">
          Educational research only — not for clinical use. Patch-level scores ≠ patient decisions.
        </p>
      </section>

      <div className="model-card-grid">
        <section className="placeholder-box">
          <h2>Model details</h2>
          <ul>
            <li>Developer: Surabhi Fadnavis (high-school research project)</li>
            <li>Assisted baseline run: Cursor on CPU VM (see Results for date/metrics)</li>
            <li>Architecture: ResNet-18 (ImageNet-pretrained), binary logit + CAM export</li>
            <li>Training data: PatchCamelyon (PCam), official train split subset</li>
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
            <li>Stain, scanner, and population shift can degrade performance (see Results stain section)</li>
            <li>Official PCam splits must be respected; reshuffling risks leakage</li>
            <li>This baseline is still a subset/epochs run — not a claim of SOTA AUROC</li>
          </ul>
        </section>

        <section className="placeholder-box">
          <h2>Metrics</h2>
          <p className="muted">
            Copy numbers only from the Results page / <code>metrics.json</code>. No fabricated
            scores. Surabhi should interpret ROC, calibration, and mistakes in her own words.
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
