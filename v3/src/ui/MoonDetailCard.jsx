import { useExperience } from '../store/useExperience'
import { findMoon, PLANET_BY_ID } from '../config/solarSystem'

function hasLink(href) {
  return href && href !== '#'
}

function ExperienceDetail({ item }) {
  return (
    <>
      <div className="card-meta">{item.period}</div>
      <h3 className="card-title">{item.company}</h3>
      <div className="card-sub">{item.title}</div>
      <p className="card-desc">{item.description}</p>
      <div className="card-tags">
        {item.tech.map((t) => (
          <span key={t} className="card-tag">
            {t}
          </span>
        ))}
      </div>
    </>
  )
}

function ProjectDetail({ item }) {
  return (
    <>
      <div className="card-meta">
        <span className={`status-dot ${item.status}`} />
        {item.status === 'completed' ? 'COMPLETED' : 'IN PROGRESS'}
        {item.categories?.length > 0 && <> · {item.categories.join(' / ')}</>}
      </div>
      <h3 className="card-title">{item.title}</h3>
      <p className="card-desc">
        {item.description}
        {item.descriptionLink && (
          <a href={item.descriptionLink.url} target="_blank" rel="noopener noreferrer">
            {item.descriptionLink.text}
          </a>
        )}
      </p>
      <div className="card-tags">
        {item.tags.map((t) => (
          <span key={t} className="card-tag">
            {t}
          </span>
        ))}
      </div>
      {(hasLink(item.github) || hasLink(item.live)) && (
        <div className="card-links">
          {hasLink(item.github) && (
            <a href={item.github} target="_blank" rel="noopener noreferrer" className="card-link">
              GitHub ↗
            </a>
          )}
          {hasLink(item.live) && (
            <a href={item.live} target="_blank" rel="noopener noreferrer" className="card-link">
              Live demo ↗
            </a>
          )}
        </div>
      )}
    </>
  )
}

function EducationDetail({ item }) {
  return (
    <>
      <div className="card-meta">{item.period}</div>
      <h3 className="card-title">{item.school}</h3>
      <div className="card-sub">{item.title}</div>
      <p className="card-desc">{item.description}</p>
    </>
  )
}

const DETAILS = {
  experience: ExperienceDetail,
  projects: ProjectDetail,
  education: EducationDetail,
}

export default function MoonDetailCard() {
  const phase = useExperience((s) => s.phase)
  const moonId = useExperience((s) => s.moonId)
  const back = useExperience((s) => s.back)

  if (phase !== 'moon' || !moonId) return null
  const moon = findMoon(moonId)
  if (!moon) return null

  const planet = PLANET_BY_ID[moon.planetId]
  const Body = DETAILS[moon.planetId]

  return (
    <div className="moon-card" key={moonId}>
      <div className="card-kicker">
        {String(moon.displayIndex).padStart(2, '0')} / {String(planet.moons.length).padStart(2, '0')} ·{' '}
        {planet.section.title.toUpperCase()}
      </div>
      {Body && <Body item={moon.item} />}
      <button className="card-close" onClick={back} aria-label="Back to planet">
        ✕
      </button>
    </div>
  )
}
