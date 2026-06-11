import { Html } from '@react-three/drei'

/**
 * Minimal callout sign shown when hovering a body. The HTML anchor sits at the
 * body's exact origin; the sign is then offset to the right in *screen space*
 * (pure CSS), so the leader line always starts at the planet's center and the
 * sign never veers or flips regardless of camera orientation.
 */
export function HoloLabel({ title, cta }) {
  return (
    <Html position={[0, 0, 0]} center zIndexRange={[40, 30]} style={{ pointerEvents: 'none' }}>
      <div className="holo-anchor">
        <div className="holo-label">
          <div className="holo-title">{title}</div>
          {cta && <div className="holo-cta">{cta}</div>}
        </div>
      </div>
    </Html>
  )
}

/** Compact chip for moons. */
export function MoonChip({ position, label, sub }) {
  return (
    <Html position={position} center zIndexRange={[40, 30]} style={{ pointerEvents: 'none' }}>
      <div className="moon-chip">
        <div className="moon-chip-label">{label}</div>
        {sub && <div className="moon-chip-sub">{sub}</div>}
      </div>
    </Html>
  )
}
