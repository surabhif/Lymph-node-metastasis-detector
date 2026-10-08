import family from '../data/family.json'

export default function ProjectFamily() {
  return (
    <nav className="project-family" aria-label="Project family">
      <p className="footer-heading">Project family</p>
      <ul className="project-family-list">
        {family.map((project) => (
          <li
            key={project.id}
            className={`project-family-card${project.current ? ' is-current' : ''}`}
          >
            <span
              className="project-family-swatch"
              style={{ background: project.accent }}
              aria-hidden="true"
            />
            {project.current ? (
              <span aria-current="page">
                <strong>{project.name}</strong>
                <span className="project-family-blurb">
                  {project.blurb} · you are here
                </span>
              </span>
            ) : (
              <a href={project.url}>
                <strong>{project.name}</strong>
                <span className="project-family-blurb">
                  {project.blurb}
                  <span className="sr-only"> (opens related educational project)</span>
                </span>
              </a>
            )}
          </li>
        ))}
      </ul>
      <p className="project-family-note">
        All three are educational, high-school research projects — not clinical tools.
      </p>
    </nav>
  )
}
