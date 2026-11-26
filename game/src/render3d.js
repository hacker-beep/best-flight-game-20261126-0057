// Nusantara Skies — the 3D scene. One clear job: turn the game state
// into a picture. It owns the Three.js renderer, the sky, the sea, the
// islands, the rings, the storm, the runway and the chase camera. It
// holds no game logic; game.js decides, this file draws.
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
      grad.addColorStop(0, '#3f9be8');
      grad.addColorStop(0.55, '#8fd0f7');
      grad.addColorStop(0.8, '#d8f2fd');
      grad.addColorStop(1, '#eaf9ff');
    } else if (kind === 'storm') {
      grad.addColorStop(0, '#191c33');
      grad.addColorStop(0.55, '#33364f');
      grad.addColorStop(0.8, '#4e4e68');
      grad.addColorStop(1, '#655f7d');
    } else {
      grad.addColorStop(0, '#e86a3c');
      grad.addColorStop(0.45, '#ff9a5c');
      grad.addColorStop(0.75, '#ffc98f');
      grad.addColorStop(1, '#ffe3b8');
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

function seaTexture(seed) {
  const rng = makeRng(seed);
  const tex = canvasTexture(256, 256, (g, w, h) => {
    g.fillStyle = '#1f6fb2';
    g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(255,255,255,0.16)';
    g.lineWidth = 2;
    for (let i = 0; i < 26; i++) {
      const x = rng.range(0, w);
      const y = rng.range(0, h);
      const len = rng.range(10, 34);
      g.beginPath();
      g.moveTo(x, y);
      g.quadraticCurveTo(x + len / 2, y - 4, x + len, y);
      g.stroke();
    }
  });
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(10, 10);
  return tex;
}

// The aircraft: a clean low-poly silhouette from primitives — white
// fuselage, blue tail and wingtips, grey engines. Readable at any size.
function buildPlane() {
  const group = new THREE.Group();
  const white = new THREE.MeshLambertMaterial({ color: 0xf4f7fa });
  const blue = new THREE.MeshLambertMaterial({ color: 0x2456a8 });
  const dark = new THREE.MeshLambertMaterial({ color: 0x2b3542 });
  const grey = new THREE.MeshLambertMaterial({ color: 0x8b98a5 });

  const fuselage = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.48, 5.4, 12), white);
  fuselage.rotation.x = Math.PI / 2;
  group.add(fuselage);

  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.55, 1.5, 12), white);
  nose.rotation.x = -Math.PI / 2;
  nose.position.z = -3.4;
  group.add(nose);

  const tailCone = new THREE.Mesh(new THREE.ConeGeometry(0.48, 1.3, 12), white);
  tailCone.rotation.x = Math.PI / 2;
  tailCone.position.z = 3.3;
  group.add(tailCone);

  // Blue cheatline along the fuselage.
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(1.12, 0.16, 4.6), blue);
  stripe.position.set(0, 0.05, -0.2);
  group.add(stripe);

  // Windows: a dark strip each side.
  for (const side of [-1, 1]) {
    const win = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.14, 3.4), dark);
    win.position.set(side * 0.56, 0.22, -0.4);
    group.add(win);
  }

  // Main wings, swept slightly back, blue tips.
  const wing = new THREE.Mesh(new THREE.BoxGeometry(9.6, 0.12, 1.7), white);
  wing.position.set(0, -0.12, 0.2);
  group.add(wing);
  for (const side of [-1, 1]) {
    const tip = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.14, 1.7), blue);
    tip.position.set(side * 4.45, -0.12, 0.2);
    group.add(tip);
    const engine = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 1.1, 10), grey);
    engine.rotation.x = Math.PI / 2;
    engine.position.set(side * 2.1, -0.42, 0.1);
    group.add(engine);
  }

  // Tailplane and fin.
  const tailplane = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.1, 1.0), white);
  tailplane.position.set(0, 0.1, 3.4);
  group.add(tailplane);
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.7, 1.5), blue);
  fin.position.set(0, 0.85, 3.5);
  group.add(fin);

  return group;
}

