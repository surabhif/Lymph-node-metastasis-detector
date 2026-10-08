import { Suspense, lazy, useEffect, useRef } from 'react'
import { NavLink, Route, Routes, useLocation } from 'react-router-dom'
import ProjectFamily from './components/ProjectFamily'
import UpdateBanner from './components/UpdateBanner'
import { SITE } from './lib/constants'
import './App.css'

const HomePage = lazy(() => import('./pages/HomePage'))
const DemoPage = lazy(() => import('./pages/DemoPage'))
const QuizPage = lazy(() => import('./pages/QuizPage'))
const SlidePage = lazy(() => import('./pages/SlidePage'))
const AboutPage = lazy(() => import('./pages/AboutPage'))
const ResultsPage = lazy(() => import('./pages/ResultsPage'))
const ModelCardPage = lazy(() => import('./pages/ModelCardPage'))

const TITLES: Record<string, string> = {
  '/': SITE.title,
  '/demo': `Try the detector · ${SITE.shortTitle}`,
  '/quiz': `You vs. the model · ${SITE.shortTitle}`,
  '/slide': `Slide viewer · ${SITE.shortTitle}`,
  '/results': `Results · ${SITE.shortTitle}`,
  '/about': `About · ${SITE.shortTitle}`,
  '/model-card': `Model card · ${SITE.shortTitle}`,
}

function PrefetchDemoModel() {
  // Warm the model cache when the Demo nav link is hovered or focused.
  const warm = () => {
    void import('./lib/inference').then((m) => m.preloadModel().catch(() => undefined))
  }
  return (
    <NavLink to="/demo" onMouseEnter={warm} onFocus={warm}>
      Demo
    </NavLink>
  )
}

export default function App() {
  const location = useLocation()
  const mainRef = useRef<HTMLElement>(null)
  const firstNav = useRef(true)

  useEffect(() => {
    document.title = TITLES[location.pathname] ?? SITE.title
    if (firstNav.current) {
      firstNav.current = false
      return
    }
    const heading = mainRef.current?.querySelector('h1') as HTMLElement | null
    if (heading) {
      if (!heading.hasAttribute('tabindex')) heading.tabIndex = -1
      heading.focus({ preventScroll: true })
    }
  }, [location.pathname])

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">
        Skip to content
      </a>

      <div className="site-top">
        <div className="site-notice" role="note">
          <p>
            Research demo, not for clinical use. Educational baseline only — never for diagnosis or
            care decisions.{' '}
            <NavLink to="/model-card#current-model" className="notice-learn-more">
              Learn more
            </NavLink>
          </p>
        </div>

        <header className="site-header">
          <div className="site-header-inner">
            <div className="brand-block">
              <NavLink to="/" className="brand-title">
                {SITE.title}
              </NavLink>
              <p className="brand-kicker">Surabhi · high-school research project</p>
            </div>
            <nav className="site-nav" aria-label="Primary">
              <NavLink to="/" end>
                Home
              </NavLink>
              <PrefetchDemoModel />
              <NavLink to="/quiz">Quiz</NavLink>
              <NavLink to="/slide">Slide</NavLink>
              <NavLink to="/results">Results</NavLink>
              <NavLink to="/about">About</NavLink>
              <NavLink to="/model-card">Model card</NavLink>
            </nav>
          </div>
        </header>
      </div>

      <UpdateBanner />

      <main id="main" className="site-main" ref={mainRef} tabIndex={-1}>
        <Suspense fallback={<p className="muted">Loading…</p>}>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/demo" element={<DemoPage />} />
            <Route path="/quiz" element={<QuizPage />} />
            <Route path="/slide" element={<SlidePage />} />
            <Route path="/results" element={<ResultsPage />} />
            <Route path="/about" element={<AboutPage />} />
            <Route path="/model-card" element={<ModelCardPage />} />
          </Routes>
        </Suspense>
      </main>

      <footer className="site-footer">
        <div className="footer-grid">
          <div>
            <p className="footer-brand">{SITE.title}</p>
            <p>
              Dataset: PatchCamelyon (PCam), CC0 — Veeling et al. 2018; Camelyon16 (Bejnordi et
              al. 2017). Inference runs locally in your browser.
            </p>
          </div>
          <div>
            <p className="footer-heading">Links</p>
            <ul className="footer-links">
              <li>
                <a href={SITE.githubUrl} target="_blank" rel="noreferrer">
                  GitHub repository
                </a>
              </li>
              <li>
                <NavLink to="/about#cite">How to cite</NavLink>
              </li>
              <li>
                <NavLink to="/model-card">Model card</NavLink>
              </li>
            </ul>
          </div>
        </div>
        <ProjectFamily />
        <p className="footer-fine">MIT license · Research only · Not for clinical use</p>
      </footer>
    </div>
  )
}
