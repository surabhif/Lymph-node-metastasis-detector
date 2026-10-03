import { SITE } from '../lib/constants'

export default function AboutPage() {
  return (
    <article className="panel prose fade-in about-page">
      <h1>About</h1>

      <section className="about-hero-card">
        <div className="avatar-placeholder" aria-hidden="true">
          Photo
        </div>
        <div>
          <h2 className="about-name">Surabhi</h2>
          <p className="muted">
            High-school senior · aspiring surgical oncologist ·{' '}
            <em>[short bio placeholder — write 2–3 sentences about yourself]</em>
          </p>
        </div>
      </section>

      <h2>Motivation</h2>
      <div className="placeholder-box">
        <p>
          <em>
            [Surabhi: why lymph-node status and this project matter to you — in your own words.]
          </em>
        </p>
      </div>

      <h2>Method (summary)</h2>
      <ul>
        <li>
          Fine-tune a small ImageNet-pretrained CNN (ResNet-18 or MobileNetV2) on PatchCamelyon in
          PyTorch / Colab.
        </li>
        <li>Keep PCam&apos;s official train / valid / test splits — never reshuffle across them.</li>
        <li>
          Evaluate with accuracy, ROC-AUC (bootstrap CI), calibration, confusion matrix, and
          confident mistakes.
        </li>
        <li>
          Export ONNX with probability + feature maps + classifier weights so the browser can draw a
          CAM without gradients.
        </li>
      </ul>

      <h2>Mentor</h2>
      <div className="placeholder-box">
        <p>
          <em>[Placeholder only — add mentor name/affiliation when appropriate.]</em>
        </p>
      </div>

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

      <h2>How to cite</h2>
      <pre className="cite-block">{`Surabhi. Lymph Node Metastasis Detector (PatchCamelyon research demo). ${new Date().getFullYear()}. ${SITE.pagesUrl}

Dataset: Veeling et al. (2018), PatchCamelyon (CC0); Bejnordi et al. (2017), Camelyon16.`}</pre>

      <h2>Credits and help</h2>
      <ul>
        <li>
          <strong>Surabhi</strong> owns training, experiments, evaluation, figures, the Results /
          model-card write-up, and every scientific design choice she can explain.
        </li>
        <li>
          The <strong>web app scaffold / UI polish</strong>, Pages workflow, and teaching-notebook
          template were built with help from <strong>Cursor AI</strong>. That help is disclosed here
          and in the README.
        </li>
        <li>
          PCam authors and Camelyon16 organizers — see citations on the home footer and README.
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
