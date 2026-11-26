// Nusantara Skies — the 3D scene. One clear job: turn the game state
// into a picture. It owns the Three.js renderer, the sky, the sea, the
// islands, the rings, the storm, the runway and the chase camera. It
// holds no game logic; game.js decides, this file draws.
//
// v2 visual polish: a refined airliner silhouette (tapered extruded
// wings, swept fin, winglets, engines with intakes, nav lights), islands
// with beaches, palms, towns and a lighthouse, a living sea (vertex
// waves, sun glint, foam rings, whitecaps), a storm you can feel (dark
// cloud deck, rain, camera shake, denser fog), and a dressed runway
// (threshold keys, numbers, touchdown marks, edge lights, taxiway,
// terminal, tower). Everything is procedural — no external assets — and
// every animation is a function of the seeded RNG and the simulation
// clock, so the flight stays deterministic.
import * as THREE from 'three';
import { CONFIG } from './config.js';
import { NM_SCALE, LATERAL_SPREAD, ALT_BASE, ALT_SPAN, lateralToX, altToY, nmToZ } from './world.js';
import { makeRng } from './random.js';

const PAL = CONFIG.palette;

function canvasTexture(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const tex = new THREE.CanvasTexture(c);
  return tex;
}

function skyTexture(kind) {
  return canvasTexture(1024, 512, (g, w, h) => {
    const grad = g.createLinearGradient(0, 0, 0, h);
    if (kind === 'day') {
      grad.addColorStop(0, '#2f7fd0');
      grad.addColorStop(0.42, '#5fb2ef');
      grad.addColorStop(0.62, '#a5dcf8');
      grad.addColorStop(0.78, '#e3f5fe');
      grad.addColorStop(0.86, '#fff3cf');
      grad.addColorStop(1, '#ffe9b0');
    } else if (kind === 'storm') {
      grad.addColorStop(0, '#0d0f22');
      grad.addColorStop(0.4, '#232640');
      grad.addColorStop(0.68, '#3a3d5c');
      grad.addColorStop(0.85, '#565a7d');
      grad.addColorStop(1, '#6e6a8e');
    } else {
      grad.addColorStop(0, '#c94f2e');
      grad.addColorStop(0.35, '#f07b45');
      grad.addColorStop(0.58, '#ffb26b');
      grad.addColorStop(0.78, '#ffd9a0');
      grad.addColorStop(0.9, '#ffe9c4');
      grad.addColorStop(1, '#fff3d6');
    }
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
  });
}

function softDiscTexture(inner, outer) {
  return canvasTexture(128, 128, (g) => {
    const grad = g.createRadialGradient(64, 64, 4, 64, 64, 62);
    grad.addColorStop(0, inner);
    grad.addColorStop(1, outer);
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
  });
}

// Cloud puff: white on top, soft grey underneath, so clouds read as
// volumes instead of flat stickers.
function cloudTexture() {
  return canvasTexture(256, 128, (g, w, h) => {
    const grad = g.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, 'rgba(255,255,255,0.98)');
    grad.addColorStop(0.55, 'rgba(255,255,255,0.9)');
    grad.addColorStop(1, 'rgba(203,216,232,0.55)');
    g.fillStyle = grad;
    for (const [cx, cy, r] of [[64, 78, 46], [128, 62, 58], [192, 80, 44], [96, 88, 40], [160, 90, 38]]) {
      g.beginPath();
      g.arc(cx, cy, r, 0, Math.PI * 2);
      g.fill();
    }
  });
}

function seaTexture(seed) {
  const rng = makeRng(seed);
  const tex = canvasTexture(512, 512, (g, w, h) => {
    // Deep-to-shallow gradient across the tile.
    const grad = g.createLinearGradient(0, 0, w, h);
    grad.addColorStop(0, '#1d6aa8');
    grad.addColorStop(0.5, '#2478b8');
    grad.addColorStop(1, '#1a5f97');
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
    // Wave strokes: short arcs and curls, in two tones.
    for (let i = 0; i < 60; i++) {
      const x = rng.range(0, w);
      const y = rng.range(0, h);
      const len = rng.range(14, 52);
      g.strokeStyle = rng.chance(0.5) ? 'rgba(255,255,255,0.14)' : 'rgba(190,225,255,0.12)';
      g.lineWidth = rng.range(1, 3);
      g.beginPath();
      g.moveTo(x, y);
      g.quadraticCurveTo(x + len / 2, y - rng.range(3, 8), x + len, y + rng.range(-2, 2));
      g.stroke();
    }
    // Foam speckles.
    g.fillStyle = 'rgba(255,255,255,0.22)';
    for (let i = 0; i < 90; i++) {
      const x = rng.range(0, w);
      const y = rng.range(0, h);
      g.fillRect(x, y, rng.range(1, 3), rng.range(1, 2));
    }
  });
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(9, 9);
  return tex;
}

// A thin vertical streak, used as the rain-drop sprite.
function rainTexture() {
  return canvasTexture(16, 64, (g, w, h) => {
    const grad = g.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, 'rgba(210,230,255,0)');
    grad.addColorStop(0.5, 'rgba(210,230,255,0.85)');
    grad.addColorStop(1, 'rgba(210,230,255,0)');
    g.fillStyle = grad;
    g.fillRect(6, 0, 4, h);
  });
}

function runwayNumberTexture(text) {
  return canvasTexture(128, 128, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.fillStyle = '#ffffff';
    g.font = '900 84px Arial, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, w / 2, h / 2 + 4);
  });
}

// Tapered wing planform, symmetric in chord so one geometry mirrors
// cleanly to the other side. Shape coords: u = span, v = chord.
function taperedWingGeometry(span, rootChord, tipChord, thickness) {
  const shape = new THREE.Shape();
  shape.moveTo(0, -rootChord / 2);
  shape.lineTo(span, -tipChord / 2);
  shape.lineTo(span, tipChord / 2);
  shape.lineTo(0, rootChord / 2);
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false });
  geo.rotateX(Math.PI / 2); // lay flat: shape y becomes -z (forward)
  return geo;
}

