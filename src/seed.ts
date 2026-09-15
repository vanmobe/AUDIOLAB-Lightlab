import type { ShowDocument } from './domain'

const adj = Array.from({ length: 12 }, (_, index) => ({
  id: `adj-${index + 1}`, name: `ADJ TriPar ${index + 1}`, profileId: 'adj-mega-tripar-profile-plus', modeId: '4ch', groupId: index < 4 ? 'wash' : 'back',
  patch: { universe: 1, address: 1 + index * 4 }, position: [-5 + (index % 6) * 2, 1.2, index < 6 ? -2.5 : 2.5] as [number, number, number], aim: [0, 1.2, 0] as [number, number, number],
}))
const bars = Array.from({ length: 2 }, (_, index) => ({
  id: `tri-bar-${index + 1}`, name: `Stage TRI bar ${index + 1}`, profileId: 'stairville-stage-tri', modeId: '14ch', groupId: 'back', visualSegments: 4,
  patch: { universe: 1, address: 49 + index * 14 }, position: [-3.8 + index * 7.6, 3.2, -3] as [number, number, number], aim: [0, 1.2, 0] as [number, number, number],
}))
const fronts = Array.from({ length: 4 }, (_, index) => ({
  id: `front-${index + 1}`, name: `Varytec Front ${index + 1}`, profileId: 'varytec-theater-spot-100', modeId: '2ch', groupId: 'front',
  patch: { universe: 1, address: 161 + index * 2 }, position: [-4.5 + index * 3, 4.5, 3] as [number, number, number], aim: [-1.5 + index, 1.2, 0] as [number, number, number],
}))

export const initialShow: ShowDocument = {
  schemaVersion: 1,
  name: 'Nieuwe lichtshow',
  fixtures: [...adj, ...bars, ...fronts, { id: 'hazer-1', name: 'Hz-200 Hazer', profileId: 'stairville-hz-200', modeId: '2ch', groupId: 'effects', patch: { universe: 1, address: 77 }, position: [0, 0, -3], aim: [0, 1, 0] }],
  groups: [
    { id: 'front', name: 'Front spots', intensity: 0.8 }, { id: 'wash', name: 'Wash', intensity: 0.75 },
    { id: 'back', name: 'Back & bars', intensity: 0.8 }, { id: 'effects', name: 'Effects / haze', intensity: 0 },
  ],
  routes: [{ id: 'universe-1', universe: 1, protocol: 'artnet', host: '192.168.0.50', enabled: false }],
  colorProfiles: [
    { id: 'neon', name: 'Neon violet', primary: '#7026ff', secondary: '#146cff', accent: '#10e4ff', white: '#dceaff', intensityLimit: 0.9 },
    { id: 'warm', name: 'Warm amber', primary: '#ff6a00', secondary: '#ff9f1c', accent: '#fff1c1', white: '#fff5df', intensityLimit: 0.85 },
  ],
  programs: [
    { id: 'ambient', name: 'Ambient', effect: 'static', targetGroupIds: ['front', 'wash', 'back'], rateBeats: 1, defaultColorProfileId: 'warm' },
    { id: 'chorus', name: 'Chorus chase', effect: 'chase', targetGroupIds: ['front', 'wash', 'back'], rateBeats: 0.5, defaultColorProfileId: 'neon' },
    { id: 'pulse', name: 'Pulse', effect: 'pulse', targetGroupIds: ['wash', 'back'], rateBeats: 1, defaultColorProfileId: 'neon' },
  ],
  looks: [
    { id: 'warm-static', name: 'Warm static', programId: 'ambient', colorProfileId: 'warm' },
    { id: 'neon-chorus', name: 'Neon chorus', programId: 'chorus', colorProfileId: 'neon' },
    { id: 'neon-pulse', name: 'Neon pulse', programId: 'pulse', colorProfileId: 'neon' },
  ],
  activeLookId: 'warm-static',
  controlSurface: { profileId: 'wing-rack', bindings: [
    { id: 'look-ambient', label: 'Ambient', action: 'look', targetId: 'warm-static' },
    { id: 'look-chorus', label: 'Chorus', action: 'look', targetId: 'neon-chorus' },
    { id: 'blackout', label: 'Blackout', action: 'mode', targetId: 'blackout' },
    { id: 'front-master', label: 'Front master', action: 'group-intensity', targetId: 'front' },
  ] },
  sync: { source: 'direct-audio', audioDeviceName: 'Dante Virtual Soundcard — Backing Track', lightingOffsetMs: 0 },
  camera: { position: [0, 1, 12], target: [0, 1.8, 0], fov: 48 },
}
