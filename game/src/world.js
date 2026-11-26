// Nusantara Skies — the world the plane flies through. One clear job:
// build the route (islands, rings, storm cells, runway, clouds) from a
// seed, and map game units to 3D scene units. Every feature is placed
// once, up front, from the seeded RNG — the flight is the same every
// time for the same seed.
import { CONFIG } from './config.js';
import { makeRng } from './random.js';

// Scene units: 1 nm of route = 10 units along -Z; lateral x -1..1 maps
// to -26..26 units; altitude 0..1 maps to 2..36 units of height.
export const NM_SCALE = 10;
export const LATERAL_SPREAD = 26;
export const ALT_BASE = 2;
export const ALT_SPAN = 20;

export function lateralToX(x) {
  return x * LATERAL_SPREAD;
}

export function altToY(alt) {
  return ALT_BASE + alt * ALT_SPAN;
}

export function nmToZ(atNm, distanceNm) {
  return -(atNm - distanceNm) * NM_SCALE;
}

export function buildWorld(seed) {
  const rng = makeRng(seed);
  const islands = [];
  const rings = [];
  const stormCells = [];
  const clouds = [];

  // Islands: a chain down the whole route, denser in stage 1.
  // v3: palm-DENSE (the refs are forests, not lone trees), faceted
  // rock cliffs on the bigger islands, lighthouses on most towns.
  let d = 4;
  while (d < CONFIG.routeLengthNm - 6) {
    const inStage1 = d < 45;
    const kind = rng.pick(['green', 'green', 'green', 'mountain', 'town']);
    // Focus item 2: no two islands alike — shape varies (round /
    // long / twin-peaked / rocky), and the renderer varies trees,
    // hills and buildings per island from the same seed.
    const shape =
      kind === 'mountain'
        ? rng.pick(['rocky', 'twin'])
        : rng.pick(['round', 'round', 'long', 'twin', 'rocky']);
    islands.push({
      atNm: d,
      x: rng.range(-0.85, 0.85),
      size: rng.range(0.8, 1.6), // relative island radius — v3.1: bigger,
      // the v3 shots made the islands read as pebbles, the refs make
      // them the landscape
      kind,
      shape,
      trees: rng.int(6, 12),
      palms: rng.int(8, 16),
      rocks: rng.int(2, 5),
      cliffs: kind === 'mountain' ? rng.int(2, 3) : rng.int(0, 2),
      lighthouse: kind === 'town' ? rng.chance(0.75) : rng.chance(0.1),
      houses: rng.int(0, 5),
      height: rng.range(2.5, 6.0),
    });
    d += inStage1 ? rng.range(3.5, 6) : rng.range(5, 9);
  }

  // The destination island, big, with the runway on it.
  islands.push({
    atNm: CONFIG.routeLengthNm - 1,
    x: 0,
    size: 2.2,
    kind: 'destination',
    shape: 'round',
    trees: 12,
    palms: 14,
    rocks: 4,
    cliffs: 1,
    lighthouse: true,
    houses: 9,
    height: 2.5,
  });

  // Rings: 6 in stage 1, 4 in the storm, 2 on approach. Each ring has a
  // lateral position and an altitude band the pilot must match.
  let ringNo = 0;
  for (const stage of CONFIG.stages) {
    for (let i = 0; i < stage.rings; i++) {
      ringNo++;
      const atNm = stage.fromNm + ((i + 1) / (stage.rings + 1)) * (stage.toNm - stage.fromNm);
      const fuelRing = ringNo % 4 === 0; // every 4th ring refuels
      rings.push({
        atNm,
        x: rng.range(-0.55, 0.55),
        alt: rng.range(0.3, 0.8),
        radius: 0.26,
        fuel: fuelRing,
        stage: stage.id,
        passed: false,
        missed: false,
      });
    }
  }

  // Storm cells: dark, sparking hazards in stage 2 only.
  for (let i = 0; i < 7; i++) {
    stormCells.push({
      atNm: 48 + i * 5 + rng.range(-1.5, 1.5),
      x: rng.range(-0.7, 0.7),
      alt: rng.range(0.25, 0.85),
      size: rng.range(0.5, 0.8),
    });
  }

  // Ships at sea: small island-hoppers with wakes, plus one big
  // cargo ship with coloured containers near the approach, for life
  // on the water (refs: cargo ship off the cliff airport).
  const ships = [];
  for (let i = 0; i < 3; i++) {
    ships.push({
      atNm: 18 + i * 34 + rng.range(-4, 4),
      x: rng.range(-0.7, 0.7),
      size: rng.range(0.8, 1.2),
      kind: 'hopper',
    });
  }
  ships.push({ atNm: 98 + rng.range(-3, 3), x: rng.range(-0.6, 0.6), size: 1.6, kind: 'cargo' });

  // Hot-air balloons drifting over the islands (refs: green/gold
  // balloons above the cliffs) — pure decoration, seeded, no logic.
  const balloons = [];
  const balloonColors = [0x37d67a, 0xffc94d, 0xff5d5d, 0xff8c2e];
  for (let i = 0; i < 4; i++) {
    balloons.push({
      atNm: 12 + i * 28 + rng.range(-4, 4),
      x: rng.range(-0.75, 0.75),
      alt: rng.range(0.55, 0.9),
      color: balloonColors[i % balloonColors.length],
    });
  }

  // Faceted 3D cloud puffs (chunky white low-poly blobs, refs: the
  // faceted storm cloud and the big soft clouds) — the sprite clouds
  // stay for the far field, these give the sky volume up close.
  const puffs = [];
  for (let i = 0; i < 14; i++) {
    puffs.push({
      atNm: rng.range(0, CONFIG.routeLengthNm),
      x: rng.range(-1, 1),
      y: rng.range(26, 48),
      size: rng.range(4, 9),
    });
  }

  // Decorative clouds in three parallax layers.
  for (let i = 0; i < 36; i++) {
    clouds.push({
      atNm: rng.range(0, CONFIG.routeLengthNm),
      x: rng.range(-1, 1),
      layer: rng.int(0, 2),
      y: rng.range(26, 48),
      size: rng.range(6, 16),
    });
  }

  return { islands, rings, stormCells, ships, balloons, puffs, clouds, seed };
}
