// Nusantara Skies — tuning constants. One clear job: every number the game
// balances on lives here, so a balance change never touches logic or art.
export const CONFIG = {
  // Canvas / view
  viewDistanceNm: 26, // how far ahead the world is drawn
  horizonFraction: 0.42, // horizon line as a fraction of canvas height

  // Flight model (units: nm, seconds, kts)
  cruiseSpeedKts: 420,
  maxSpeedKts: 540,
  minSpeedKts: 180,
  boostSpeedKts: 560,
  climbRate: 0.22, // altitude units per second (alt 0..1)
  steerRate: 0.9, // lateral units per second (x -1..1)
  nmPerSecondAtCruise: 0.9,

  // Fuel (% per second)
  fuelDrainCruise: 0.22,
  fuelDrainBoost: 0.55,
  fuelRingRefill: 12,

  // Rings and scoring
  ringScore: 500,
  ringComboStep: 100,
  nearMissBonus: 250,
  landingFuelBonusPerPct: 10,
  landingHullBonusPerPct: 5,

  // Hull / storm
  hullMax: 100,
  stormCellDamage: 34,
  stormCellRadius: 0.34,

  // Route: CGK -> DPS, three stages, distances in nm
  routeLengthNm: 120,
  // 3D chase camera (scene units; see world.js for the mapping)
  cameraBack: 12, // camera sits this far behind the plane
  cameraHeight: 1.8, // camera sits this high above the plane
  cameraLookAhead: 34, // camera looks this far ahead of the plane
  fogNear: 90,
  fogFar: 300,
  stages: [
    {
      id: 'islands',
      name: 'STAGE 1 — KEPULAUAN SERIBU',
      fromNm: 0,
      toNm: 45,
      sky: 'day',
      rings: 6,
      briefing: 'Fly through 6 sky rings over the islands.',
    },
    {
      id: 'storm',
      name: 'STAGE 2 — BADAI MERAPI',
      fromNm: 45,
      toNm: 85,
      sky: 'storm',
      rings: 4,
      briefing: 'Thread the storm front. Dodge the lightning cells.',
    },
    {
      id: 'approach',
      name: 'STAGE 3 — FINAL APPROACH',
      fromNm: 85,
      toNm: 120,
      sky: 'sunset',
      rings: 2,
      briefing: 'Line up with the DPS runway and land.',
    },
  ],

  // Palette — one flat-cartoon style for the whole game
  palette: {
    daySkyTop: '#5fb2ef',
    daySkyBottom: '#cfeefb',
    stormSkyTop: '#3a3f5c',
    stormSkyBottom: '#6b6f8e',
    sunsetSkyTop: '#ff9a5c',
    sunsetSkyBottom: '#ffd9a0',
    seaTop: '#2f7fc4',
    seaBottom: '#155a8f',
    islandGreen: '#58b368',
    islandDark: '#3f9e57',
    islandSand: '#f2e2a4',
    runwayGrey: '#5a5f6b',
    ringGold: '#ffd94d',
    ringGlow: '#fff3b0',
    hudPanel: 'rgba(16, 32, 56, 0.78)',
    hudPanelBorder: 'rgba(255, 255, 255, 0.25)',
    hudText: '#ffffff',
    hudAccent: '#ffd94d',
    hudDanger: '#ff5d5d',
    hudGood: '#7dffa8',
  },
};