// Swept vertical fin, extruded thin, already rotated into the YZ
// plane (chord fore-aft, height up, thin sideways) and centred on
// x = 0. Shape coords: x = chord, y = height.
function sweptFinGeometry(chord, height, sweep) {
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.lineTo(chord, 0);
  shape.lineTo(chord - sweep, height);
  shape.lineTo(sweep * 0.4, height);
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.14, bevelEnabled: false });
  geo.rotateY(-Math.PI / 2); // chord -> +z (fore-aft), thickness -> x
  geo.translate(0.07, 0, 0); // centre the thickness on x = 0
  return geo;
}

// The aircraft: a refined low-poly airliner. Longer fuselage with a
// proper nose and tail cone, tapered wings with dihedral and winglets,
// engines with dark intakes, a swept blue fin with a gold sun emblem,
// cheatline livery, and red/green/white nav lights. Big and readable
// from the chase camera, still built only from primitives.
function buildPlane() {
  const group = new THREE.Group();
  const white = new THREE.MeshPhongMaterial({ color: 0xf5f8fb, shininess: 70, specular: 0x8fa8c0 });
  const blue = new THREE.MeshPhongMaterial({ color: 0x1e4f9e, shininess: 60, specular: 0x6f8fc0 });
  const gold = new THREE.MeshPhongMaterial({ color: 0xffc94d, shininess: 90, specular: 0xffe9a0 });
  const dark = new THREE.MeshPhongMaterial({ color: 0x1d2733, shininess: 30 });
  const grey = new THREE.MeshPhongMaterial({ color: 0x7e8b98, shininess: 80, specular: 0xaeb9c4 });
  const glass = new THREE.MeshPhongMaterial({ color: 0x0f1c2c, shininess: 120, specular: 0xbfd9ff });

  // Fuselage: slim cylinder, tapered nose, tail cone, APU dot.
  const fuselage = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.56, 6.4, 16), white);
  fuselage.rotation.x = Math.PI / 2;
  group.add(fuselage);

  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.62, 1.9, 16), white);
  nose.rotation.x = -Math.PI / 2;
  nose.position.z = -4.1;
  group.add(nose);

  const tailCone = new THREE.Mesh(new THREE.ConeGeometry(0.56, 1.6, 16), white);
  tailCone.rotation.x = Math.PI / 2;
  tailCone.position.z = 3.9;
  group.add(tailCone);

  const apu = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.1, 10), dark);
  apu.rotation.x = Math.PI / 2;
  apu.position.z = 4.72;
  group.add(apu);

  // Belly fairing under the wing box.
  const belly = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.34, 3.4), white);
  belly.position.set(0, -0.55, 0.2);
  group.add(belly);

  // Cheatline: blue band + thin gold pinstripe along the fuselage.
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(1.26, 0.2, 5.2), blue);
  stripe.position.set(0, 0.08, -0.2);
  group.add(stripe);
  const pinstripe = new THREE.Mesh(new THREE.BoxGeometry(1.27, 0.06, 5.2), gold);
  pinstripe.position.set(0, -0.06, -0.2);
  group.add(pinstripe);

  // Window strips, both sides, plus cockpit windows up front.
  for (const side of [-1, 1]) {
    const win = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.16, 3.8), glass);
    win.position.set(side * 0.62, 0.26, -0.3);
    group.add(win);
    const cockpit = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.2, 0.7), glass);
    cockpit.position.set(side * 0.58, 0.3, -3.4);
    cockpit.rotation.y = side * 0.25;
    group.add(cockpit);
  }

  // Main wings: tapered, slight dihedral, blue tips, winglets.
  // The planform is symmetric in chord, so the left wing mirrors
  // with a half-turn only — no negative scale (that would put it
  // back on the right side).
  const wingGeo = taperedWingGeometry(5.0, 2.1, 1.15, 0.16);
  const wingMat = new THREE.MeshPhongMaterial({ color: 0xe9eff5, shininess: 70, specular: 0x8fa8c0 });
  for (const side of [-1, 1]) {
    const wing = new THREE.Mesh(wingGeo, wingMat);
    wing.position.set(0, -0.08, 0.35);
    wing.rotation.z = side * 0.05;
    if (side < 0) wing.rotation.y = Math.PI;
    group.add(wing);
    // Blue trailing-edge strip so the wing reads against a bright sky.
    // It follows the trailing edge sweep (root z 1.4 -> tip z 0.93).
    const edge = new THREE.Mesh(new THREE.BoxGeometry(4.7, 0.05, 0.22), blue);
    edge.position.set(side * 2.45, -0.1, 1.16);
    edge.rotation.z = side * 0.05;
    edge.rotation.y = side * 0.096;
    group.add(edge);
    // Winglet: small swept fin at the tip, blue, chord fore-aft.
    const winglet = new THREE.Mesh(sweptFinGeometry(0.7, 0.65, 0.28), blue);
    winglet.position.set(side * 4.95, -0.05, 0.45);
    winglet.rotation.z = side * -0.1;
    group.add(winglet);
    // Engine: nacelle + dark intake + blue ring, on a pylon.
    const pylon = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.5, 1.0), white);
    pylon.position.set(side * 2.2, -0.32, 0.15);
    group.add(pylon);
    const engine = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.3, 1.3, 12), white);
    engine.rotation.x = Math.PI / 2;
    engine.position.set(side * 2.2, -0.55, 0.15);
    group.add(engine);
    const intakeRing = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.06, 8, 16), blue);
    intakeRing.position.set(side * 2.2, -0.55, -0.52);
    group.add(intakeRing);
    const intake = new THREE.Mesh(new THREE.CircleGeometry(0.3, 12), dark);
    intake.position.set(side * 2.2, -0.55, -0.5);
    intake.rotation.y = Math.PI;
    group.add(intake);
    // Nav light on the wingtip.
    const navMat = new THREE.MeshBasicMaterial({ color: side < 0 ? 0xff4d4d : 0x37d67a });
    const nav = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 6), navMat);
    nav.position.set(side * 5.0, -0.02, 0.9);
    group.add(nav);
  }

  // Tailplane: smaller tapered wings at the tail, slight dihedral.
  const tailGeo = taperedWingGeometry(1.9, 1.1, 0.6, 0.12);
  for (const side of [-1, 1]) {
    const tp = new THREE.Mesh(tailGeo, wingMat);
    tp.position.set(0, 0.18, 3.6);
    tp.rotation.z = side * 0.08;
    if (side < 0) tp.rotation.y = Math.PI;
    group.add(tp);
  }

  // Fin: swept, blue, with a gold sun emblem on both faces. The
  // geometry is already in the YZ plane, so the fin is a thin swept
  // blade fore-aft — never a wall across the frame.
  const fin = new THREE.Mesh(sweptFinGeometry(1.9, 1.9, 0.9), blue);
  fin.position.set(0, 0.3, 2.9);
  group.add(fin);
  for (const side of [-1, 1]) {
    const emblem = new THREE.Mesh(new THREE.CircleGeometry(0.3, 20), gold);
    emblem.position.set(side * 0.085, 1.1, 3.75);
    emblem.rotation.y = side * Math.PI / 2;
    group.add(emblem);
    const emblemDot = new THREE.Mesh(new THREE.CircleGeometry(0.14, 12), blue);
    emblemDot.position.set(side * 0.088, 1.1, 3.75);
    emblemDot.rotation.y = side * Math.PI / 2;
    group.add(emblemDot);
  }
  // White tail nav light.
  const tailLight = new THREE.Mesh(
    new THREE.SphereGeometry(0.09, 8, 6),
    new THREE.MeshBasicMaterial({ color: 0xffffff }),
  );
  tailLight.position.set(0, 0.35, 4.75);
  group.add(tailLight);

  return group;
}

