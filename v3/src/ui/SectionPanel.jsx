import { useExperience } from '../store/useExperience'
import { PLANET_BY_ID } from '../config/solarSystem'
import { about, contact } from '../data/content'

function skillFillColor(level) {
  return `rgba(232, 240, 250, ${0.3 + (level / 100) * 0.65})`
}

function AboutPanel() {
  return (
    <>
      <h3 className="panel-h3">{about.heading}</h3>
      {about.paragraphs.map((p, i) => (
        <p key={i} className="panel-p">
          {p}
        </p>
      ))}
      <div className="panel-tags">
        {about.tags.map((t) => (
          <span key={t} className="panel-tag">
            {t}
          </span>
        ))}
      </div>
      <h4 className="panel-h4">Languages / Technologies</h4>
      <div className="panel-skills">
        {about.skills.map((s) => (
          <div key={s.name} className="panel-skill">
            <div className="panel-skill-head">
              <span>{s.name}</span>
              <span className="panel-skill-exp">{s.experience}</span>
            </div>
            <div className="panel-skill-bar">
              <div
                className="panel-skill-fill"
                style={{ width: `${s.level}%`, backgroundColor: skillFillColor(s.level) }}
              />
            </div>
          </div>
        ))}
      </div>
      <div className="panel-stats">
        {about.stats.map((s) => (
          <div key={s.label} className="panel-stat">
            <span className="panel-stat-value">{s.value}</span>
            <span className="panel-stat-label">{s.label}</span>
          </div>
        ))}
      </div>
    </>
  )
}

/** Generic moon-backed list: hovering highlights the moon, clicking flies to it. */
function MoonListPanel({ planet, render, moons }) {
  const focusMoon = useExperience((s) => s.focusMoon)
  const setHoverMoon = useExperience((s) => s.setHoverMoon)
  return (
    <div className="panel-list">
      {(moons || planet.moons).map((moon) => (
        <button
          key={moon.id}
          className="panel-item"
          onClick={() => focusMoon(moon.id)}
          onMouseEnter={() => setHoverMoon(moon.id)}
          onMouseLeave={() => setHoverMoon(null)}
        >
          {render(moon.item)}
          <span className="panel-item-arrow">→</span>
        </button>
      ))}
    </div>
  )
}

function ExperiencePanel({ planet }) {
  return (
    <>
      <MoonListPanel
        planet={planet}
        render={(exp) => (
          <span className="panel-item-body">
            <span className="panel-item-title">{exp.company}</span>
            <span className="panel-item-sub">{exp.title}</span>
            <span className="panel-item-meta">{exp.period}</span>
          </span>
        )}
      />
    </>
  )
}

function ProjectsPanel({ planet }) {
  return (
    <>
      {/* project data is oldest-first (orbit order); list newest at the top */}
      <MoonListPanel
        planet={planet}
        moons={[...planet.moons].reverse()}
        render={(p) => (
          <span className="panel-item-body">
            <span className="panel-item-title">
              <span className={`status-dot ${p.status}`} />
              {p.title}
            </span>
            <span className="panel-item-meta">{p.tags.slice(0, 4).join(' · ')}</span>
          </span>
        )}
      />
    </>
  )
}

function EducationPanel({ planet }) {
  return (
    <>
      <MoonListPanel
        planet={planet}
        render={(edu) => (
          <span className="panel-item-body">
            <span className="panel-item-title">{edu.school}</span>
            <span className="panel-item-sub">{edu.title}</span>
            <span className="panel-item-meta">{edu.period}</span>
          </span>
        )}
      />
    </>
  )
}

function ContactPanel() {
  return (
    <>
      <h3 className="panel-h3">{contact.heading}</h3>
      <p className="panel-p">{contact.blurb}</p>
      <p className="panel-p panel-p-accent">{contact.prompt}</p>
      <a className="panel-email" href={`mailto:${contact.email}`}>
        {contact.email}
      </a>
      <div className="panel-socials">
        {contact.socials.map((s) => (
          <a key={s.label} href={s.href} target="_blank" rel="noopener noreferrer" className="panel-social">
            {s.label}
          </a>
        ))}
      </div>
    </>
  )
}

const PANELS = {
  about: AboutPanel,
  experience: ExperiencePanel,
  projects: ProjectsPanel,
  education: EducationPanel,
  contact: ContactPanel,
}

export default function SectionPanel() {
  const phase = useExperience((s) => s.phase)
  const focusId = useExperience((s) => s.focusId)
  const back = useExperience((s) => s.back)

  if (phase !== 'planet' || !focusId) return null
  const planet = PLANET_BY_ID[focusId]
  const Body = PANELS[focusId]

  return (
    <aside className="section-panel" key={focusId}>
      <h2 className="panel-title">{planet.section.title}</h2>
      <div className="panel-divider" />
      <div className="panel-body">{Body && <Body planet={planet} />}</div>
      <button className="panel-back" onClick={back}>
        ← Back to overview
      </button>
    </aside>
  )
}
