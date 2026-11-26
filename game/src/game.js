// Nusantara Skies — game state, flight physics and scoring. One clear
// job: own the simulation. It reads input, steps the plane, checks rings,
// fuel, storm and the landing, and reports what happened. It draws
// nothing; render.js does that.
import { CONFIG } from './config.js';
import { buildWorld } from './world.js';

export const PHASE = {
  TITLE: 'title',
  BRIEFING: 'briefing',
  FLYING: 'flying',
  PAUSED: 'paused',
  LANDED: 'landed',
  CRASHED: 'crashed',
};

export function createGame(seed) {
  const world = buildWorld(seed);
  const state = {
    seed,
    world,
    phase: PHASE.TITLE,
    tick: 0,
    time: 0,
    // Plane: x is lateral (-1..1), alt is altitude (0 = sea, 1 = high)
    plane: { x: 0, alt: 0.55, heading: 273, speedKts: 0, throttle: 0 },
    distanceNm: 0,
    fuel: 100,
    hull: CONFIG.hullMax,
    score: 0,
    combo: 0,
    bestCombo: 0,
    ringsPassed: 0,
    ringsTotal: world.rings.length,
    stageIndex: 0,
    stageCardUntil: 0,
    toast: null, // { text, sub, until, kind }
    events: [], // { tick, type, ... } — consumed by render/audio
    flash: 0, // lightning flash 0..1
    lightningAt: -1,
    landed: false,
    endReason: null,
    stats: null,
    muted: false,
  };

  function currentStage() {
    return CONFIG.stages[state.stageIndex];
  }

  function showToast(text, sub, seconds, kind = 'info') {
    state.toast = { text, sub: sub || '', until: state.time + seconds, kind };
  }

  function emit(type, data) {
    state.events.push({ tick: state.tick, type, ...(data || {}) });
  }

  function startFlight() {
    state.phase = PHASE.BRIEFING;
    state.time = 0;
    state.tick = 0;
    state.distanceNm = 0;
    state.fuel = 100;
    state.hull = CONFIG.hullMax;
    state.score = 0;
    state.combo = 0;
    state.bestCombo = 0;
    state.ringsPassed = 0;
    state.stageIndex = 0;
    state.plane.x = 0;
    state.plane.alt = 0.55;
    state.plane.heading = 273;
    state.plane.speedKts = 0;
    state.plane.throttle = 0;
    for (const ring of world.rings) {
      ring.passed = false;
      ring.missed = false;
    }
    state.stageCardUntil = 2.6;
    showToast(currentStage().name, currentStage().briefing, 2.6, 'stage');
    emit('start');
  }

  function finishFlight(won, reason) {
    state.phase = won ? PHASE.LANDED : PHASE.CRASHED;
    state.endReason = reason;
    // Touchdown quality (focus item 5): the landing is scored on
    // alignment + height at the threshold — PERFECT needs centreline
    // and low, GOOD is inside the window, ROUGH is a wobble in.
    // Deterministic: a pure function of the sim state.
    const p = state.plane;
    const touchdown =
      won && Math.abs(p.x) < 0.08 && p.alt < 0.2
        ? 'PERFECT'
        : won && Math.abs(p.x) < 0.14 && p.alt < 0.25
          ? 'GOOD'
          : won
            ? 'ROUGH'
            : null;
    const touchdownBonus = touchdown === 'PERFECT' ? 300 : touchdown === 'GOOD' ? 150 : 0;
    const landingBonus = won
      ? Math.round(state.fuel) * CONFIG.landingFuelBonusPerPct +
        Math.round(state.hull) * CONFIG.landingHullBonusPerPct +
        touchdownBonus
      : 0;
    if (won) {
      state.score += landingBonus;
      showToast(
        touchdown === 'PERFECT' ? 'PERFECT LANDING!' : touchdown === 'GOOD' ? 'GOOD LANDING' : 'ROUGH LANDING',
        `Touchdown bonus +${touchdownBonus}`,
        2.5,
        'good',
      );
    }
    state.stats = {
      score: state.score,
      rings: state.ringsPassed,
      ringsTotal: state.ringsTotal,
      fuelLeft: Math.max(0, Math.round(state.fuel)),
      hullLeft: Math.max(0, Math.round(state.hull)),
      timeSec: Math.round(state.time),
      bestCombo: state.bestCombo,
      landingBonus,
      touchdown,
      touchdownBonus,
      rank:
        state.score >= 9000
          ? 'S'
          : state.score >= 6500
            ? 'A'
            : state.score >= 4000
              ? 'B'
              : 'C',
    };
    emit(won ? 'landed' : 'crashed', { reason });
  }

  function updateFlying(dt, input) {
    const p = state.plane;

    // Throttle ramps toward cruise; boost pushes past it.
    const target = input.boost ? 1 : 0.72;
    p.throttle += (target - p.throttle) * Math.min(1, dt * 1.2);
    p.speedKts = CONFIG.minSpeedKts + (CONFIG.boostSpeedKts - CONFIG.minSpeedKts) * p.throttle;

    // Steering: bank changes heading and lateral position.
    const steer = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    state.lastSteer = steer;
    if (input.pointerDown && input.pointerX !== null) {
      const want = input.pointerX * 2 - 1;
      p.x += (want - p.x) * Math.min(1, dt * 3);
    } else {
      p.x += steer * CONFIG.steerRate * dt;
    }
    p.x = Math.max(-1, Math.min(1, p.x));
    p.heading += steer * 14 * dt;
    if (p.heading >= 360) p.heading -= 360;
    if (p.heading < 0) p.heading += 360;

    // Climb / descend.
    const climb = (input.up ? 1 : 0) - (input.down ? 1 : 0);
    state.lastClimb = climb;
    p.alt += climb * CONFIG.climbRate * dt;
    p.alt = Math.max(0.12, Math.min(0.95, p.alt));

    // Forward motion and fuel.
    const nmPerSec = CONFIG.nmPerSecondAtCruise * (p.speedKts / CONFIG.cruiseSpeedKts);
    state.distanceNm += nmPerSec * dt;
    const drain = input.boost ? CONFIG.fuelDrainBoost : CONFIG.fuelDrainCruise;
    state.fuel -= drain * dt;
    if (state.fuel <= 25 && state.fuel + drain * dt > 25) {
      showToast('LOW FUEL', 'Ease off the boost — find a green ring.', 2.2, 'warn');
      emit('alarm');
    }

    // Stage tracking.
    const stage = currentStage();
    if (state.distanceNm >= stage.toNm && state.stageIndex < CONFIG.stages.length - 1) {
      state.stageIndex++;
      state.stageCardUntil = state.time + 2.6;
      showToast(currentStage().name, currentStage().briefing, 2.6, 'stage');
      emit('stage', { stage: currentStage().id });
    }

    // Lightning in the storm stage: a flash every few seconds of flight.
    if (currentStage().sky === 'storm') {
      const period = 3.7;
      const cycle = state.time % period;
      if (cycle < 0.18 && state.lightningAt !== Math.floor(state.time / period)) {
        state.lightningAt = Math.floor(state.time / period);
        state.flash = 1;
        emit('thunder');
      }
    }
    if (state.flash > 0) state.flash = Math.max(0, state.flash - dt * 3);

    // Rings: score the one reaching the plane.
    for (const ring of world.rings) {
      if (ring.passed || ring.missed) continue;
      const ahead = ring.atNm - state.distanceNm;
      if (ahead > 0.6) continue;
      if (ahead < -1.2) {
        ring.missed = true;
        state.combo = 0;
        showToast('RING MISSED', 'Combo lost.', 1.4, 'warn');
        emit('miss');
        continue;
      }
      if (ahead <= 0.15) {
        const dx = Math.abs(p.x - ring.x);
        const dAlt = Math.abs(p.alt - ring.alt);
        if (dx < 0.3 && dAlt < 0.3) {
          ring.passed = true;
          ring.passedTick = state.tick;
          state.ringsPassed++;
          state.combo++;
          state.bestCombo = Math.max(state.bestCombo, state.combo);
          const gain = CONFIG.ringScore + (state.combo - 1) * CONFIG.ringComboStep;
          state.score += gain;
          if (ring.fuel) {
            state.fuel = Math.min(100, state.fuel + CONFIG.fuelRingRefill);
            showToast(`RING +${gain}`, `COMBO x${state.combo}  •  FUEL +${CONFIG.fuelRingRefill}%`, 1.6, 'good');
            emit('fuel');
          } else {
            showToast(
              dx < 0.12 && dAlt < 0.12 ? 'PERFECT RING!' : `RING +${gain}`,
              state.combo > 1 ? `COMBO x${state.combo}` : '',
              1.5,
              'good',
            );
          }
          emit('ring', { gain, combo: state.combo });
        } else if (dx < 0.45 && dAlt < 0.45) {
          ring.passed = true;
          ring.passedTick = state.tick;
          state.ringsPassed++;
          state.score += CONFIG.nearMissBonus;
          showToast(`NEAR MISS +${CONFIG.nearMissBonus}`, 'Close — thread it clean next time.', 1.4, 'info');
          emit('ring', { gain: CONFIG.nearMissBonus, combo: state.combo });
        }
      }
    }

    // Storm cells: flying through one shreds the hull.
    for (const cell of world.stormCells) {
      const ahead = cell.atNm - state.distanceNm;
      if (Math.abs(ahead) > 0.9) continue;
      const dx = Math.abs(p.x - cell.x);
      const dAlt = Math.abs(p.alt - cell.alt);
      if (dx < CONFIG.stormCellRadius * cell.size && dAlt < 0.32) {
        state.hull -= CONFIG.stormCellDamage;
        state.combo = 0;
        showToast('LIGHTNING STRIKE!', `Hull ${Math.max(0, Math.round(state.hull))}%`, 1.8, 'warn');
        emit('hit');
        // Push the cell aside so it only hits once.
        cell.x = cell.x > 0 ? 1.4 : -1.4;
      }
    }

    // Landing: the runway is at the end of the route. Focus item 5:
    // landing is more demanding now — centreline within 0.18 and low
    // (alt under 0.28) — but the HUD landing guide (glidepath +
    // speed + alignment) shows the whole final approach, so the
    // pilot can set up early instead of guessing at the threshold.
    if (state.distanceNm >= CONFIG.routeLengthNm - 0.4) {
      const aligned = Math.abs(p.x) < 0.18;
      const low = p.alt < 0.28;
      if (aligned && low) {
        state.landed = true;
        finishFlight(true, 'landed');
      } else if (state.distanceNm >= CONFIG.routeLengthNm + 1.5) {
        finishFlight(false, 'overshot');
      }
    }

    // Out of fuel / hull gone.
    if (state.fuel <= 0) {
      state.fuel = 0;
      finishFlight(false, 'fuel');
    } else if (state.hull <= 0) {
      state.hull = 0;
      finishFlight(false, 'hull');
    }
  }

  // One fixed step. Returns the events that happened this step.
  function step(dt, input) {
    state.events = [];
    state.tick++;
    if (state.phase === PHASE.BRIEFING) {
      state.time += dt;
      if (state.time >= 2.6) {
        state.phase = PHASE.FLYING;
        state.time = 0;
        state.tick = 0;
      }
      return state.events;
    }
    if (state.phase !== PHASE.FLYING) return state.events;
    state.time += dt;
    updateFlying(dt, input);
    return state.events;
  }

  return {
    state,
    PHASE,
    startFlight,
    step,
    currentStage,
    showToast,
    // Test / screenshot helper: put the plane at an exact spot.
    setFlight(distanceNm, alt, x, score, ringsPassed, fuel) {
      state.distanceNm = distanceNm;
      state.plane.alt = alt;
      state.plane.x = x;
      state.plane.speedKts = CONFIG.cruiseSpeedKts;
      state.plane.throttle = 0.72;
      state.score = score;
      state.fuel = fuel;
      for (const ring of world.rings) {
        if (ring.atNm < distanceNm) {
          ring.passed = true;
        }
      }
      state.ringsPassed = ringsPassed;
      state.combo = 3;
      state.bestCombo = 3;
      const stageIdx = CONFIG.stages.findIndex((s) => distanceNm < s.toNm);
      state.stageIndex = stageIdx === -1 ? CONFIG.stages.length - 1 : stageIdx;
    },
  };
}