// One palm: leaning trunk + a flat canopy + fronds.
function buildPalm(rng, mats) {
  const palm = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.14, 1.6, 6), mats.trunk);
  trunk.position.y = 0.8;
  trunk.rotation.z = rng.range(-0.18, 0.18);
  palm.add(trunk);
  const canopy = new THREE.Mesh(new THREE.SphereGeometry(0.85, 8, 6), mats.palm);
  canopy.scale.set(1, 0.45, 1);
  canopy.position.y = 1.7;
  palm.add(canopy);
  for (let i = 0; i < 3; i++) {
    const frond = new THREE.Mesh(new THREE.ConeGeometry(0.22, 1.1, 5), mats.palmDark);
    const a = (i / 3) * Math.PI * 2 + rng.range(0, 0.8);
    frond.position.set(Math.cos(a) * 0.55, 1.55, Math.sin(a) * 0.55);
    frond.rotation.z = Math.cos(a) * 1.1;
    frond.rotation.x = -Math.sin(a) * 1.1;
    palm.add(frond);
  }
  return palm;
}

// One island: foam ring on the water, sand beach, rocks at the
// waterline, two or three hills in varied greens, palm clusters, a
// little town with a road, and sometimes a lighthouse. No more green
// blobs — each island reads as a place.
function buildIsland(feature, rng) {
  const group = new THREE.Group();
  const r = 8 * feature.size;
  const mats = {
    sand: new THREE.MeshLambertMaterial({ color: 0xf2e2a4 }),
    foam: new THREE.MeshBasicMaterial({ color: 0xbfeef2, transparent: true, opacity: 0.45 }),
    rock: new THREE.MeshLambertMaterial({ color: 0x8d9aa5 }),
    hill: new THREE.MeshLambertMaterial({ color: 0x58b368 }),
    hill2: new THREE.MeshLambertMaterial({ color: 0x4da85f }),
    hill3: new THREE.MeshLambertMaterial({ color: 0x6cc078 }),
    mountain: new THREE.MeshLambertMaterial({ color: 0x7a6a58 }),
    snow: new THREE.MeshLambertMaterial({ color: 0xffffff }),
    trunk: new THREE.MeshLambertMaterial({ color: 0x8a6b46 }),
    palm: new THREE.MeshLambertMaterial({ color: 0x2f8f4e }),
    palmDark: new THREE.MeshLambertMaterial({ color: 0x1f6b38 }),
    pine: new THREE.MeshLambertMaterial({ color: 0x2f7d46 }),
    wall: new THREE.MeshLambertMaterial({ color: 0xfff6e0 }),
    wall2: new THREE.MeshLambertMaterial({ color: 0xffe9c4 }),
    roof: new THREE.MeshLambertMaterial({ color: 0xd94f3d }),
    roof2: new THREE.MeshLambertMaterial({ color: 0x3d7ea8 }),
    road: new THREE.MeshLambertMaterial({ color: 0x6b6f78 }),
  };

  // Shallow-water foam ring, then the sand disc.
  const foam = new THREE.Mesh(new THREE.RingGeometry(r * 1.02, r * 1.5, 24), mats.foam);
  foam.rotation.x = -Math.PI / 2;
  foam.position.y = 0.12;
  group.add(foam);
  const sand = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.08, 0.7, 20), mats.sand);
  sand.position.y = 0.35;
  group.add(sand);

  // Rocks at the waterline.
  for (let i = 0; i < feature.rocks; i++) {
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(rng.range(0.5, 1.1), 0), mats.rock);
    const a = rng.range(0, Math.PI * 2);
    rock.position.set(Math.cos(a) * r * rng.range(0.85, 1.05), 0.5, Math.sin(a) * r * rng.range(0.85, 1.05));
    rock.rotation.set(rng.range(0, 3), rng.range(0, 3), 0);
    group.add(rock);
  }

  // Hills: two or three bumps in varied greens, or a mountain.
  const hillMats = [mats.hill, mats.hill2, mats.hill3];
  if (feature.kind === 'mountain') {
    const mountain = new THREE.Mesh(new THREE.ConeGeometry(r * 0.72, feature.height * 2.4, 10), mats.mountain);
    mountain.position.y = 0.7 + feature.height * 1.1;
    group.add(mountain);
    const snow = new THREE.Mesh(
      new THREE.ConeGeometry(r * 0.22, feature.height * 0.7, 10),
      mats.snow,
    );
    snow.position.y = 0.7 + feature.height * 2.0;
    group.add(snow);
    const skirt = new THREE.Mesh(new THREE.SphereGeometry(r * 0.8, 12, 8), mats.hill2);
    skirt.scale.y = 0.25;
    skirt.position.y = 0.7;
    group.add(skirt);
  } else {
    const bumps = feature.kind === 'destination' ? 3 : 2;
    for (let i = 0; i < bumps; i++) {
      const hill = new THREE.Mesh(new THREE.SphereGeometry(r * rng.range(0.42, 0.6), 12, 8), hillMats[i % 3]);
      hill.scale.y = 0.3 + feature.height * 0.06;
      hill.position.set(rng.range(-r * 0.3, r * 0.3), 0.7, rng.range(-r * 0.3, r * 0.3));
      group.add(hill);
    }
  }

  // Palm clusters.
  for (let i = 0; i < feature.palms; i++) {
    const palm = buildPalm(rng, mats);
    const a = rng.range(0, Math.PI * 2);
    const rr = rng.range(0, r * 0.6);
    palm.position.set(Math.cos(a) * rr, 0.7, Math.sin(a) * rr);
    palm.scale.setScalar(rng.range(0.8, 1.25));
    group.add(palm);
  }
  // A few pines on the higher ground.
  for (let i = 0; i < feature.trees; i++) {
    const tree = new THREE.Mesh(new THREE.ConeGeometry(0.55, 1.9, 6), mats.pine);
    const a = rng.range(0, Math.PI * 2);
    const rr = rng.range(0, r * 0.5);
    tree.position.set(Math.cos(a) * rr, 1.6 + feature.height * 0.12, Math.sin(a) * rr);
    group.add(tree);
  }

  // Town: houses clustered along a dirt road, plus a lighthouse on
  // some town islands.
  if (feature.houses > 0) {
    const road = new THREE.Mesh(new THREE.BoxGeometry(r * 1.3, 0.06, 1.4), mats.road);
    road.position.set(0, 0.72, r * 0.1);
    road.rotation.y = rng.range(0, Math.PI);
    group.add(road);
  }
  for (let i = 0; i < feature.houses; i++) {
    const house = new THREE.Group();
    const walls = new THREE.Mesh(
      new THREE.BoxGeometry(0.9, 0.6, 0.9),
      i % 2 ? mats.wall : mats.wall2,
    );
    walls.position.y = 0.3;
    const roof = new THREE.Mesh(new THREE.ConeGeometry(0.75, 0.55, 4), i % 3 ? mats.roof : mats.roof2);
    roof.position.y = 0.88;
    roof.rotation.y = Math.PI / 4;
    house.add(walls, roof);
    const a = rng.range(0, Math.PI * 2);
    const rr = rng.range(r * 0.25, r * 0.65);
    house.position.set(Math.cos(a) * rr, 0.7, Math.sin(a) * rr);
    house.rotation.y = rng.range(0, Math.PI);
    group.add(house);
  }
  if (feature.lighthouse) {
    const light = new THREE.Group();
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.7, 4.2, 10), mats.wall);
    shaft.position.y = 2.1;
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.56, 0.56, 0.7, 10), mats.roof);
    band.position.y = 2.6;
    const lamp = new THREE.Mesh(
      new THREE.SphereGeometry(0.45, 10, 8),
      new THREE.MeshBasicMaterial({ color: 0xfff2b0 }),
    );
    lamp.position.y = 4.5;
    light.add(shaft, band, lamp);
    light.position.set(r * 0.55, 0.7, -r * 0.4);
    group.add(light);
  }

  group.position.set(lateralToX(feature.x), 0, 0);
  return group;
}

