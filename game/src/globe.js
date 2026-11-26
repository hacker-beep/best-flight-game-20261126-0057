// Nusantara Skies — the route map overlay. One clear job: show the
// flight on a globe. A small Three.js scene (its own canvas, rendered
// only while the map is open): a low-poly Earth with the CGK → DPS arc,
// two airport markers and the plane's progress along the arc.
import * as THREE from 'three';

function globeTexture() {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#2a6db0';
  g.fillRect(0, 0, 512, 256);
  // Very rough continents, enough to read as Earth at a glance.
  g.fillStyle = '#58b368';
  const blob = (x, y, rx, ry, rot) => {
    g.save();
    g.translate(x, y);
    g.rotate(rot);
    g.beginPath();
    g.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
    g.fill();
    g.restore();
  };
  blob(400, 70, 70, 34, -0.3); // Asia
  blob(330, 120, 46, 26, 0.2); // SE Asia
  blob(430, 150, 34, 20, 0.1); // Australia
  blob(120, 90, 55, 30, 0.3); // Americas
  blob(60, 140, 30, 18, 0);
  blob(255, 55, 40, 22, -0.2);
  // Indonesia archipelago: a dotted chain across the equator.
  g.fillStyle = '#6fbf7a';
  for (let i = 0; i < 14; i++) {
    blob(300 + i * 9, 132 + Math.sin(i * 1.3) * 5, 7, 4, 0);
  }
  return new THREE.CanvasTexture(c);
}

// CGK (-6.12, 106.65) and DPS (-8.75, 115.16) as 3D points on a sphere.
function latLonToVec(lat, lon, radius) {
  const phi = ((90 - lat) * Math.PI) / 180;
  const theta = ((lon + 180) * Math.PI) / 180;
  return new THREE.Vector3(
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta),
  );
}

export function createGlobe(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(42, 2, 0.1, 100);
  camera.position.set(0, 6, 30);

  // Everything that turns with the Earth lives in one group.
  const earth = new THREE.Group();
  scene.add(earth);

  const globe = new THREE.Mesh(
    new THREE.SphereGeometry(10, 32, 24),
    new THREE.MeshLambertMaterial({ map: globeTexture() }),
  );
  earth.add(globe);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x335577, 1.1));
  const sun = new THREE.DirectionalLight(0xffffff, 1.2);
  sun.position.set(20, 10, 20);
  scene.add(sun);

  const cgk = latLonToVec(-6.12, 106.65, 10.2);
  const dps = latLonToVec(-8.75, 115.16, 10.2);
  const markerMat = new THREE.MeshBasicMaterial({ color: 0xff5d5d });
  for (const point of [cgk, dps]) {
    const marker = new THREE.Mesh(new THREE.SphereGeometry(0.35, 10, 8), markerMat);
    marker.position.copy(point);
    earth.add(marker);
  }
  // Arc between the airports, lifted above the surface.
  const mid = cgk.clone().add(dps).multiplyScalar(0.5).normalize().multiplyScalar(13.5);
  const curve = new THREE.QuadraticBezierCurve3(cgk, mid, dps);
  const arc = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(curve.getPoints(48)),
    new THREE.LineBasicMaterial({ color: 0xffd94d }),
  );
  earth.add(arc);
  const planeMarker = new THREE.Mesh(
    new THREE.SphereGeometry(0.45, 10, 8),
    new THREE.MeshBasicMaterial({ color: 0xffffff }),
  );
  earth.add(planeMarker);

  // Turn the globe so Indonesia faces the camera.
  earth.rotation.y = -1.85;

  let open = false;

  return {
    get open() {
      return open;
    },
    show() {
      open = true;
    },
    hide() {
      open = false;
    },
    resize(w, h) {
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    },
    render(progress, dt) {
      if (!open) return;
      earth.rotation.y += dt * 0.03;
      const t = Math.min(1, Math.max(0, progress));
      planeMarker.position.copy(curve.getPoint(t));
      renderer.render(scene, camera);
    },
  };
}
