// Nusantara Skies — the HUD. One clear job: show the flight. It owns
// every DOM readout and the four canvas instruments (compass strip,
// speed tape, altitude tape, route mini-map, attitude). It decides
// nothing; main.js hands it the state.
//
// v4 — the "simulator frame": the HUD is dense on all four edges so
// the game reads as a flight sim even shrunk to a thumbnail — a
// compass/HDG strip across the top, speed and altitude tapes on the
// left and right edges, a route mini-map top-right, a mission box
// top-left, and an instruction bar along the bottom.
import { CONFIG } from './config.js';

function el(id) {
  return document.getElementById(id);
}

function drawAttitude(canvas, bank, pitch) {
  const g = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  const cx = w / 2;
  const cy = h / 2;
  const r = w / 2 - 4;
  g.save();
  g.clearRect(0, 0, w, h);
  g.beginPath();
  g.arc(cx, cy, r, 0, Math.PI * 2);
  g.clip();
  // Sky and ground, rotated by bank, shifted by pitch.
  g.translate(cx, cy);
  g.rotate(-bank);
  g.translate(0, pitch * 26);
  g.fillStyle = '#4aa8ec';
  g.fillRect(-r - 4, -r - 4, (r + 4) * 2, r + 4);
  g.fillStyle = '#c98a4b';
  g.fillRect(-r - 4, 0, (r + 4) * 2, r + 4);
  g.fillStyle = '#ffffff';
  g.fillRect(-r - 4, -1, (r + 4) * 2, 2);
  g.restore();
  // Fixed wings marker.
  g.strokeStyle = '#ffd94d';
  g.lineWidth = 3;
  g.beginPath();
  g.moveTo(cx - 16, cy);
  g.lineTo(cx - 6, cy);
  g.moveTo(cx + 6, cy);
  g.lineTo(cx + 16, cy);
  g.stroke();
  g.strokeStyle = 'rgba(255,255,255,0.7)';
  g.lineWidth = 2;
  g.beginPath();
  g.arc(cx, cy, r, 0, Math.PI * 2);
  g.stroke();
}

// Compass strip: a scrolling heading tape across the top centre.
// Cardinals on top, degree ticks below, gold caret dead centre.
function drawCompassStrip(canvas, heading) {
  const g = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  const cx = w / 2;
  const pxPerDeg = 3.2; // about ±65° visible
  const cardinals = { 0: 'N', 45: 'NE', 90: 'E', 135: 'SE', 180: 'S', 225: 'SW', 270: 'W', 315: 'NW' };
  g.clearRect(0, 0, w, h);
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const base = Math.round(heading);
  // Anchor the tick grid to ABSOLUTE 5° marks (not to the heading):
  // the labels live on multiples of 15°/45°, and a heading-anchored
  // grid never lands on them (274° + 5k never hits a multiple of
  // 15) — the v4.0 strip drew ticks but no letters at all.
  const start = Math.floor((base - 70) / 5) * 5;
  for (let deg = start; deg <= base + 70; deg += 5) {
    const dd = ((deg - base + 540) % 360) - 180; // signed offset, -180..180
    if (dd < -70 || dd > 70) continue;
    const d = ((deg % 360) + 360) % 360; // absolute degree 0..359
    const x = cx + dd * pxPerDeg;
    if (x < -10 || x > w + 10) continue;
    const label = cardinals[d];
    const major = d % 15 === 0;
    g.strokeStyle = major ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.4)';
    g.lineWidth = major ? 2 : 1;
    g.beginPath();
    g.moveTo(x, label ? 15 : 21);
    g.lineTo(x, label ? 30 : 26);
    g.stroke();
    if (label) {
      g.fillStyle = label === 'N' ? '#ff5d5d' : '#ffffff';
      g.font = '700 13px Arial, sans-serif';
      g.fillText(label, x, 9);
    } else if (major) {
      g.fillStyle = 'rgba(214,233,255,0.9)';
      g.font = '600 10px Arial, sans-serif';
      g.fillText(String(d).padStart(3, '0'), x, 35);
    }
  }
  // Centre caret: gold triangle at the top, pointing down at the
  // current heading.
  g.fillStyle = '#ffd94d';
  g.beginPath();
  g.moveTo(cx - 7, 0);
  g.lineTo(cx + 7, 0);
  g.lineTo(cx, 8);
  g.closePath();
  g.fill();
}

