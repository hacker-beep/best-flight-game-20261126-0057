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
    // flight straight at the ring, not a hard bank. v3: park the
    // plane slightly below-left of the ring centre, so the dashed
    // ring frames the plane instead of hiding behind the fin.
    const next = state.world.rings.find((r) => !r.passed && r.atNm > state.distanceNm);
    if (next) {
      state.plane.x = next.x - 0.1;
      state.plane.alt = next.alt - 0.06;
    }
    game.showToast('RING +500', 'COMBO x3  •  FUEL 78%', 999, 'good');
    return { ticks: 150, autopilot: true };
  }
  if (name === 'storm') {
    game.startFlight();
    game.setFlight(58, 0.55, 0.05, 9800, 7, 64);
    state.phase = PHASE.FLYING;
    state.time = 100;
    // Stage the storm so a cell AND a branching bolt are in frame:
    // put the plane 2.5 nm short of the nearest storm cell ahead
    // (slightly offset so the cell is beside the plane, not behind
    // it) and set flash to full so the bolt is mid-flash in the shot.
    // v3.1: the v3 storm frame was empty grey-purple — no cell, no
    // lightning — because the plane was staged 5 nm from the cells
    // and the flash had decayed to zero by capture time.
    const nextCell = state.world.stormCells.find((c) => c.atNm > state.distanceNm);
    if (nextCell) {
      state.distanceNm = nextCell.atNm - 2.5;
      state.plane.x = Math.max(-0.6, Math.min(0.6, nextCell.x - 0.2));
      state.plane.alt = Math.max(0.3, Math.min(0.75, nextCell.alt + 0.12));
    }
    state.flash = 1.0;
    game.showToast('STORM AHEAD!', 'Thread the gap — dodge the lightning cells.', 999, 'warn');
    return { ticks: 90, autopilot: true };
  }
  if (name === 'approach') {
    game.startFlight();
    // Offset the plane further left of the centreline and park it
    // closer to the runway so the strip reads beside the plane, not
    // behind it — v3: the "09" numbers must be visible, not hidden
    // under the fuselage. v3.1: stage 5.5 nm out (not 4) so the whole
    // strip + threshold numbers fit above the bottom HUD instead of
    // sliding under the instruments — close enough that the "09"
    // still reads.
    game.setFlight(113.5, 0.32, -0.5, 15200, 11, 55);
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
    const landingBonus =
      41 * CONFIG.landingFuelBonusPerPct + 100 * CONFIG.landingHullBonusPerPct + 300;
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
      touchdown: 'PERFECT',
      touchdownBonus: 300,
      rank: 'S',
    };
    return { ticks: 0, autopilot: false };
  }
  // 'start' (the title) and anything else: attract mode over the islands.
  state.phase = PHASE.TITLE;
  return { ticks: 150, autopilot: true };
}
