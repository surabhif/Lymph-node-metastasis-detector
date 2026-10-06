import { NavLink, Route, Routes, useLocation } from 'react-router-dom'
import { useEffect } from 'react'
import HomePage from './pages/HomePage'
import DemoPage from './pages/DemoPage'
import AboutPage from './pages/AboutPage'
import ResultsPage from './pages/ResultsPage'
import ModelCardPage from './pages/ModelCardPage'
import { SITE } from './lib/constants'
import './App.css'

const TITLES: Record<string, string> = {
  '/': SITE.title,
  '/demo': `Try the detector · ${SITE.shortTitle}`,
  '/results': `Results · ${SITE.shortTitle}`,
  '/about': `About · ${SITE.shortTitle}`,
  '/model-card': `Model card · ${SITE.shortTitle}`,
}

export default function App() {
  const location = useLocation()

  useEffect(() => {
    document.title = TITLES[location.pathname] ?? SITE.title
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
              <NavLink to="/demo">Demo</NavLink>
              <NavLink to="/results">Results</NavLink>
              <NavLink to="/about">About</NavLink>
              <NavLink to="/model-card">Model card</NavLink>
            </nav>
          </div>
        </header>
      </div>

      <main id="main" className="site-main">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/demo" element={<DemoPage />} />
          <Route path="/results" element={<ResultsPage />} />
          <Route path="/about" element={<AboutPage />} />
          <Route path="/model-card" element={<ModelCardPage />} />
        </Routes>
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
                <NavLink to="/about">How to cite</NavLink>
              </li>
              <li>
                <NavLink to="/model-card">Model card</NavLink>
              </li>
            </ul>
          </div>
        </div>
        <p className="footer-fine">MIT license · Research only</p>
      </footer>
    </div>
  )
}
