import { lazy, Suspense, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { LandingHero } from './home/LandingHero'
import { LandingWhy } from './home/LandingWhy'
import { LandingWhat } from './home/LandingWhat'
import { LandingHow } from './home/LandingHow'
import { applyLandingHash } from './home/landingNav'

const LymphExplainer = lazy(() => import('../explainer/LymphExplainer'))

export default function HomePage() {
  useEffect(() => {
    applyLandingHash(window.location.hash)
    const onHash = () => applyLandingHash(window.location.hash)
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  return (
    <div className="home fade-in landing-home">
      <LandingHero />
      <LandingWhy />
      <LandingWhat />
      <LandingHow />

      <section id="explainer" className="landing-explainer" aria-label="Interactive 3D explainer">
        <Suspense
          fallback={
            <div className="panel landing-explainer-fallback">
              <p className="landing-eyebrow">Interactive explainer</p>
              <h2>Loading the educational tour…</h2>
              <div className="landing-actions">
                <Link className="btn" to="/demo">
                  Try the detector
                </Link>
              </div>
            </div>
          }
        >
          <LymphExplainer compactIntro />
        </Suspense>
      </section>
    </div>
  )
}
