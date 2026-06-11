# v3 — Cinematic Solar System Portfolio

A single-page, immersive 3D portfolio. The sun is the hub; each procedurally
generated planet is a portfolio section, and its moons are the individual
entries (roles, projects, schools). Navigation is pure cinematic camera travel
— no routes, no scrolling.

## Run it

```bash
cd v3
npm install
npm run dev
```

Build for production with `npm run build` / `npm run preview`.

## How it works

- **Content** is pulled live from the existing site (`../src/data/projects.js`)
  plus a mirror of the About / Resume / Contact copy in `src/data/content.js`.
  No placeholder text.
- **Procedural worlds**: every run picks a random system seed (pin one with
  `?seed=ANYTHING`). Each planet bakes seamless equirectangular PBR maps
  (albedo / bump / roughness / emissive) on the CPU from seeded simplex noise —
  this baking drives the *real* progress bar on the loading screen. The ⟳
  button in the bottom-right regenerates the whole system.
- **Planet types by distance**: molten world (About) with glowing lava
  fissures, habitable world (Experience) with oceans + drifting clouds, a gas
  giant (Projects) with a live animated shader atmosphere, a ringed ice world
  (Education), and a dark beacon world (Contact) with luminous veins.
- **Camera**: a single director owns the camera. Travel is a gsap-eased
  parameter swept along a curved arc toward a destination that is re-computed
  every frame (planets keep orbiting), with inertial damping, mouse parallax
  and FOV pulls. ESC walks back out (moon → planet → overview).
- **Rendering**: R3F + postprocessing — god rays from the sun, HDR bloom,
  focus-tracking depth of field, lens flares, chromatic aberration, film
  grain, vignette, color grade, SMAA, ACES filmic tone mapping. Real shadows
  (planet eclipses moons), Kepler-scaled orbital speeds, LOD sphere meshes.

## Structure

```
src/
  config/solarSystem.js   seeded system layout (planets, moons, orbits)
  data/content.js         portfolio content bridge
  lib/                    prng / simplex noise / texture baking / registry
  store/useExperience.js  experience state machine (zustand)
  three/                  scene graph: Sun, Planet, Moon, camera, effects
  ui/                     loading screen, HUD, holo labels, panels, cards
```
