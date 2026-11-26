// Nusantara Skies — boot and the main loop. One clear job: wire the
// pieces together (game, scene, HUD, input, audio, globe) and run the
// simulation on a fixed 1/60 s clock, so the flight plays out the same
// way on every machine. No game logic lives here.
import { createGame, PHASE } from './game.js';
import { createScene } from './render3d.js';
import { createInput } from './input.js';
import { createAudio } from './audio.js';
import { createHud } from './hud.js';
import { createGlobe } from './globe.js';
import { applyShot, autopilotInput } from './shots.js';
import { CONFIG } from './config.js';

const params = new URLSearchParams(window.location.search);
const seed = Number(params.get('seed') || 20261126);
const shotName = params.get('shot') || null;

const canvas = document.getElementById('scene');
const game = createGame(seed);
const state = game.state;
const scene = createScene(canvas, seed);
scene.buildWorldMeshes(state.world);
const input = createInput(canvas);
const audio = createAudio();
const hud = createHud();
const globe = createGlobe(document.getElementById('globe-canvas'));

const DT = 1 / 60;
let accumulator = 0;
let lastNow = performance.now();
let attractTime = 0;

function showScreen(id) {
  for (const name of ['screen-title', 'screen-pause', 'screen-end', 'screen-map']) {
    const node = document.getElementById(name);
    if (node) node.classList.toggle('hidden', name !== id);
  }
  document.getElementById('hud').classList.toggle('hidden', id === 'screen-title');
}

function showEndScreen() {
  const s = state.stats;
  const title = document.getElementById('end-title');
  const sub = document.getElementById('end-sub');
  const stats = document.getElementById('end-stats');
  if (state.phase === PHASE.LANDED) {
    title.textContent = 'FLIGHT COMPLETE!';
    title.className = 'end-title good';
    sub.textContent = 'You landed on the DPS runway. Nusantara Skies thanks you for flying.';
  } else {
    title.textContent = state.endReason === 'fuel' ? 'OUT OF FUEL' : state.endReason === 'hull' ? 'HULL BREACH' : 'FLIGHT OVER';
    title.className = 'end-title bad';
    sub.textContent = 'The flight ended short of Denpasar. Fly it again — the islands are waiting.';
  }
  const mm = Math.floor(s.timeSec / 60);
  const ss = String(s.timeSec % 60).padStart(2, '0');
  stats.innerHTML =
    `<div><span>SCORE</span><b>${s.score.toLocaleString('en-US')}</b></div>` +
    `<div><span>RANK</span><b>${s.rank}</b></div>` +
    `<div><span>RINGS</span><b>${s.rings}/${s.ringsTotal}</b></div>` +
    `<div><span>FUEL LEFT</span><b>${s.fuelLeft}%</b></div>` +
    `<div><span>BEST COMBO</span><b>x${s.bestCombo}</b></div>` +
    `<div><span>TIME</span><b>${mm}:${ss}</b></div>` +
    (s.landingBonus ? `<div><span>LANDING BONUS</span><b>+${s.landingBonus}</b></div>` : '');
  showScreen('screen-end');
}

function handleEvents(events) {
  for (const event of events) {
    if (event.type === 'ring') audio.ring(event.combo || 1);
    else if (event.type === 'fuel') audio.fuel();
    else if (event.type === 'alarm') audio.alarm();
    else if (event.type === 'thunder') audio.thunder();
    else if (event.type === 'hit') audio.alarm();
    else if (event.type === 'landed') audio.fanfare();
    else if (event.type === 'crashed') audio.crash();
  }
}

function resetAttract() {
  state.distanceNm = 0;
  state.fuel = 100;
  state.hull = CONFIG.hullMax;
  state.score = 0;
  state.combo = 0;
  state.stageIndex = 0;
  state.flash = 0;
  for (const ring of state.world.rings) {
    ring.passed = false;
    ring.missed = false;
  }
}

function stepSimulation() {
  const presses = input.consumePresses();
  if (presses.mute) {
    audio.toggleMute();
  }
  if (state.phase === PHASE.TITLE) {
    // Attract mode: the plane flies itself behind the title screen.
    attractTime += DT;
    const savedPhase = state.phase;
    state.phase = PHASE.FLYING;
    const events = game.step(DT, autopilotInput(state));
    handleEvents(events);
    state.phase = savedPhase;
    if (state.distanceNm > 30) resetAttract();
    if (presses.start) {
      audio.unlock();
      game.startFlight();
      showScreen(null);
    }
    return;
  }
  if (state.phase === PHASE.BRIEFING) {
    game.step(DT, input);
    return;
  }
  if (state.phase === PHASE.FLYING) {
    if (presses.pause) {
      state.phase = PHASE.PAUSED;
      showScreen('screen-pause');
      return;
    }
    const events = game.step(DT, input);
    handleEvents(events);
    audio.setThrottle(state.plane.throttle);
    if (state.phase === PHASE.LANDED || state.phase === PHASE.CRASHED) {
      showEndScreen();
    }
    if (presses.restart) {
      game.startFlight();
      showScreen(null);
    }
    return;
  }
  if (state.phase === PHASE.PAUSED) {
    if (presses.pause || presses.start) {
      state.phase = PHASE.FLYING;
      showScreen(null);
    }
    if (presses.restart) {
      game.startFlight();
      showScreen(null);
    }
    return;
  }
  if (state.phase === PHASE.LANDED || state.phase === PHASE.CRASHED) {
    if (presses.restart || presses.start) {
      game.startFlight();
      showScreen(null);
    }
  }
}

