import { PLANETS } from '../config/solarSystem'
import Starfield from './Starfield'
import Nebulae from './Nebulae'
import Sun from './Sun'
import Planet from './Planet'
import CameraDirector from './CameraDirector'

export default function Scene() {
  return (
    <>
      <color attach="background" args={['#020309']} />
      {/* faint cool fill so night sides never crush to pure black */}
      <ambientLight intensity={0.085} color="#33415c" />

      <Starfield />
      <Nebulae />
      <Sun />

      {PLANETS.map((def) => (
        <Planet key={def.id} def={def} />
      ))}

      <CameraDirector />
    </>
  )
}
