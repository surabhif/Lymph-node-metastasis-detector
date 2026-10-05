import { SITE } from '../lib/constants'

/**
 * DRAFT — Surabhi still owns this science narrative and About voice.
 * Please personalize every first-person paragraph before treating this as final.
 * Do not invent mentors, awards, or accuracy claims beyond the published Results run.
 */
export default function AboutPage() {
  return (
    <article className="panel prose fade-in about-page">
      {/* DRAFT: Surabhi should rewrite this first-person voice in her own words. */}
      <h1>About</h1>
      <p className="muted tiny draft-note">
        Draft copy for Surabhi to personalize — she owns the science narrative and final voice.
      </p>

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
            I built this educational research demo to learn how machine learning can support — never
            replace — the careful work pathologists and surgeons do when deciding whether breast
            cancer has reached the lymph nodes.
          </p>
        </div>
      </section>

      <h2>Why lymph-node status matters to me</h2>
      <p>
        Lymph-node involvement helps shape how far cancer may have spread and what treatment path
        makes sense. I want to become a surgical oncologist, so understanding that decision — and
        the limits of any algorithm that touches it — feels personal, not abstract. PatchCamelyon
        (PCam) lets me study metastasis-related patterns on public, de-identified image patches
        without ever touching clinic data.
      </p>

      <h2>What I set out to learn</h2>
      <p>
        I wanted to go beyond a tutorial accuracy number: train a small CNN on the official PCam
        splits, measure ROC-AUC and calibration honestly, look at confident mistakes, export a
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
        The live weights are an <em>improved Cursor-assisted baseline</em> trained on a larger
        official-split subset than the original quick stub, still on CPU with limited epochs. Exact
        sample counts, epochs, and metrics live on the Results page and in{' '}
        <code>results/baseline_fuller_run.json</code>. I still plan to replace them with my own
        Colab training run when I can push further — more data, stronger augmentation, and better
        stain robustness.
      </p>

      <h2>What I still want to improve</h2>
      <ul>
        <li>Stain and scanner colour robustness (see the stain-shift experiment on Results).</li>
        <li>Clearer write-up of mistakes, calibration, and failure modes in my own words.</li>
        <li>A fuller training run on GPU that I can fully explain end-to-end.</li>
        <li>
          Later: seeking expert mentorship for pathology and ML review (outreach is intentionally
          not claimed here yet).
        </li>
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

      <h2>How to cite</h2>
      <pre className="cite-block">{`Surabhi Fadnavis. Lymph Node Metastasis Detector (PatchCamelyon research demo). ${new Date().getFullYear()}. ${SITE.pagesUrl}

Dataset: Veeling et al. (2018), PatchCamelyon (CC0); Bejnordi et al. (2017), Camelyon16.`}</pre>

      <h2>Credits and help</h2>
      <ul>
        <li>
          <strong>Surabhi</strong> owns the science narrative, training choices she can explain,
          evaluation interpretation, and every claim on this About page once she personalizes this
          draft.
        </li>
        <li>
          The <strong>web app scaffold / UI polish</strong>, Pages workflow, teaching-notebook
          template, and this improved baseline training pass were built with help from{' '}
          <strong>Cursor AI</strong>. That help is disclosed here and in the README.
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
