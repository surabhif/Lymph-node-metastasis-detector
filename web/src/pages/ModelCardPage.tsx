export default function ModelCardPage() {
  return (
    <article className="panel prose fade-in">
      <h1 tabIndex={-1}>Model card</h1>
      <p>
        Template following Mitchell et al. (2019). Every scientific claim should match the published
        Results run (<code>results/full_retrain_metrics.json</code> for the live model).
      </p>

      <section id="current-model" className="current-model-note">
        <h2>Current served model</h2>
        <p>
          The live demo runs a <strong>full-PCam retrain</strong>: ResNet-18 (ImageNet-pretrained)
          trained on <strong>all 262,144</strong> official train patches for 8 epochs on CPU with
          bfloat16 autocast; <strong>epoch 3</strong> selected by validation AUC{' '}
          <strong>0.9587</strong>. Dynamic INT8 ONNX (~10.7 MB) is what the browser downloads.
          Platt calibration, Youden threshold <strong>0.5201</strong>, and uncertain band{' '}
          <strong>0.4879–0.5522</strong> (on the calibrated probability) were chosen on the
          validation set.
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
            <li>
              Architecture: ResNet-18 (ImageNet-pretrained), binary logit + CAM export (
              <code>probability</code>, <code>features</code> N×512×3×3, <code>cam_weights</code>{' '}
              512)
            </li>
            <li>
              Training data: PatchCamelyon (PCam) official train split — all 262,144 patches
            </li>
            <li>
              Training: 8 epochs, CPU, bf16 autocast; AdamW + OneCycleLR; ImageNet mean/std; 96×96
            </li>
            <li>
              Checkpoint: epoch 3 (val AUC 0.9587). Scripts:{' '}
              <code>training/train.py</code>, <code>training/evaluate.py</code>
            </li>
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
            <li>
              Stain, scanner, and population shift can degrade performance (see Results stain
              section for the older baseline stress test)
            </li>
            <li>Official PCam splits must be respected; reshuffling risks leakage</li>
            <li>
              Val–test gap: best val AUC 0.9587 vs test AUC 0.9401 — expect optimism on the
              selection set
            </li>
            <li>
              Served INT8 file scores test AUC 0.9368 / acc 83.56% @ 0.5 vs PyTorch 0.9401 — small
              but real quantization gap; report both
            </li>
          </ul>
        </section>

        <section className="placeholder-box">
          <h2>Metrics (full official test, n=32,768)</h2>
          <ul>
            <li>
              Test AUC <strong>0.9401</strong> (95% CI 0.9373–0.9428)
            </li>
            <li>
              Calibrated @ 0.5201: acc <strong>86.59%</strong>, sens 79.92%, spec 93.25%, ECE{' '}
              <strong>0.0339</strong>
            </li>
            <li>
              Raw @ 0.5: acc 83.48%, sens 69.87%, spec 97.08%, ECE 0.1281
            </li>
            <li>
              Confusion @ t* (calibrated): TP 13,089 / FN 3,288 / FP 1,106 / TN 15,285
            </li>
            <li>
              Calibration: Platt <code>p = sigmoid(0.70454·z + 1.04880)</code>, z = logit(ONNX
              probability); uncertain band flags 1.9% of test (87.3% acc outside)
            </li>
          </ul>
          <p className="muted tiny">
            Source of truth: <code>results/full_retrain_metrics.json</code>. No fabricated scores.
          </p>
        </section>

        <section className="placeholder-box">
          <h2>Ethical considerations</h2>
          <ul>
            <li>Public de-identified research data only</li>
            <li>Prominent non-clinical disclaimer</li>
            <li>Credit dataset authors (Bejnordi / Litjens / Veeling et al.)</li>
          </ul>
        </section>
      </div>
    </article>
  )
}