function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  scene.resize(w, h);
  const globeCanvas = document.getElementById('globe-canvas');
  if (globe.open) globe.resize(globeCanvas.clientWidth, globeCanvas.clientHeight);
}
window.addEventListener('resize', resize);
resize();

// Buttons.
document.getElementById('btn-start').addEventListener('click', () => {
  audio.unlock();
  game.startFlight();
  showScreen(null);
});
document.getElementById('btn-how').addEventListener('click', () => {
  const how = document.getElementById('how-to');
  how.classList.toggle('hidden');
});
document.getElementById('btn-route').addEventListener('click', () => {
  globe.show();
  showScreen('screen-map');
  const globeCanvas = document.getElementById('globe-canvas');
  globe.resize(globeCanvas.clientWidth, globeCanvas.clientHeight);
});
document.getElementById('btn-close-map').addEventListener('click', () => {
  globe.hide();
  showScreen(state.phase === PHASE.TITLE ? 'screen-title' : null);
});
document.getElementById('btn-resume').addEventListener('click', () => {
  state.phase = PHASE.FLYING;
  showScreen(null);
});
document.getElementById('btn-restart').addEventListener('click', () => {
  game.startFlight();
  showScreen(null);
});
document.getElementById('btn-fly-again').addEventListener('click', () => {
  game.startFlight();
  showScreen(null);
});
document.getElementById('btn-pause').addEventListener('click', () => {
  if (state.phase === PHASE.FLYING) {
    state.phase = PHASE.PAUSED;
    showScreen('screen-pause');
  }
});
document.getElementById('btn-mute').addEventListener('click', () => {
  const muted = audio.toggleMute();
  document.getElementById('btn-mute').textContent = muted ? 'SOUND OFF' : 'SOUND ON';
});
document.getElementById('btn-map').addEventListener('click', () => {
  globe.show();
  showScreen('screen-map');
  const globeCanvas = document.getElementById('globe-canvas');
  globe.resize(globeCanvas.clientWidth, globeCanvas.clientHeight);
});
window.addEventListener('keydown', (event) => {
  if (event.code === 'Tab') {
    event.preventDefault();
    if (globe.open) {
      globe.hide();
      showScreen(state.phase === PHASE.TITLE ? 'screen-title' : null);
    } else {
      globe.show();
      showScreen('screen-map');
      const globeCanvas = document.getElementById('globe-canvas');
      globe.resize(globeCanvas.clientWidth, globeCanvas.clientHeight);
    }
  }
});

// Shot staging: run a fixed number of ticks, then freeze the sim so
// the screenshot is reproducible.
let shotFrozen = false;
let shotStaged = false;
if (shotName) {
  const plan = applyShot(game, shotName);
  if (shotName === 'end') showEndScreen();
  else if (shotName === 'start') showScreen('screen-title');
  else showScreen(null);
  for (let i = 0; i < plan.ticks; i++) {
    const savedPhase = state.phase;
    if (savedPhase === PHASE.TITLE) state.phase = PHASE.FLYING;
    const events = game.step(DT, plan.autopilot ? autopilotInput(state) : input);
    handleEvents(events);
    if (savedPhase === PHASE.TITLE) state.phase = savedPhase;
    if (state.distanceNm > 30 && savedPhase === PHASE.TITLE) resetAttract();
  }
  shotFrozen = true;
  shotStaged = true;
} else {
  showScreen('screen-title');
}

// Determinism hook for the self-check: a hash of the exact sim state.
window.__stateHash = function stateHash() {
  const p = state.plane;
  const raw = [
    state.tick,
    state.distanceNm.toFixed(4),
    state.score,
    p.x.toFixed(4),
    p.alt.toFixed(4),
    state.fuel.toFixed(3),
    state.ringsPassed,
    state.stageIndex,
  ].join('|');
  let h = 2166136261;
  for (let i = 0; i < raw.length; i++) {
    h ^= raw.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16);
};
window.__game = game;
window.__scene = scene;

function frame(now) {
  const elapsed = Math.min(0.25, (now - lastNow) / 1000);
  lastNow = now;
  if (!shotFrozen) {
    accumulator += elapsed;
    let steps = 0;
    while (accumulator >= DT && steps < 5) {
      stepSimulation();
      accumulator -= DT;
      steps++;
    }
    if (steps === 5) accumulator = 0;
  }
  scene.update(state, DT, (state.tick * DT) + attractTime);
  hud.update(state);
  if (globe.open) {
    globe.render(state.distanceNm / CONFIG.routeLengthNm, DT);
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// Signal the screenshot harness that the first frame is up.
requestAnimationFrame(() => {
  setTimeout(() => {
    window.__ready = true;
  }, 700);
});