// Vertical tape (speed on the left edge, altitude on the right):
// scrolling tick marks with the current value pinned at the centre by
// a gold marker. `flip` mirrors the tick side for the right edge.
function drawTape(canvas, value, step, labelEvery, pxPerUnit, flip) {
  const g = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  const cy = h / 2;
  g.clearRect(0, 0, w, h);
  g.fillStyle = 'rgba(8, 20, 38, 0.55)';
  g.fillRect(0, 0, w, h);
  const half = (h / 2 - 6) / pxPerUnit;
  const start = Math.floor((value - half) / step) * step;
  const end = value + half;
  g.textBaseline = 'middle';
  for (let v = start; v <= end; v += step) {
    const y = cy - (v - value) * pxPerUnit;
    if (y < 2 || y > h - 2) continue;
    const major = ((v % labelEvery) + labelEvery) % labelEvery === 0;
    g.strokeStyle = major ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.35)';
    g.lineWidth = major ? 2 : 1;
    const x0 = flip ? w - 24 : 6;
    const x1 = flip ? w - 6 : 24;
    g.beginPath();
    g.moveTo(major ? x0 : flip ? w - 14 : 14, y);
    g.lineTo(x1, y);
    g.stroke();
    if (major) {
      g.fillStyle = '#ffffff';
      g.font = '600 11px Arial, sans-serif';
      g.textAlign = flip ? 'right' : 'left';
      g.fillText(v.toLocaleString('en-US'), flip ? w - 28 : 28, y);
    }
  }
  // Gold centre marker: a band across the tape with a triangle
  // pointing in from the outer edge.
  g.fillStyle = '#ffd94d';
  g.fillRect(0, cy - 2, w, 4);
  g.beginPath();
  if (flip) {
    g.moveTo(w, cy - 9);
    g.lineTo(w - 9, cy);
    g.lineTo(w, cy + 9);
  } else {
    g.moveTo(0, cy - 9);
    g.lineTo(9, cy);
    g.lineTo(0, cy + 9);
  }
  g.closePath();
  g.fill();
}

// Route mini-map (top-right): the whole CGK → DPS route at a glance
// — island chain, rings, storm cells, runway, and the plane's
// progress along the dashed route line.
function drawRouteMap(canvas, state) {
  const g = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  g.clearRect(0, 0, w, h);
  g.fillStyle = 'rgba(6, 20, 34, 0.95)';
  g.fillRect(0, 0, w, h);
  const cx = w / 2;
  const top = 16;
  const bottom = h - 14;
  const yFor = (atNm) => bottom - (atNm / CONFIG.routeLengthNm) * (bottom - top);
  const xFor = (x) => cx + x * 34;
  // Dashed route line, CGK (bottom) → DPS (top).
  g.strokeStyle = 'rgba(255, 217, 77, 0.75)';
  g.lineWidth = 2;
  g.setLineDash([5, 4]);
  g.beginPath();
  g.moveTo(cx, bottom);
  g.lineTo(cx, top);
  g.stroke();
  g.setLineDash([]);
  // Islands: green dots along the route.
  for (const isl of state.world.islands) {
    g.fillStyle = '#58b368';
    g.beginPath();
    g.arc(xFor(isl.x), yFor(isl.atNm), isl.kind === 'destination' ? 4 : 2.5, 0, Math.PI * 2);
    g.fill();
  }
  // Storm cells: red dots.
  for (const cell of state.world.stormCells) {
    g.fillStyle = '#ff5d5d';
    g.beginPath();
    g.arc(xFor(cell.x), yFor(cell.atNm), 3.5, 0, Math.PI * 2);
    g.fill();
  }
  // Rings: gold (green if a fuel ring); passed rings go dim.
  for (const ring of state.world.rings) {
    g.fillStyle = ring.fuel ? '#37d67a' : '#ffd94d';
    g.beginPath();
    g.arc(xFor(ring.x), yFor(ring.atNm), 3, 0, Math.PI * 2);
    if (ring.passed) {
      g.globalAlpha = 0.3;
      g.fill();
      g.globalAlpha = 1;
    } else {
      g.fill();
    }
  }
  // Runway: white square at the top.
  g.fillStyle = '#ffffff';
  g.fillRect(cx - 4, top - 4, 8, 8);
  // Own aircraft: white triangle at the current progress.
  const py = yFor(Math.min(state.distanceNm, CONFIG.routeLengthNm));
  g.fillStyle = '#ffffff';
  g.beginPath();
  g.moveTo(cx, py - 6);
  g.lineTo(cx - 4.5, py + 4);
  g.lineTo(cx + 4.5, py + 4);
  g.closePath();
  g.fill();
  // Airport labels.
  g.fillStyle = '#d6e9ff';
  g.font = '700 10px Arial, sans-serif';
  g.textAlign = 'left';
  g.fillText('CGK', 4, h - 4);
  g.textAlign = 'right';
  g.fillText('DPS', w - 4, 12);
}

