import { useExperience } from '../store/useExperience'
import { PLANETS, PLANET_BY_ID, SYSTEM_SEED, findMoon } from '../config/solarSystem'

function hint({ phase, focusId, moonId }) {
  if (phase === 'travel') {
    const dest = moonId
      ? findMoon(moonId)?.label
      : focusId
        ? PLANET_BY_ID[focusId]?.section.title
        : 'overview'
    return `En route to ${dest}…`
  }
  if (phase === 'planet') {
    const def = PLANET_BY_ID[focusId]
    return def?.moons.length ? 'Select a moon to inspect · ESC to return' : 'ESC to return to overview'
  }
  if (phase === 'moon') return 'ESC to back out'
  return ''
}

export default function HUD() {
  const phase = useExperience((s) => s.phase)
  const focusId = useExperience((s) => s.focusId)
  const moonId = useExperience((s) => s.moonId)
  const focusPlanet = useExperience((s) => s.focusPlanet)
  const goHome = useExperience((s) => s.goHome)

  const visible = phase !== 'loading' && phase !== 'intro'
  const busy = phase === 'travel' || phase === 'loading' || phase === 'intro'
  const hintText = hint({ phase, focusId, moonId })

  return (
    <div className={`hud ${visible ? 'is-visible' : ''}`}>
      <button className="hud-wordmark" onClick={goHome} disabled={busy}>
        <span className="hud-wordmark-kicker">INTERACTIVE PORTFOLIO</span>
        <span className="hud-wordmark-name">HENRY LI</span>
      </button>

      <nav className="hud-nav">
        <button
          className={`hud-nav-btn ${!focusId && (phase === 'system' || phase === 'travel') ? 'is-active' : ''}`}
          onClick={goHome}
          disabled={busy && !focusId}
        >
          Overview
        </button>
        {PLANETS.map((p) => (
          <button
            key={p.id}
            className={`hud-nav-btn ${focusId === p.id ? 'is-active' : ''}`}
            onClick={() => focusPlanet(p.id)}
            disabled={phase === 'travel' && focusId === p.id && !moonId}
          >
            {p.section.title}
          </button>
        ))}
      </nav>

      {hintText && (
        <div className="hud-hint" key={hintText}>
          {hintText}
        </div>
      )}

      <div className="hud-seed">
        SEED {SYSTEM_SEED}
        <button
          className="hud-seed-btn"
          title="Regenerate the solar system with a new seed"
          onClick={() => {
            const url = new URL(window.location.href)
            url.searchParams.delete('seed')
            window.location.href = url.toString()
          }}
        >
          ⟳
        </button>
      </div>
    </div>
  )
}