function buildRing(feature) {
  const group = new THREE.Group();
  const color = feature.fuel ? 0x37d67a : 0xffd94d;
  const mat = new THREE.MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: 0.55,
    roughness: 0.35,
    transparent: true,
  });
  const torus = new THREE.Mesh(new THREE.TorusGeometry(5.2, 0.45, 10, 32), mat);
  group.add(torus);
  const glow = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: softDiscTexture('rgba(255,243,176,0.85)', 'rgba(255,243,176,0)'),
      transparent: true,
      depthWrite: false,
    }),
  );
  glow.scale.set(13, 13, 1);
  group.add(glow);
  group.userData.torus = torus;
  return group;
}

// A storm cell: a big dark anvil cloud with a hot core, a jagged bolt
// and a flash glow. Bigger and meaner than v1 — the storm has to feel
// dangerous from a distance.
function buildStormCell(feature, rng) {
  const group = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial({ color: 0x353a5e });
  const matDark = new THREE.MeshLambertMaterial({ color: 0x232640 });
  for (let i = 0; i < 5; i++) {
    const blob = new THREE.Mesh(new THREE.IcosahedronGeometry(3.3 * feature.size, 0), i % 2 ? mat : matDark);
    blob.position.set(rng.range(-3.5, 3.5), rng.range(-1.5, 2.5), rng.range(-3, 3));
    blob.scale.y = 0.62;
    group.add(blob);
  }
  // Hot core: a red-orange glow deep inside the cloud.
  const core = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: softDiscTexture('rgba(255,120,60,0.9)', 'rgba(255,120,60,0)'),
      transparent: true,
      depthWrite: false,
      opacity: 0.7,
    }),
  );
  core.scale.set(9, 9, 1);
  group.add(core);
  // Lightning bolt: a jagged line, hidden until the flash, plus a glow
  // sprite at its middle so the strike reads even at 1px line width.
  const points = [];
  let x = 0;
  let y = 3;
  for (let i = 0; i < 7; i++) {
    points.push(new THREE.Vector3(x, y, 0));
    x += rng.range(-1.6, 1.6);
    y -= rng.range(1.6, 2.6);
  }
  const bolt = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(points),
    new THREE.LineBasicMaterial({ color: 0xe8f4ff, transparent: true, opacity: 0 }),
  );
  bolt.position.y = -1;
  group.add(bolt);
  const boltGlow = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: softDiscTexture('rgba(220,235,255,0.95)', 'rgba(220,235,255,0)'),
      transparent: true,
      depthWrite: false,
      opacity: 0,
    }),
  );
  boltGlow.scale.set(10, 10, 1);
  boltGlow.position.y = -6;
  group.add(boltGlow);
  group.userData.bolt = bolt;
  group.userData.boltGlow = boltGlow;
  return group;
}

