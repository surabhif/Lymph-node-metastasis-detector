import CiteBox from '../components/CiteBox'
import { SITE } from '../lib/constants'

export default function AboutPage() {
  return (
    <article className="panel prose fade-in about-page">
      <h1 tabIndex={-1}>About</h1>

      <section className="about-hero-card">
        <div className="avatar-placeholder" aria-hidden="true">
          Photo
        </div>
        <div>
          <h2 className="about-name">Surabhi Fadnavis</h2>
          <p className="muted">
            Lambert High School senior · aspiring surgical oncologist
          </p>
          <p>
            This educational research demo explores how machine learning can support — never
            replace — the careful work pathologists and surgeons do when deciding whether breast
            cancer has reached the lymph nodes.
          </p>
        </div>
      </section>

      <h2>Why lymph-node status matters</h2>
      <p>
        Lymph-node involvement helps shape how far cancer may have spread and what treatment path
        makes sense. PatchCamelyon (PCam) lets students study metastasis-related patterns on
        public, de-identified image patches without ever touching clinic data.
      </p>

      <h2>What this project set out to learn</h2>
      <p>
        Go beyond a tutorial accuracy number: train a small CNN on the official PCam splits,
        measure ROC-AUC and calibration honestly, look at confident mistakes, export a
        browser-friendly ONNX model with class-activation maps, and write about what still breaks —
        especially when stain colour shifts.
      </p>

      <h2>What this app does</h2>
      <ul>
        <li>
          An in-browser demo that scores 96×96 H&amp;E patches and shows a CAM-style heatmap.
        </li>
        <li>
          A Results page with metrics, ROC, calibration, and a confident-mistake gallery from the
          current training run.
        </li>
        <li>
          A short 3D explainer of lymph-node context for visitors who are new to the biology.
        </li>
      </ul>
      <p>
        <strong>This is educational research only — not for clinical use.</strong> A patch score is
        not a patient diagnosis, a whole-slide read, or a surgical decision.
      </p>

      <h2>Honest status of the model</h2>
      <p>
        The live weights are an <em>improved baseline</em> trained on a larger official-split
        subset than the original quick stub, still on CPU with limited epochs. Exact sample counts,
        epochs, and metrics live on the Results page and in{' '}
        <code>results/baseline_fuller_run.json</code>. A full-PCam GPU retrain with calibration is
        the planned next training step.
      </p>

      <h2>Open improvements</h2>
      <ul>
        <li>Stain and scanner colour robustness (see the stain-shift experiment on Results).</li>
        <li>Clearer write-up of mistakes, calibration, and failure modes.</li>
        <li>A fuller training run on GPU on the official training split.</li>
      </ul>

      <h2>Method (summary)</h2>
      <ul>
        <li>
          Fine-tune an ImageNet-pretrained ResNet-18 on PatchCamelyon in PyTorch, then export ONNX
          with <code>probability</code>, <code>features</code>, and <code>cam_weights</code>.
        </li>
        <li>Keep PCam&apos;s official train / valid / test splits — never reshuffle across them.</li>
        <li>
          Evaluate with accuracy, ROC-AUC (bootstrap CI), calibration, confusion matrix, confident
          mistakes, and a colour / stain-shift stress test.
        </li>
      </ul>

      <h2>Write-up PDF</h2>
      <div className="placeholder-box">
        <p>
          Download slot: place a PDF at <code>web/public/writeup.pdf</code> and link it here when
          ready.
        </p>
        <p>
          <span className="btn secondary disabled-link" aria-disabled="true">
            PDF coming soon
          </span>
        </p>
      </div>

      <h2>Repository</h2>
      <p>
        <a href={SITE.githubUrl} target="_blank" rel="noreferrer">
          {SITE.githubUrl}
        </a>
      </p>

      <CiteBox />

      <h2>Credits</h2>
      <ul>
        <li>
          <strong>Surabhi Fadnavis</strong> — project author; science narrative and evaluation
          interpretation.
        </li>
        <li>
          PCam authors and Camelyon16 organizers — see citations below and in the repository
          README.
        </li>
      </ul>

      <h2>Ethics</h2>
      <p>
        Public de-identified data only. No clinic PHI. Licenses respected. Metrics not overclaimed.
        Research demo — not for clinical use.
      </p>
    </article>
  )
}
