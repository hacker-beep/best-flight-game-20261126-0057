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
    // v5 (round 3): ONE variable — the cover is now a NAMED
    // Nusantara moment: low over a turquoise lagoon, flying at ring
    // #5 (32.14 nm) with the BIGGEST stage-1 island (29.91 nm,
    // size 1.52, cliffs + palms) close on the left and the ring
    // ahead over the shallows. (v5.0 tried ring #6 at 33 nm: the
    // ring sat high behind the toast and the mountain at 40.05 nm
    // read as a small brown blob — the karst never landed.)
    // Stage 1, 26.5 nm out: 4 rings passed, next ring #5 at 32.14.
    // v5.1: only 60 settle ticks (capture ~27.4 nm) so the big
    // island at 29.91 nm sits ~2.5 nm ahead — prominent on the left,
    // not under the plane. (v5.0 used 150 ticks: capture 28.9 nm,
    // the island 1 nm ahead filled the whole bottom of the frame
    // and the plane looked about to crash into it.)
    game.setFlight(26.5, 0.55, 0, 11950, 4, 78);
    state.phase = PHASE.FLYING;
    state.time = 100;
    // v5.2: park the plane RIGHT of the ring (x = ring.x + 0.30)
    // so the big island (29.91 nm, x=-0.45) falls clearly LEFT of
    // the flight line instead of under the plane, and the ring sits
    // upper-left, clear of the tail fin. Plane alt 0.55 lifts the
    // ring's top arc clear of the toast (v5.1: alt 0.45 put the ring
    // centre at ~300 px, top arc hidden behind the toast).
    const next = state.world.rings.find((r) => !r.passed && r.atNm > state.distanceNm);
    if (next) {
      state.plane.x = next.x + 0.3;
      state.plane.alt = 0.55;
    }
    game.showToast('WAYAG — RAJA AMPAT', 'RING 5 OF 12  •  +500  •  COMBO x3  •  FUEL 78%', 999, 'good');
    return { ticks: 60, autopilot: false };
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
