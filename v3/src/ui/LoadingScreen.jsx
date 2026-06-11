import { useEffect, useState } from 'react'
import { useExperience } from '../store/useExperience'
import { SYSTEM_SEED } from '../config/solarSystem'

export default function LoadingScreen() {
  const phase = useExperience((s) => s.phase)
  const progress = useExperience((s) => s.progress)
  const taskLabel = useExperience((s) => s.taskLabel)
  const [gone, setGone] = useState(false)

  const hiding = phase !== 'loading'

  useEffect(() => {
    if (!hiding) return
    const t = setTimeout(() => setGone(true), 900)
    return () => clearTimeout(t)
  }, [hiding])

  if (gone) return null

  const pct = Math.min(100, Math.round(progress * 100))

  return (
    <div className={`loading-screen ${hiding ? 'is-hidden' : ''}`}>
      <div className="loading-stars" aria-hidden />
      <div className="loading-center">
        <div className="loading-kicker">HENRY LI · INTERACTIVE PORTFOLIO</div>
        <div className="loading-pct">
          {pct}
          <span>%</span>
        </div>
        <div className="loading-bar">
          <div className="loading-bar-fill" style={{ width: `${pct}%` }} />
        </div>
        <div className="loading-task">{taskLabel}</div>
      </div>
      <div className="loading-footer">
        <span>PROCEDURALLY GENERATED</span>
        <span>SEED · {SYSTEM_SEED}</span>
      </div>
    </div>
  )
}
