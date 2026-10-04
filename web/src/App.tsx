import { NavLink, Route, Routes } from 'react-router-dom'
import DemoPage from './pages/DemoPage'
import AboutPage from './pages/AboutPage'
import ResultsPage from './pages/ResultsPage'
import ModelCardPage from './pages/ModelCardPage'
import './App.css'

export default function App() {
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">
        Skip to content
      </a>

      <div className="disclaimer-bar" role="note">
        <strong>Research demo — not for clinical use.</strong>
        <span>
          This site is an educational project on public PatchCamelyon (PCam) data. It must
          never be used to diagnose patients or guide care.
        </span>
      </div>

      <header className="site-header">
        <div className="brand-block">
          <NavLink to="/" className="brand-title">
            Lymph Node Metastasis Detector
          </NavLink>
          <p className="brand-sub">
            In-browser PatchCamelyon demo with class-activation heatmaps
          </p>
        </div>
        <nav className="site-nav" aria-label="Primary">
          <NavLink to="/" end>
            Demo
          </NavLink>
          <NavLink to="/about">About / Method</NavLink>
          <NavLink to="/results">Results</NavLink>
          <NavLink to="/model-card">Model card</NavLink>
        </nav>
      </header>

      <main id="main" className="site-main">
        <Routes>
          <Route path="/" element={<DemoPage />} />
          <Route path="/about" element={<AboutPage />} />
          <Route path="/results" element={<ResultsPage />} />
          <Route path="/model-card" element={<ModelCardPage />} />
        </Routes>
      </main>

      <footer className="site-footer">
        <p>
          Dataset: PatchCamelyon (PCam), CC0 — Veeling et al. 2018; derived from Camelyon16
          (Bejnordi et al. 2017). Code under MIT. Inference runs locally in your browser;
          uploaded images are not sent to a server.
        </p>
      </footer>
    </div>
  )
}
