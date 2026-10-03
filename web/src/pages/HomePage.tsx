import { Link } from 'react-router-dom'

export default function HomePage() {
  return (
    <div className="home fade-in">
      <section className="hero" aria-labelledby="hero-title">
        <div className="hero-copy">
          <p className="hero-eyebrow">PatchCamelyon · research demo</p>
          <h1 id="hero-title" className="hero-brand">
            Lymph Node Metastasis Detector
          </h1>
          <p className="hero-lede">
            Lymph-node status helps guide breast-cancer surgery and staging. This project studies
            whether a small CNN can score metastatic tissue in public 96×96 PCam patches — and show
            where it looked.
          </p>
          <div className="hero-actions">
            <Link className="btn" to="/demo">
              Try the detector
            </Link>
            <Link className="btn secondary" to="/results">
              View results
            </Link>
          </div>
          <p className="hero-note">Images stay in your browser · not for clinical use</p>
        </div>
        <div className="hero-visual" aria-hidden="true">
          <div className="hero-orb" />
          <img
            className="hero-sample"
            src={`${import.meta.env.BASE_URL}samples/pcam_test_tumor_01_idx2883.png`}
            alt=""
            width={192}
            height={192}
          />
        </div>
      </section>

      <section className="home-strip" aria-label="Project pillars">
        <div>
          <h2>Public data</h2>
          <p>PCam (CC0) lymph-node patches from Camelyon16 — de-identified research images only.</p>
        </div>
        <div>
          <h2>Honest evaluation</h2>
          <p>
            Official splits, ROC-AUC with a confidence interval, calibration, and a failure gallery.
          </p>
        </div>
        <div>
          <h2>Private by design</h2>
          <p>ONNX Runtime Web runs on-device. Uploaded images are not sent to a server.</p>
        </div>
      </section>
    </div>
  )
}
