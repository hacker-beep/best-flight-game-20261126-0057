// Nusantara Skies — the HUD. One clear job: show the flight. It owns
// every DOM readout (altitude, speed, fuel, heading, score, mission,
// route, throttle, hull) and the two mini instruments (attitude
// indicator and radar). It decides nothing; main.js hands it the state.
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

function drawRadar(canvas, state) {
  const g = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  const cx = w / 2;
  const cy = h / 2;
  const R = w / 2 - 6;
  g.clearRect(0, 0, w, h);
  g.fillStyle = 'rgba(8, 24, 16, 0.85)';
  g.beginPath();
  g.arc(cx, cy, R, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = 'rgba(120, 255, 160, 0.5)';
  g.lineWidth = 1;
  for (const rr of [R / 3, (R * 2) / 3, R]) {
    g.beginPath();
    g.arc(cx, cy, rr, 0, Math.PI * 2);
    g.stroke();
  }
  g.beginPath();
  g.moveTo(cx, cy - R);
  g.lineTo(cx, cy + R);
  g.moveTo(cx - R, cy);
  g.lineTo(cx + R, cy);
  g.stroke();
  // Sweep.
  const sweep = (state.time * 1.4) % (Math.PI * 2);
  const grad = g.createConicGradient ? g.createConicGradient(sweep, cx, cy) : null;
  if (grad) {
    grad.addColorStop(0, 'rgba(120,255,160,0.5)');
    grad.addColorStop(0.12, 'rgba(120,255,160,0)');
    grad.addColorStop(1, 'rgba(120,255,160,0)');
    g.fillStyle = grad;
    g.beginPath();
    g.moveTo(cx, cy);
    g.arc(cx, cy, R, 0, Math.PI * 2);
    g.fill();
  }
  // Blips: rings ahead (gold/green), storm cells (red), runway (white).
  const dist = state.distanceNm;
  const plot = (atNm, x, color, size) => {
    const ahead = atNm - dist;
    if (ahead < 0 || ahead > CONFIG.viewDistanceNm) return;
    const t = 1 - ahead / CONFIG.viewDistanceNm;
    const bx = cx + x * R * 0.9;
    const by = cy - R * 0.15 - t * R * 0.75;
    g.fillStyle = color;
    g.beginPath();
    g.arc(bx, by, size, 0, Math.PI * 2);
    g.fill();
  };
  for (const ring of state.world.rings) {
    if (!ring.passed) plot(ring.atNm, ring.x, ring.fuel ? '#37d67a' : '#ffd94d', 3);
  }
  for (const cell of state.world.stormCells) {
    plot(cell.atNm, cell.x, '#ff5d5d', 4);
  }
  plot(CONFIG.routeLengthNm - 1, 0, '#ffffff', 4);
  // Own aircraft at the bottom centre.
  g.fillStyle = '#ffffff';
  g.beginPath();
  g.moveTo(cx, cy + R - 8);
  g.lineTo(cx - 4, cy + R - 1);
  g.lineTo(cx + 4, cy + R - 1);
  g.closePath();
  g.fill();
}

export function createHud() {
  const nodes = {
    alt: el('hud-alt'),
    spd: el('hud-spd'),
    fuel: el('hud-fuel'),
    fuelBar: el('fuel-bar'),
    hdg: el('hud-hdg'),
    compassNeedle: el('compass-needle'),
    score: el('hud-score'),
    combo: el('hud-combo'),
    rings: el('hud-rings'),
    stage: el('hud-stage'),
    mission: el('hud-mission'),
    nextRing: el('hud-next'),
    routeDot: el('route-dot'),
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
      setText(nodes.alt, 'alt', `${altFt.toLocaleString('en-US')} ft`);
      setText(nodes.spd, 'spd', `${spdKts} kts`);
      setText(nodes.fuel, 'fuel', `${Math.max(0, Math.round(state.fuel))}%`);
      setWidth(nodes.fuelBar, 'fuelBar', state.fuel);
      if (nodes.fuelBar) {
        nodes.fuelBar.style.background = state.fuel <= 25 ? '#ff5d5d' : state.fuel <= 50 ? '#ffb84d' : '#7dffa8';
      }
      setText(nodes.hdg, 'hdg', `${String(Math.round(p.heading)).padStart(3, '0')}°`);
      if (nodes.compassNeedle) {
        nodes.compassNeedle.style.transform = `rotate(${p.heading}deg)`;
      }
      setText(nodes.score, 'score', state.score.toLocaleString('en-US'));
      const comboText = state.combo > 1 ? `COMBO x${state.combo}` : '';
      setText(nodes.combo, 'combo', comboText);
      setText(nodes.rings, 'rings', `RINGS ${state.ringsPassed}/${state.ringsTotal}`);
      const stage = CONFIG.stages[state.stageIndex];
      setText(nodes.stage, 'stage', stage ? stage.name : '');
      const objectives = [
        `Rings ${state.ringsPassed}/${state.ringsTotal}`,
        `Fuel ${Math.max(0, Math.round(state.fuel))}%`,
        state.stageIndex >= 2 ? 'Land on the DPS runway' : 'Reach Denpasar (DPS)',
      ];
      setText(nodes.mission, 'mission', objectives.join('  •  '));
      const next = state.world.rings.find((r) => !r.passed && !r.missed && r.atNm > state.distanceNm);
      setText(
        nodes.nextRing,
        'next',
        next ? `NEXT RING ${(next.atNm - state.distanceNm).toFixed(1)} nm` : 'NO RINGS AHEAD',
      );
      const progress = Math.min(1, state.distanceNm / CONFIG.routeLengthNm);
      if (nodes.routeDot) {
        nodes.routeDot.style.left = `${4 + progress * 92}%`;
      }
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
        drawRadar(nodes.radar, state);
      }
    },
  };
}