const INSTRUCTIONS = [
  'FIRST SORTIE — Fly the rings, then land on runway 09',
  'STORM FRONT — Thread the gap · dodge the lightning cells',
  'FINAL — Gear down · stay on glidepath · land runway 09',
];

export function createHud() {
  const nodes = {
    alt: el('hud-alt'),
    spd: el('hud-spd'),
    fuel: el('hud-fuel'),
    fuelBar: el('fuel-bar'),
    hdg: el('hud-hdg'),
    compassStrip: el('compass-strip'),
    tapeSpd: el('tape-spd'),
    tapeAlt: el('tape-alt'),
    score: el('hud-score'),
    rings: el('hud-rings'),
    time: el('hud-time'),
    stage: el('hud-stage'),
    instruct: el('hud-instruct'),
    nextRing: el('hud-next'),
    routeLabel: el('hud-route-label'),
    throttle: el('throttle-bar'),
    hull: el('hull-bar'),
    toast: el('toast'),
    toastSub: el('toast-sub'),
    flash: el('flash'),
    attitude: el('attitude'),
    radar: el('radar'),
    landingPanel: el('panel-landing'),
    landAlt: el('hud-land-alt'),
    landAltStatus: el('hud-land-alt-status'),
    landSpd: el('hud-land-spd'),
    landSpdStatus: el('hud-land-spd-status'),
    landAlign: el('hud-land-align'),
    landAlignStatus: el('hud-land-align-status'),
  };
  const last = {};

  function setText(node, key, value) {
    if (last[key] !== value) {
      last[key] = value;
      if (node) node.textContent = value;
    }
  }

  function setWidth(node, key, pct) {
    const v = Math.max(0, Math.min(100, pct));
    if (last[key] !== v) {
      last[key] = v;
      if (node) node.style.width = `${v}%`;
    }
  }

  return {
    nodes,
    update(state) {
      const p = state.plane;
      const altFt = Math.round(1500 + p.alt * 13500);
      const spdKts = Math.round(p.speedKts);
      // Edge tapes + big numerals.
      setText(nodes.alt, 'alt', altFt.toLocaleString('en-US'));
      setText(nodes.spd, 'spd', `${spdKts}`);
      if (nodes.tapeSpd) drawTape(nodes.tapeSpd, spdKts, 20, 100, 1.05, false);
      if (nodes.tapeAlt) drawTape(nodes.tapeAlt, altFt, 500, 2000, 0.043, true);
      setText(nodes.fuel, 'fuel', `${Math.max(0, Math.round(state.fuel))}%`);
      setWidth(nodes.fuelBar, 'fuelBar', state.fuel);
      if (nodes.fuelBar) {
        nodes.fuelBar.style.background = state.fuel <= 25 ? '#ff5d5d' : state.fuel <= 50 ? '#ffb84d' : '#7dffa8';
      }
      // Compass strip + heading.
      setText(nodes.hdg, 'hdg', `${String(Math.round(p.heading)).padStart(3, '0')}°`);
      if (nodes.compassStrip) drawCompassStrip(nodes.compassStrip, p.heading);
      // Mission box: score, rings, time.
      setText(nodes.score, 'score', state.score.toLocaleString('en-US'));
      setText(nodes.rings, 'rings', `RINGS ${state.ringsPassed}/${state.ringsTotal}`);
      const mm = Math.floor(state.time / 60);
      const ss = String(Math.floor(state.time % 60)).padStart(2, '0');
      setText(nodes.time, 'time', `${mm}:${ss}`);
      const stage = CONFIG.stages[state.stageIndex];
      setText(nodes.stage, 'stage', stage ? stage.name : '');
      setText(nodes.instruct, 'instruct', INSTRUCTIONS[state.stageIndex] || INSTRUCTIONS[0]);
      const next = state.world.rings.find((r) => !r.passed && !r.missed && r.atNm > state.distanceNm);
      setText(
        nodes.nextRing,
        'next',
        next ? `NEXT RING ${(next.atNm - state.distanceNm).toFixed(1)} nm` : 'NO RINGS AHEAD',
      );
      setText(
        nodes.routeLabel,
        'route',
        `CGK → DPS  •  ${(CONFIG.routeLengthNm - state.distanceNm).toFixed(0)} nm left`,
      );
      setWidth(nodes.throttle, 'thr', p.throttle * 100);
      setWidth(nodes.hull, 'hull', state.hull);
      if (nodes.hull) {
        nodes.hull.style.background = state.hull <= 30 ? '#ff5d5d' : '#7dffa8';
      }
      // Landing guide (focus item 5): shown on final approach only.
      // Glidepath target: descend from alt 0.55 at 15 nm out to 0.12
      // at the threshold. Speed target: stay under 500 kts (boost
      // pushes past it). Alignment: centreline within 0.18 to land.
      const onApproach = state.stageIndex >= 2 && state.phase === 'flying';
      if (nodes.landingPanel) {
        nodes.landingPanel.classList.toggle('hidden', !onApproach);
      }
      if (onApproach) {
        const remaining = Math.max(0, CONFIG.routeLengthNm - state.distanceNm);
        const targetAlt = Math.min(0.55, Math.max(0.12, 0.12 + (remaining / 15) * 0.25));
        const targetAltFt = Math.round(1500 + targetAlt * 13500);
        const devFt = altFt - targetAltFt;
        const altStatus = Math.abs(devFt) <= 400 ? '✓ ON GLIDE' : devFt > 0 ? '▲ TOO HIGH' : '▼ TOO LOW';
        setText(nodes.landAlt, 'landAlt', `${altFt.toLocaleString('en-US')} ft / ${targetAltFt.toLocaleString('en-US')}`);
        setText(nodes.landAltStatus, 'landAltStatus', altStatus);
        if (nodes.landAltStatus) {
          nodes.landAltStatus.className = `land-status ${Math.abs(devFt) <= 400 ? 'ok' : 'bad'}`;
        }
        const spdStatus = spdKts > 500 ? '▲ TOO FAST' : spdKts >= 420 ? '✓ ON SPEED' : '▼ SLOW';
        setText(nodes.landSpd, 'landSpd', `${spdKts} kts / ≤ 500`);
        setText(nodes.landSpdStatus, 'landSpdStatus', spdStatus);
        if (nodes.landSpdStatus) {
          nodes.landSpdStatus.className = `land-status ${spdKts > 500 ? 'bad' : 'ok'}`;
        }
        const ax = Math.abs(p.x);
        const alignStatus = ax < 0.08 ? '✓ CENTERED' : ax < 0.18 ? '◀▶ ALIGNING' : p.x < 0 ? '◀ OFF CENTER' : '▶ OFF CENTER';
        setText(nodes.landAlign, 'landAlign', `±${ax.toFixed(2)} / 0.18`);
        setText(nodes.landAlignStatus, 'landAlignStatus', alignStatus);
        if (nodes.landAlignStatus) {
          nodes.landAlignStatus.className = `land-status ${ax < 0.08 ? 'ok' : ax < 0.18 ? 'warn' : 'bad'}`;
        }
      }
      // Toast (big centre event text).
      if (state.toast && state.time < state.toast.until) {
        setText(nodes.toast, 'toast', state.toast.text);
        setText(nodes.toastSub, 'toastSub', state.toast.sub);
        nodes.toast.parentElement.classList.remove('hidden');
        nodes.toast.parentElement.classList.toggle('warn', state.toast.kind === 'warn');
        nodes.toast.parentElement.classList.toggle('good', state.toast.kind === 'good');
      } else if (nodes.toast) {
        nodes.toast.parentElement.classList.add('hidden');
      }
      // Lightning flash overlay.
      if (nodes.flash) {
        nodes.flash.style.opacity = state.flash > 0 ? String(state.flash * 0.55) : '0';
      }
      // Mini instruments.
      if (nodes.attitude) {
        drawAttitude(nodes.attitude, -(state.lastSteer || 0) * 0.45, (p.alt - 0.55) * 0.8);
      }
      if (nodes.radar) {
        drawRouteMap(nodes.radar, state);
      }
    },
  };
}
