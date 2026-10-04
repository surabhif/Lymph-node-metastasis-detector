import { lazy, Suspense } from 'react'
import { Link } from 'react-router-dom'

const LymphExplainer = lazy(() => import('../explainer/LymphExplainer'))

export default function HomePage() {
  return (
    <div className="home fade-in">
      <Suspense
        fallback={
          <div className="panel" style={{ padding: '2rem', minHeight: '40vh' }}>
            <p className="hero-eyebrow">Interactive explainer</p>
            <h1 className="hero-brand">Lymph Node Metastasis Detector</h1>
            <p className="hero-lede">Loading the educational tour…</p>
            <div className="hero-actions">
              <Link className="btn" to="/demo">
                Try the detector
              </Link>
            </div>
          </div>
        }
      >
        <LymphExplainer />
      </Suspense>
    </div>
  )
}
