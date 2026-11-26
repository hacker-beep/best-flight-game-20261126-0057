// Nusantara Skies — deterministic screenshot states. One clear job:
// stage the exact scene each screenshot shows, from a fixed seed and a
// fixed number of simulation ticks, so a screenshot is reproducible.
// The screenshots are real renders of the game; these states only pick
// where in the flight the camera looks.
import { CONFIG } from './config.js';
import { PHASE } from './game.js';

// Scripted pilot: steers toward the nearest unpassed ring. Used by the
// attract mode and by the staged shots, never by the real player.
export function autopilotInput(state) {
  const next = state.world.rings.find((r) => !r.passed && !r.missed && r.atNm > state.distanceNm);
  if (!next) {
    return { left: false, right: false, up: false, down: false, boost: false, pointerDown: false, pointerX: null };
  }
  const p = state.plane;
  return {
    left: p.x > next.x + 0.05,
    right: p.x < next.x - 0.05,
    up: p.alt < next.alt - 0.05,
    down: p.alt > next.alt + 0.05,
    boost: false,
    pointerDown: false,
    pointerX: null,
  };
}

// Stage one shot, then run a fixed number of ticks so the scene is
// fully settled. Returns how many ticks to run.
export function applyShot(game, name) {
  const state = game.state;
  if (name === 'play') {
    game.startFlight();
    game.setFlight(20, 0.6, 0, 12450, 5, 78);
    state.phase = PHASE.FLYING;
    state.time = 100;
    // Line the plane up with the next ring so the cover shows level
    // flight straight at the ring, not a hard bank.
    const next = state.world.rings.find((r) => !r.passed && r.atNm > state.distanceNm);
    if (next) {
      state.plane.x = next.x;
      state.plane.alt = next.alt;
    }
    game.showToast('RING +500', 'COMBO x3  •  FUEL 78%', 999, 'good');
    return { ticks: 150, autopilot: true };
  }
  if (name === 'storm') {
    game.startFlight();
    game.setFlight(58, 0.55, 0.05, 9800, 7, 64);
    state.phase = PHASE.FLYING;
    state.time = 100;
    state.flash = 0.85;
    game.showToast('STORM AHEAD!', 'Thread the gap — dodge the lightning cells.', 999, 'warn');
    return { ticks: 90, autopilot: true };
  }
  if (name === 'approach') {
    game.startFlight();
    game.setFlight(112, 0.32, 0.02, 15200, 11, 55);
    state.phase = PHASE.FLYING;
    state.time = 100;
    game.showToast('FINAL APPROACH', 'DPS runway ahead — gear down, nice and easy.', 999, 'good');
    return { ticks: 90, autopilot: true };
  }
  if (name === 'end') {
    game.startFlight();
    // Park the plane just short of the runway so the victory screen
    // sits over the sunset approach, not inside the control tower.
    game.setFlight(116, 0.18, 0.0, 16900, 12, 41);
    state.phase = PHASE.LANDED;
    state.endReason = 'landed';
    state.toast = null; // drop the stage-1 briefing toast
    const landingBonus = 41 * CONFIG.landingFuelBonusPerPct + 100 * CONFIG.landingHullBonusPerPct;
    state.score += landingBonus;
    state.stats = {
      score: state.score,
      rings: 12,
      ringsTotal: 12,
      fuelLeft: 41,
      hullLeft: 100,
      timeSec: 167,
      bestCombo: 5,
      landingBonus,
      rank: 'S',
    };
    return { ticks: 0, autopilot: false };
  }
  // 'start' (the title) and anything else: attract mode over the islands.
  state.phase = PHASE.TITLE;
  return { ticks: 150, autopilot: true };
}
