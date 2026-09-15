import type { FixtureProfile } from './domain'

export const fixtureProfiles: FixtureProfile[] = [
  {
    id: 'adj-mega-tripar-profile-plus',
    manufacturer: 'ADJ',
    model: 'Mega TriPar Profile Plus',
    kind: 'par',
    modes: [
      {
        id: '4ch',
        name: '4 kanaal RGB-UV',
        channels: 4,
        capabilities: ['dimmer', 'rgb', 'uv'],
        verifiedForLiveOutput: false,
      },
      {
        id: '6ch',
        name: '6 kanaal RGB-UV + strobe',
        channels: 6,
        capabilities: ['dimmer', 'rgb', 'uv', 'strobe'],
        verifiedForLiveOutput: false,
      },
    ],
  },
  {
    id: 'stairville-hz-200',
    manufacturer: 'Stairville',
    model: 'Hz-200 Compact Hazer DMX',
    kind: 'hazer',
    modes: [
      {
        id: '2ch',
        name: '2 kanaal haze + ventilator',
        channels: 2,
        capabilities: ['haze'],
        verifiedForLiveOutput: false,
      },
      // Keep the old footprint for stored patches; expanding it silently can create overlap.
      {
        id: '1ch',
        name: '1 kanaal (oud onjuist profiel)',
        channels: 1,
        capabilities: ['haze'],
        verifiedForLiveOutput: false,
        configurationWarning:
          'De Hz-200 gebruikt twee kanalen: haze en ventilator. Kies de 2-kanaalsmodus en controleer het extra adres voordat je opslaat.',
      },
    ],
  },
  {
    id: 'stairville-stage-tri',
    manufacturer: 'Stairville',
    model: 'Stage TRI LED Bundle Complete',
    kind: 'bar',
    modes: [
      { id: '3ch', name: '3 kanaal RGB', channels: 3, capabilities: ['rgb'], verifiedForLiveOutput: false },
      {
        id: '14ch',
        name: '14 kanaal, vier afzonderlijke heads',
        channels: 14,
        capabilities: ['dimmer', 'rgb', 'strobe'],
        independentHeads: true,
        verifiedForLiveOutput: false,
      },
    ],
  },
  {
    id: 'varytec-theater-spot-100',
    manufacturer: 'Varytec',
    model: 'LED Theater Spot 100 3000K',
    kind: 'theatre-spot',
    // Neutral warm-white display approximation, not a photometric calibration.
    fixedColor: '#fff1d6',
    modes: [
      {
        id: '2ch',
        name: '2 kanaal dimmer + strobe',
        channels: 2,
        capabilities: ['dimmer', 'strobe'],
        verifiedForLiveOutput: false,
      },
    ],
  },
]
