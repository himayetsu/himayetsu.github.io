import { useEffect } from 'react'
import { Canvas } from '@react-three/fiber'
import Scene from './three/Scene'
import Effects from './three/Effects'
import LoadingScreen from './ui/LoadingScreen'
import HUD from './ui/HUD'
import SectionPanel from './ui/SectionPanel'
import MoonDetailCard from './ui/MoonDetailCard'
import { generateAllAssets } from './lib/assets'
import { PLANETS } from './config/solarSystem'
import { useExperience } from './store/useExperience'

export default function App() {
  const assetsReady = useExperience((s) => s.assetsReady)
  const phase = useExperience((s) => s.phase)

  // bake all procedural assets, then mount the canvas
  useEffect(() => {
    const { setProgress, setAssetsReady } = useExperience.getState()
    generateAllAssets(PLANETS, setProgress).then(() => setAssetsReady())
  }, [])

  // ESC walks back out: moon -> planet -> overview
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') useExperience.getState().back()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className="app">
      {assetsReady && (
        <div className={`canvas-wrap ${phase === 'loading' ? '' : 'is-live'}`}>
          <Canvas
            flat
            /* no shadow maps: eclipses are analytic (materials/eclipse.js),
               which saves the 6-face point-light depth render every frame */
            dpr={[1, 2]}
            gl={{ antialias: false, powerPreference: 'high-performance', stencil: false }}
            camera={{ fov: 52, near: 0.5, far: 1500, position: [-250, 175, 360] }}
            onCreated={() => {
              // first frames render behind the fading loading screen,
              // then the intro dolly begins — no hard cut
              setTimeout(() => useExperience.getState().beginIntro(), 700)
            }}
          >
            <Scene />
            <Effects />
          </Canvas>
        </div>
      )}

      <LoadingScreen />
      <HUD />
      <SectionPanel />
      <MoonDetailCard />
    </div>
  )
}
