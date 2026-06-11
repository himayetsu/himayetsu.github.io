// Global experience state machine.
//
// phase: loading -> intro -> system <-> travel <-> planet <-> moon
//   - 'travel' is any cinematic camera move; arrive() resolves the destination
//   - focusId / moonId describe where the camera is (or is headed)

import { create } from 'zustand'

export const useExperience = create((set, get) => ({
  phase: 'loading',
  progress: 0,
  taskLabel: 'Initializing',
  assetsReady: false,

  focusId: null,
  moonId: null,
  hoverId: null,
  hoverMoonId: null,
  travelSeq: 0,
  sunMesh: null,

  setProgress: (progress, taskLabel) => set({ progress, taskLabel }),
  setAssetsReady: () => set({ assetsReady: true }),
  setSunMesh: (sunMesh) => set({ sunMesh }),
  setHover: (hoverId) => set({ hoverId }),
  setHoverMoon: (hoverMoonId) => set({ hoverMoonId }),

  beginIntro: () => {
    if (get().phase !== 'loading') return
    set((s) => ({ phase: 'intro', travelSeq: s.travelSeq + 1 }))
  },

  /** Camera director calls this when a cinematic move completes. */
  arrive: () =>
    set((s) => ({
      phase: s.moonId ? 'moon' : s.focusId ? 'planet' : 'system',
    })),

  focusPlanet: (id) =>
    set((s) => {
      if (s.phase === 'planet' && s.focusId === id && !s.moonId) return s
      return {
        phase: 'travel',
        focusId: id,
        moonId: null,
        hoverId: null,
        hoverMoonId: null,
        travelSeq: s.travelSeq + 1,
      }
    }),

  focusMoon: (moonId) =>
    set((s) => ({
      phase: 'travel',
      moonId,
      hoverMoonId: null,
      travelSeq: s.travelSeq + 1,
    })),

  goHome: () =>
    set((s) => ({
      phase: 'travel',
      focusId: null,
      moonId: null,
      hoverId: null,
      hoverMoonId: null,
      travelSeq: s.travelSeq + 1,
    })),

  /** ESC: moon -> planet -> overview */
  back: () => {
    const { moonId, focusId, focusPlanet, goHome, phase } = get()
    if (phase === 'loading' || phase === 'intro') return
    if (moonId) focusPlanet(focusId)
    else if (focusId) goHome()
  },
}))