// One island: sand rim, green hill (or a mountain cone), a few cone
// trees and tiny houses. Flat colours, no textures.
function buildIsland(feature, rng) {
  const group = new THREE.Group();
  const r = 8 * feature.size;
  const sand = new THREE.Mesh(
    new THREE.CylinderGeometry(r, r * 1.08, 0.7, 18),
    new THREE.MeshLambertMaterial({ color: 0xf2e2a4 }),
  );
  sand.position.y = 0.35;
  group.add(sand);

  const hillMat = new THREE.MeshLambertMaterial({ color: 0x58b368 });
  const hillDark = new THREE.MeshLambertMaterial({ color: 0x3f9e57 });
  if (feature.kind === 'mountain') {
    const mountain = new THREE.Mesh(new THREE.ConeGeometry(r * 0.72, feature.height * 2.2, 10), hillDark);
    mountain.position.y = 0.7 + feature.height;
    group.add(mountain);
    const snow = new THREE.Mesh(new THREE.ConeGeometry(r * 0.2, feature.height * 0.6, 10), new THREE.MeshLambertMaterial({ color: 0xffffff }));
    snow.position.y = 0.7 + feature.height * 1.85;
    group.add(snow);
  } else {
    const hill = new THREE.Mesh(new THREE.SphereGeometry(r * 0.78, 12, 8), hillMat);
    hill.scale.y = 0.32 + feature.height * 0.06;
    hill.position.y = 0.7;
    group.add(hill);
  }

  // Cone trees.
  const treeMat = new THREE.MeshLambertMaterial({ color: 0x2f7d46 });
  for (let i = 0; i < feature.trees; i++) {
    const tree = new THREE.Mesh(new THREE.ConeGeometry(0.55, 1.7, 6), treeMat);
    const a = rng.range(0, Math.PI * 2);
    const rr = rng.range(0, r * 0.55);
    tree.position.set(Math.cos(a) * rr, 1.4 + feature.height * 0.12, Math.sin(a) * rr);
    group.add(tree);
  }

  // Tiny houses: white box + red roof.
  const wallMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  const roofMat = new THREE.MeshLambertMaterial({ color: 0xd94f3d });
  for (let i = 0; i < feature.houses; i++) {
    const house = new THREE.Group();
    const walls = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.6, 0.9), wallMat);
    walls.position.y = 0.3;
    const roof = new THREE.Mesh(new THREE.ConeGeometry(0.75, 0.5, 4), roofMat);
    roof.position.y = 0.85;
    roof.rotation.y = Math.PI / 4;
    house.add(walls, roof);
    const a = rng.range(0, Math.PI * 2);
    const rr = rng.range(r * 0.3, r * 0.7);
    house.position.set(Math.cos(a) * rr, 0.7, Math.sin(a) * rr);
    group.add(house);
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

function buildStormCell(feature, rng) {
  const group = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial({ color: 0x2b2d45 });
  for (let i = 0; i < 3; i++) {
    const blob = new THREE.Mesh(new THREE.IcosahedronGeometry(4 * feature.size, 0), mat);
    blob.position.set(rng.range(-2, 2), rng.range(-1, 1), rng.range(-2, 2));
    blob.scale.y = 0.7;
    group.add(blob);
  }
  // Lightning bolt: a jagged line, hidden until the flash.
  const points = [];
  let x = 0;
  let y = 2;
  for (let i = 0; i < 7; i++) {
    points.push(new THREE.Vector3(x, y, 0));
    x += rng.range(-1.6, 1.6);
    y -= rng.range(1.6, 2.6);
  }
  const bolt = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(points),
    new THREE.LineBasicMaterial({ color: 0xd6e9ff, transparent: true, opacity: 0 }),
  );
  bolt.position.y = -1;
  group.add(bolt);
  group.userData.bolt = bolt;
  return group;
}