// A small ship with a white wake, for life on the water.
function buildShip(feature) {
  const group = new THREE.Group();
  const hull = new THREE.Mesh(
    new THREE.BoxGeometry(2.2, 0.7, 6),
    new THREE.MeshLambertMaterial({ color: 0xe8edf3 }),
  );
  hull.position.y = 0.35;
  group.add(hull);
  const cabin = new THREE.Mesh(
    new THREE.BoxGeometry(1.4, 0.8, 2),
    new THREE.MeshLambertMaterial({ color: 0x2b6cb0 }),
  );
  cabin.position.set(0, 1.1, 0.6);
  group.add(cabin);
  const wake = new THREE.Mesh(
    new THREE.PlaneGeometry(3.2, 9),
    new THREE.MeshBasicMaterial({ color: 0xdff4ff, transparent: true, opacity: 0.5 }),
  );
  wake.rotation.x = -Math.PI / 2;
  wake.position.set(0, 0.08, 4.5);
  group.add(wake);
  group.position.set(lateralToX(feature.x), 0, 0);
  return group;
}

export function createScene(canvas, seed) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xbfe3f7, CONFIG.fogNear, CONFIG.fogFar);

  const camera = new THREE.PerspectiveCamera(62, 1, 0.1, 1200);

  const hemi = new THREE.HemisphereLight(0xd6ecff, 0x2e6b8a, 1.35);
  scene.add(hemi);
  const sunLight = new THREE.DirectionalLight(0xfff2d0, 1.75);
  sunLight.position.set(40, 80, -60);
  scene.add(sunLight);
  // Fill light from behind the camera so the plane's tail faces read.
  const fillLight = new THREE.DirectionalLight(0xdceeff, 0.7);
  fillLight.position.set(-20, 30, 90);
  scene.add(fillLight);
  // Warm bounce from below-front, so the belly is never dead black.
  const bounce = new THREE.DirectionalLight(0xffe0b0, 0.3);
  bounce.position.set(0, -20, -40);
  scene.add(bounce);

  // Sky dome: one gradient texture per stage, swapped as stages change.
  const skyTextures = {
    day: skyTexture('day'),
    storm: skyTexture('storm'),
    sunset: skyTexture('sunset'),
  };
  const skyMat = new THREE.MeshBasicMaterial({ map: skyTextures.day, side: THREE.BackSide, fog: false });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(650, 24, 16), skyMat);
  scene.add(sky);

  // Sun glow sprite, repositioned per stage.
  const sunSprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: softDiscTexture('rgba(255,246,200,1)', 'rgba(255,246,200,0)'),
      transparent: true,
      depthWrite: false,
      fog: false,
    }),
  );
  sunSprite.scale.set(72, 72, 1);
  scene.add(sunSprite);

  // Sea: a segmented plane whose vertices ride deterministic sine
  // waves, with a specular sheen for sun glint. The waves are a
  // function of world position and the sim clock, so they never jump.
  const seaGeo = new THREE.PlaneGeometry(1000, 1000, 40, 40);
  const seaBase = seaGeo.attributes.position.array.slice();
  const sea = new THREE.Mesh(
    seaGeo,
    new THREE.MeshPhongMaterial({ map: seaTexture(seed), shininess: 110, specular: 0x9fc8ee }),
  );
  sea.rotation.x = -Math.PI / 2;
  sea.position.y = 0;
  scene.add(sea);

  function waveHeight(wx, wz, t) {
    return (
      0.26 * Math.sin(wx * 0.08 + t * 0.9) +
      0.2 * Math.sin(wz * 0.06 - t * 0.7) +
      0.14 * Math.sin((wx + wz) * 0.045 + t * 1.3)
    );
  }

  // Clouds: soft two-tone sprites at fixed world spots. In the storm
  // stage they go dark grey so the sky stays menacing, never white.
  const cloudTex = cloudTexture();
  const cloudSprites = [];

  // Storm deck: big dark cloud sprites over the stage-2 band, faded
  // in only while the storm stage is live.
  const stormCloudMat = new THREE.SpriteMaterial({
    map: cloudTex,
    color: 0x3a3d5e,
    transparent: true,
    depthWrite: false,
    opacity: 0,
  });
  const stormClouds = [];

  // Horizon cloud bank: huge flat puffs that ride with the camera.
  const bankMat = new THREE.SpriteMaterial({
    map: cloudTex,
    transparent: true,
    depthWrite: false,
    opacity: 0.45,
  });
  const bankSprites = [];
  for (let i = 0; i < 5; i++) {
    const sprite = new THREE.Sprite(bankMat);
    sprite.scale.set(150, 20, 1);
    scene.add(sprite);
    bankSprites.push(sprite);
  }

  // Rain: 700 streak sprites in a box around the camera, falling with
  // the sim clock. Visible only in the storm stage.
  const RAIN_COUNT = 700;
  const rainBase = new Float32Array(RAIN_COUNT * 3);
  const rainRng = makeRng(seed + 913);
  for (let i = 0; i < RAIN_COUNT; i++) {
    rainBase[i * 3] = rainRng.range(-42, 42);
    rainBase[i * 3 + 1] = rainRng.range(0, 46);
    rainBase[i * 3 + 2] = rainRng.range(-70, 14);
  }
  const rainGeo = new THREE.BufferGeometry();
  rainGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(RAIN_COUNT * 3), 3));
  const rainMat = new THREE.PointsMaterial({
    map: rainTexture(),
    size: 2.2,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    color: 0xcfe4ff,
    sizeAttenuation: true,
  });
  const rain = new THREE.Points(rainGeo, rainMat);
  scene.add(rain);

  const plane = buildPlane();
  plane.scale.setScalar(1.35);
  scene.add(plane);

  // Soft blob shadow on the sea, right under the plane: grounds it in
  // the air instead of floating over a flat picture.
  const blobShadow = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: softDiscTexture('rgba(8,30,50,0.55)', 'rgba(8,30,50,0)'),
      transparent: true,
      depthWrite: false,
      opacity: 0.4,
    }),
  );
  blobShadow.scale.set(11, 4.5, 1);
  scene.add(blobShadow);

  // Runway group, built once, placed on the destination island.
  const runway = new THREE.Group();
  {
    // Grass apron under the whole airport.
    const grass = new THREE.Mesh(
      new THREE.CylinderGeometry(30, 30, 0.5, 24),
      new THREE.MeshLambertMaterial({ color: 0x4da85f }),
    );
    grass.position.y = 0.55;
    grass.scale.z = 1.5;
    runway.add(grass);
    // The strip.
    const strip = new THREE.Mesh(
      new THREE.BoxGeometry(7, 0.3, 64),
      new THREE.MeshLambertMaterial({ color: 0x565b66 }),
    );
    strip.position.y = 0.85;
    runway.add(strip);
    const dashMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
    // Centreline dashes.
    for (let i = 0; i < 9; i++) {
      const dash = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.06, 3.2), dashMat);
      dash.position.set(0, 1.02, -26 + i * 6.5);
      runway.add(dash);
    }
    // Threshold piano keys at both ends.
    for (const end of [-1, 1]) {
      for (let k = -1.5; k <= 1.5; k++) {
        const key = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.06, 4.5), dashMat);
        key.position.set(k * 1.6, 1.02, end * 29.5);
        runway.add(key);
      }
    }
    // Runway numbers: 09 on the near end, 27 on the far end.
    for (const [text, z, rot] of [['09', -24, 0], ['27', 24, Math.PI]]) {
      const num = new THREE.Mesh(
        new THREE.PlaneGeometry(5, 5),
        new THREE.MeshBasicMaterial({ map: runwayNumberTexture(text), transparent: true }),
      );
      num.rotation.x = -Math.PI / 2;
      num.rotation.z = rot;
      num.position.set(0, 1.03, z);
      runway.add(num);
    }
    // Touchdown-zone bars.
    for (const z of [-18, -12, 12, 18]) {
      for (const side of [-1, 1]) {
        const bar = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.06, 2.4), dashMat);
        bar.position.set(side * 1.9, 1.02, z);
        runway.add(bar);
      }
    }
    // Edge lights down both sides, threshold green / end red.
    const edgeMat = new THREE.MeshBasicMaterial({ color: 0xfff6c8 });
    const greenMat = new THREE.MeshBasicMaterial({ color: 0x37d67a });
    const redMat = new THREE.MeshBasicMaterial({ color: 0xff5d5d });
    for (const side of [-1, 1]) {
      for (let i = 0; i <= 10; i++) {
        const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 6), edgeMat);
        lamp.position.set(side * 3.9, 1.1, -30 + i * 6);
        runway.add(lamp);
      }
    }
    for (const side of [-1, 1]) {
      const g = new THREE.Mesh(new THREE.SphereGeometry(0.32, 8, 6), greenMat);
      g.position.set(side * 3.9, 1.1, -31.5);
      runway.add(g);
      const r = new THREE.Mesh(new THREE.SphereGeometry(0.32, 8, 6), redMat);
      r.position.set(side * 3.9, 1.1, 31.5);
      runway.add(r);
    }
    // Approach light bar before the threshold.
    for (let i = 0; i < 5; i++) {
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 6), edgeMat);
      lamp.position.set(0, 1.1, -36 - i * 4);
      runway.add(lamp);
    }
    // PAPI: two red, two white beside the runway.
    const papiRed = new THREE.MeshBasicMaterial({ color: 0xff5d5d });
    const papiWhite = new THREE.MeshBasicMaterial({ color: 0xffffff });
    for (let i = 0; i < 4; i++) {
      const box = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.7, 0.7), i < 2 ? papiRed : papiWhite);
      box.position.set(-6.2, 1.2, -10 + i * 1.6);
      runway.add(box);
    }
    // Taxiway + connector + apron.
    const taxiMat = new THREE.MeshLambertMaterial({ color: 0x6a6f7a });
    const taxiway = new THREE.Mesh(new THREE.BoxGeometry(4.5, 0.26, 52), taxiMat);
    taxiway.position.set(11, 0.82, 0);
    runway.add(taxiway);
    const connector = new THREE.Mesh(new THREE.BoxGeometry(9, 0.26, 4), taxiMat);
    connector.position.set(6.5, 0.82, 10);
    runway.add(connector);
    const apron = new THREE.Mesh(
      new THREE.BoxGeometry(18, 0.26, 14),
      new THREE.MeshLambertMaterial({ color: 0x7d838e }),
    );
    apron.position.set(20, 0.82, 8);
    runway.add(apron);
    // Terminal: glass front, roof, second block, jet bridge.
    const terminal = new THREE.Mesh(
      new THREE.BoxGeometry(16, 4, 7),
      new THREE.MeshLambertMaterial({ color: 0xdfe6ee }),
    );
    terminal.position.set(22, 2.8, 8);
    runway.add(terminal);
    const glassFront = new THREE.Mesh(
      new THREE.BoxGeometry(15, 1.6, 0.2),
      new THREE.MeshPhongMaterial({ color: 0x1c3a5c, shininess: 120, specular: 0xbfd9ff }),
    );
    glassFront.position.set(22, 3.2, 4.4);
    runway.add(glassFront);
    const roof = new THREE.Mesh(
      new THREE.BoxGeometry(17, 0.5, 8),
      new THREE.MeshLambertMaterial({ color: 0x2b6cb0 }),
    );
    roof.position.set(22, 5.0, 8);
    runway.add(roof);
    const block2 = new THREE.Mesh(
      new THREE.BoxGeometry(8, 3, 6),
      new THREE.MeshLambertMaterial({ color: 0xe8dcc0 }),
    );
    block2.position.set(20, 2.3, 18);
    runway.add(block2);
    const bridge = new THREE.Mesh(
      new THREE.BoxGeometry(7, 1.2, 1.6),
      new THREE.MeshLambertMaterial({ color: 0xcfd8e2 }),
    );
    bridge.position.set(15, 2.4, 8);
    runway.add(bridge);
    // Control tower: shaft, glass cab, antenna.
    const tower = new THREE.Mesh(
      new THREE.CylinderGeometry(1.1, 1.5, 9, 8),
      new THREE.MeshLambertMaterial({ color: 0xe8edf3 }),
    );
    tower.position.set(11, 5.3, -6);
    runway.add(tower);
    const towerTop = new THREE.Mesh(
      new THREE.CylinderGeometry(1.9, 1.9, 1.8, 8),
      new THREE.MeshPhongMaterial({ color: 0x16324e, shininess: 120, specular: 0xbfd9ff }),
    );
    towerTop.position.set(11, 10.4, -6);
    runway.add(towerTop);
    const antenna = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.08, 2.4, 6),
      new THREE.MeshLambertMaterial({ color: 0x333333 }),
    );
    antenna.position.set(11, 12.4, -6);
    runway.add(antenna);
    const antennaTip = new THREE.Mesh(
      new THREE.SphereGeometry(0.18, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0xff5d5d }),
    );
    antennaTip.position.set(11, 13.6, -6);
    runway.add(antennaTip);
  }
  runway.position.set(0, 0.8, -((CONFIG.routeLengthNm - 1) * NM_SCALE));
  scene.add(runway);

  const api = {
    renderer,
    scene,
    camera,
    plane,
    runway,
    islands: [],
    rings: [],
    stormCells: [],
    ships: [],
    clouds: cloudSprites,
    flashLight: sunLight,
    skyTextures,
    skyMat,
    sunSprite,
    sea,
    fog: scene.fog,

    buildWorldMeshes(world) {
      const rng = makeRng(world.seed + 77);
      for (const feature of world.islands) {
        const mesh = buildIsland(feature, rng);
        mesh.position.z = nmToZ(feature.atNm, 0);
        scene.add(mesh);
        this.islands.push({ feature, mesh });
      }
      for (const feature of world.rings) {
        const mesh = buildRing(feature);
        mesh.position.set(lateralToX(feature.x), altToY(feature.alt), nmToZ(feature.atNm, 0));
        scene.add(mesh);
        this.rings.push({ feature, mesh });
      }
      for (const feature of world.stormCells) {
        const mesh = buildStormCell(feature, rng);
        mesh.position.set(lateralToX(feature.x), altToY(feature.alt), nmToZ(feature.atNm, 0));
        scene.add(mesh);
        this.stormCells.push({ feature, mesh });
      }
      for (const feature of world.ships || []) {
        const mesh = buildShip(feature);
        mesh.position.z = nmToZ(feature.atNm, 0);
        scene.add(mesh);
        this.ships.push({ feature, mesh });
      }
      for (const feature of world.clouds) {
        const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: cloudTex, transparent: true, depthWrite: false, opacity: 0.85 }));
        sprite.position.set(lateralToX(feature.x), feature.y, nmToZ(feature.atNm, 0));
        sprite.scale.set(feature.size * 7.5, feature.size * 3.5, 1);
        sprite.material.opacity = 0.55 + feature.layer * 0.12;
        scene.add(sprite);
        cloudSprites.push({ feature, sprite });
      }
      // Storm deck: big dark anvils parked over the stage-2 band.
      for (let i = 0; i < 10; i++) {
        const sprite = new THREE.Sprite(stormCloudMat.clone());
        sprite.position.set(rng.range(-30, 30), rng.range(26, 48), 0);
        sprite.scale.set(rng.range(38, 66), rng.range(14, 22), 1);
        sprite.userData.atNm = 46 + i * 4.2 + rng.range(-1, 1);
        scene.add(sprite);
        stormClouds.push(sprite);
      }
      // Whitecaps: foam flecks on the swell, sliding with the route.
      for (let i = 0; i < 42; i++) {
        const sprite = new THREE.Sprite(
          new THREE.SpriteMaterial({
            map: softDiscTexture('rgba(255,255,255,0.7)', 'rgba(255,255,255,0)'),
            transparent: true,
            depthWrite: false,
            opacity: 0.5,
          }),
        );
        sprite.scale.set(rng.range(3, 7), rng.range(1.2, 2.4), 1);
        sprite.userData.atNm = rng.range(0, CONFIG.routeLengthNm);
        sprite.userData.x = rng.range(-1, 1);
        sprite.userData.phase = rng.range(0, Math.PI * 2);
        scene.add(sprite);
        this.whitecaps = this.whitecaps || [];
        this.whitecaps.push(sprite);
      }
    },

    resize(w, h) {
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    },

    // Per-frame: move the world to match the game state.
    update(state, dt, timeSec) {
      const p = state.plane;
      const dist = state.distanceNm;
      const stage = CONFIG.stages[state.stageIndex] || CONFIG.stages[0];
      const stormFactor = stage.sky === 'storm' ? 1 : 0;

      // Plane pose: bank on steer, pitch on climb.
      plane.position.set(lateralToX(p.x), altToY(p.alt), 0);
      const steer = (state.lastSteer || 0);
      plane.rotation.z = -steer * 0.45;
      plane.rotation.x = (state.lastClimb || 0) * -0.12;
      plane.rotation.y = -steer * 0.1;

      // Chase camera: tight behind the plane, looking far ahead and slightly down.
      const camX = lateralToX(p.x) * 0.85;
      const camY = altToY(p.alt) + CONFIG.cameraHeight;
      const camZ = CONFIG.cameraBack;
      camera.position.set(camX, camY, camZ);
      camera.lookAt(lateralToX(p.x) * 0.95, altToY(p.alt) - 1.5, -CONFIG.cameraLookAhead);
      camera.rotation.z += -steer * 0.05;
      // Storm shake: the wind fights the camera in stage 2.
      if (stormFactor > 0) {
        camera.position.x += Math.sin(timeSec * 11.3) * 0.35;
        camera.position.y += Math.sin(timeSec * 17.7) * 0.25;
        camera.rotation.z += Math.sin(timeSec * 9.1) * 0.012;
      }

      // Sky follows the camera so the horizon never runs out.
      sky.position.copy(camera.position);
      sunSprite.position.set(camera.position.x + 140, camera.position.y + 85, camera.position.z - 320);
      sea.position.set(camera.position.x, 0, camera.position.z - 220);

      // Living sea: vertices ride deterministic sine waves.
      {
        const pos = seaGeo.attributes.position;
        const arr = pos.array;
        for (let i = 0; i < arr.length; i += 3) {
          const wx = seaBase[i] + sea.position.x;
          const wz = -seaBase[i + 1] + sea.position.z;
          arr[i + 2] = waveHeight(wx, wz, timeSec);
        }
        pos.needsUpdate = true;
        seaGeo.computeVertexNormals();
      }

      // Horizon cloud bank rides with the camera.
      bankMat.color.setHex(stormFactor > 0 ? 0x565a7d : 0xffffff);
      for (let i = 0; i < bankSprites.length; i++) {
        const sprite = bankSprites[i];
        sprite.position.set(
          camera.position.x - 160 + i * 80,
          camera.position.y + 4 + (i % 2) * 6,
          camera.position.z - 300,
        );
      }

      // Rain falls with the clock, only in the storm.
      rainMat.opacity = stormFactor * 0.65;
      if (stormFactor > 0) {
        const pos = rainGeo.attributes.position;
        const arr = pos.array;
        for (let i = 0; i < RAIN_COUNT; i++) {
          const bx = rainBase[i * 3];
          const by = rainBase[i * 3 + 1];
          const bz = rainBase[i * 3 + 2];
          const fall = (by - timeSec * 30) % 46;
          arr[i * 3] = camera.position.x + bx + Math.sin(timeSec * 2 + i) * 0.6;
          arr[i * 3 + 1] = fall < 0 ? fall + 46 : fall;
          arr[i * 3 + 2] = camera.position.z + bz;
        }
        pos.needsUpdate = true;
      }

      // Stage sky.
      const skyKind = stage.sky;
      if (skyMat.map !== skyTextures[skyKind]) {
        skyMat.map = skyTextures[skyKind];
        skyMat.needsUpdate = true;
        scene.fog.color.set(skyKind === 'storm' ? 0x3a3d5c : skyKind === 'sunset' ? 0xf7b98a : 0xbfe3f7);
        if (skyKind === 'storm') {
          scene.fog.near = 55;
          scene.fog.far = 200;
        } else if (skyKind === 'sunset') {
          scene.fog.near = 80;
          scene.fog.far = 280;
        } else {
          scene.fog.near = CONFIG.fogNear;
          scene.fog.far = CONFIG.fogFar;
        }
        hemi.intensity = skyKind === 'storm' ? 0.55 : 1.35;
        sunLight.intensity = skyKind === 'storm' ? 0.6 : 1.75;
        sunSprite.material.opacity = skyKind === 'storm' ? 0.25 : 1;
      }

      // Lightning flash.
      sunLight.intensity = (stage.sky === 'storm' ? 0.6 : 1.75) + state.flash * 2.6;

      // Blob shadow under the plane: lower and fainter the higher you fly.
      blobShadow.position.set(lateralToX(p.x), 0.3, 0);
      const shadowScale = 1 - p.alt * 0.35;
      blobShadow.scale.set(11 * shadowScale, 4.5 * shadowScale, 1);
      blobShadow.material.opacity = 0.42 * (1 - p.alt * 0.55);

      // World features slide toward the camera as distance grows.
      for (const { feature, mesh } of this.islands) {
        mesh.position.z = nmToZ(feature.atNm, dist);
        mesh.visible = mesh.position.z > -280 && mesh.position.z < 15;
      }
      for (const { feature, mesh } of this.rings) {
        const z = nmToZ(feature.atNm, dist);
        mesh.position.z = z;
        mesh.visible = z > -260 && z < 12;
        if (feature.passed) {
          const age = (state.tick - (feature.passedTick || state.tick)) / 60;
          mesh.scale.setScalar(Math.max(0.01, 1 + age * 1.4));
          mesh.children[0].material.opacity = Math.max(0, 1 - age * 1.6);
          mesh.visible = age < 0.6 && mesh.visible;
        } else {
          mesh.scale.setScalar(1 + Math.sin(timeSec * 3 + feature.atNm) * 0.04);
          mesh.rotation.z += dt * 0.25;
        }
      }
      for (const { feature, mesh } of this.stormCells) {
        const z = nmToZ(feature.atNm, dist);
        mesh.position.z = z;
        mesh.visible = z > -260 && z < 12;
        mesh.userData.bolt.material.opacity = state.flash > 0.3 ? state.flash : 0;
        mesh.userData.boltGlow.material.opacity = state.flash > 0.3 ? state.flash * 0.9 : 0;
        mesh.rotation.y += dt * 0.1;
      }
      for (const { feature, mesh } of this.ships) {
        const z = nmToZ(feature.atNm, dist);
        mesh.position.z = z;
        mesh.visible = z > -280 && z < 15;
        mesh.position.y = waveHeight(mesh.position.x, z, timeSec) * 0.5;
        mesh.rotation.z = Math.sin(timeSec * 0.8 + feature.atNm) * 0.03;
      }
      for (const { feature, sprite } of cloudSprites) {
        const z = nmToZ(feature.atNm, dist);
        sprite.position.z = z;
        sprite.visible = z > -280 && z < 20;
        sprite.position.x = lateralToX(feature.x) + Math.sin(timeSec * 0.1 + feature.atNm) * 2;
        // Clouds go dark in the storm so the sky stays menacing.
        sprite.material.color.setHex(stormFactor > 0 ? 0x6a6f8e : 0xffffff);
      }
      for (const sprite of stormClouds) {
        sprite.position.z = nmToZ(sprite.userData.atNm, dist);
        sprite.visible = sprite.position.z > -280 && sprite.position.z < 20;
        sprite.material.opacity = stormFactor * 0.9;
      }
      for (const sprite of this.whitecaps || []) {
        const z = nmToZ(sprite.userData.atNm, dist);
        sprite.position.z = z;
        sprite.visible = z > -280 && z < 15;
        sprite.position.x = lateralToX(sprite.userData.x);
        sprite.position.y = 0.4 + waveHeight(sprite.position.x, z, timeSec) * 0.6;
        sprite.material.opacity = 0.35 + 0.2 * Math.sin(timeSec * 1.7 + sprite.userData.phase);
      }

      // Runway sits at the route end; it slides in like everything else.
      runway.position.z = -((CONFIG.routeLengthNm - 1 - dist) * NM_SCALE);

      renderer.render(scene, camera);
    },
  };

  return api;
}