export function createScene(canvas, seed) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xbfe3f7, CONFIG.fogNear, CONFIG.fogFar);

  const camera = new THREE.PerspectiveCamera(62, 1, 0.1, 900);

  const hemi = new THREE.HemisphereLight(0xcfe8ff, 0x2e6b8a, 1.25);
  scene.add(hemi);
  const sunLight = new THREE.DirectionalLight(0xfff2d0, 1.6);
  sunLight.position.set(40, 80, -60);
  scene.add(sunLight);
  // Fill light from behind the camera so the plane's tail faces read.
  const fillLight = new THREE.DirectionalLight(0xdceeff, 0.55);
  fillLight.position.set(-20, 30, 90);
  scene.add(fillLight);

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
  sunSprite.scale.set(64, 64, 1);
  scene.add(sunSprite);

  // Sea: one big textured plane that follows the camera.
  const sea = new THREE.Mesh(
    new THREE.PlaneGeometry(1000, 1000),
    new THREE.MeshLambertMaterial({ map: seaTexture(seed) }),
  );
  sea.rotation.x = -Math.PI / 2;
  sea.position.y = 0;
  scene.add(sea);

  // Clouds: soft sprites at fixed world spots.
  const cloudTex = softDiscTexture('rgba(255,255,255,0.95)', 'rgba(255,255,255,0)');
  const cloudMat = new THREE.SpriteMaterial({ map: cloudTex, transparent: true, depthWrite: false, opacity: 0.9 });
  const cloudSprites = [];

  const plane = buildPlane();
  plane.scale.setScalar(1.25);
  scene.add(plane);

  // Runway group, built once, placed on the destination island.
  const runway = new THREE.Group();
  {
    const strip = new THREE.Mesh(
      new THREE.BoxGeometry(7, 0.3, 64),
      new THREE.MeshLambertMaterial({ color: 0x5a5f6b }),
    );
    strip.position.y = 0.15;
    runway.add(strip);
    const dashMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
    for (let i = 0; i < 9; i++) {
      const dash = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.06, 3.2), dashMat);
      dash.position.set(0, 0.32, -26 + i * 6.5);
      runway.add(dash);
    }
    const lightGreen = new THREE.MeshBasicMaterial({ color: 0x37d67a });
    const lightRed = new THREE.MeshBasicMaterial({ color: 0xff5d5d });
    for (const side of [-1, 1]) {
      for (let i = 0; i < 4; i++) {
        const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 6), i % 2 ? lightRed : lightGreen);
        lamp.position.set(side * 4.2, 0.5, -30 + i * 3);
        runway.add(lamp);
      }
    }
    const terminal = new THREE.Mesh(
      new THREE.BoxGeometry(16, 4, 7),
      new THREE.MeshLambertMaterial({ color: 0xdfe6ee }),
    );
    terminal.position.set(14, 2, 8);
    runway.add(terminal);
    const tower = new THREE.Mesh(
      new THREE.CylinderGeometry(1.1, 1.5, 9, 8),
      new THREE.MeshLambertMaterial({ color: 0xe8edf3 }),
    );
    tower.position.set(11, 4.5, -6);
    runway.add(tower);
    const towerTop = new THREE.Mesh(
      new THREE.CylinderGeometry(1.9, 1.9, 1.8, 8),
      new THREE.MeshLambertMaterial({ color: 0x9fb4c8 }),
    );
    towerTop.position.set(11, 9.6, -6);
    runway.add(towerTop);
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
      for (const feature of world.clouds) {
        const sprite = new THREE.Sprite(cloudMat.clone());
        sprite.position.set(lateralToX(feature.x), feature.y, nmToZ(feature.atNm, 0));
        sprite.scale.set(feature.size * 11, feature.size * 5, 1);
        sprite.material.opacity = 0.7 + feature.layer * 0.15;
        scene.add(sprite);
        cloudSprites.push({ feature, sprite });
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

      // Sky follows the camera so the horizon never runs out.
      sky.position.copy(camera.position);
      sunSprite.position.set(camera.position.x + 140, camera.position.y + 85, camera.position.z - 320);
      sea.position.set(camera.position.x, 0, camera.position.z - 220);

      // Stage sky.
      const stage = CONFIG.stages[state.stageIndex] || CONFIG.stages[0];
      const skyKind = stage.sky;
      if (skyMat.map !== skyTextures[skyKind]) {
        skyMat.map = skyTextures[skyKind];
        skyMat.needsUpdate = true;
        scene.fog.color.set(skyKind === 'storm' ? 0x6b6f8e : skyKind === 'sunset' ? 0xf7b98a : 0xbfe3f7);
        hemi.intensity = skyKind === 'storm' ? 0.6 : 1.25;
        sunLight.intensity = skyKind === 'storm' ? 0.7 : 1.6;
      }

      // Lightning flash.
      sunLight.intensity = (stage.sky === 'storm' ? 0.7 : 1.6) + state.flash * 2.2;

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
        mesh.rotation.y += dt * 0.1;
      }
      for (const { feature, sprite } of cloudSprites) {
        const z = nmToZ(feature.atNm, dist);
        sprite.position.z = z;
        sprite.visible = z > -280 && z < 20;
        sprite.position.x = lateralToX(feature.x) + Math.sin(timeSec * 0.1 + feature.atNm) * 2;
      }

      // Runway sits at the route end; it slides in like everything else.
      runway.position.z = -((CONFIG.routeLengthNm - 1 - dist) * NM_SCALE);

      renderer.render(scene, camera);
    },
  };

  return api;
}
