// Merapi Sky Run — flight model and game state.
// Arcade physics with real flavour: banked turns, stall, flaps, gear, fuel, and a runway
// that only accepts a gentle, lined-up touchdown.

import { PLANE, RINGS, SCORE, STEP } from './config.js';
import { RUNWAY, onRunway } from './world.js';

export const PHASE = {
  TITLE: 'title',
  FLYING: 'flying',
  PAUSED: 'paused',
  CRASHED: 'crashed',
  LANDED: 'landed',
  OUT_OF_FUEL: 'out-of-fuel',
};

const DEG = Math.PI / 180;

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

/** Fresh flight state, sitting on the runway threshold, engine idling. */
export function createFlight(world) {
  // The strip runs along the runway heading: start at its far end, nose down the strip.
  const start = {
    x: RUNWAY.cx,
    z: RUNWAY.cz - (RUNWAY.length / 2 - 40),
    y: RUNWAY.height + 1.5,
  };
  return {
    phase: PHASE.TITLE,
    x: start.x, y: start.y, z: start.z,
    headingDeg: RUNWAY.headingDeg,
    pitchDeg: 0,
    rollDeg: 0,
    speed: 0,
    verticalSpeed: 0,
    throttle: 0,
    fuel: PLANE.fuelStart,
    gearDown: true,
    flaps: false,
    ringsPassed: 0,
    score: 0,
    time: 0,
    message: '',
    messageUntil: 0,
    crashReason: '',
    landedAt: null,
    best: 0,
    stalled: false,
    onGround: true,
    // Per-frame stick input, set by input.js: -1..1.
    stickPitch: 0,
    stickRoll: 0,
  };
}

/** Reset a flight to the runway for another try. */
export function resetFlight(state, world) {
  const fresh = createFlight(world);
  fresh.best = state.best;
  fresh.phase = PHASE.FLYING;
  fresh.throttle = 0.55;
  return fresh;
}

/** Where the next ring is, or null once the course is done. */
export function nextRing(state, world) {
  return state.ringsPassed < world.rings.length ? world.rings[state.ringsPassed] : null;
}

/** Distance from the plane to a point, metres. */
function distanceTo(state, p) {
  const dx = p.x - state.x;
  const dy = p.y - state.y;
  const dz = p.z - state.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function flash(state, text, seconds = 2.2) {
  state.message = text;
  state.messageUntil = state.time + seconds;
}

/** One fixed step of the flight model. `input` carries the stick and switches. */
export function stepFlight(state, world, input, dt = STEP) {
  if (state.phase !== PHASE.FLYING) return;
  state.time += dt;

  // --- Switches -----------------------------------------------------------
  if (input.toggleGear) state.gearDown = !state.gearDown;
  if (input.toggleFlaps) state.flaps = !state.flaps;
  if (input.brake) state.throttle = Math.max(0, state.throttle - dt * 1.4);

  // --- Throttle -----------------------------------------------------------
  state.throttle = clamp(state.throttle + input.throttle * dt * 0.7, 0, 1);
  if (state.fuel <= 0) state.throttle = 0;

  // --- Attitude -----------------------------------------------------------
  const pitchTarget = clamp(input.pitch * PLANE.pitchMax, PLANE.pitchMin, PLANE.pitchMax);
  const rollTarget = clamp(input.roll * PLANE.rollMax, -PLANE.rollMax, PLANE.rollMax);
  const pitchRate = PLANE.pitchRate * dt;
  const rollRate = PLANE.rollRate * dt;
  state.pitchDeg += clamp(pitchTarget - state.pitchDeg, -pitchRate, pitchRate);
  state.rollDeg += clamp(rollTarget - state.rollDeg, -rollRate, rollRate);

  // --- Speed --------------------------------------------------------------
  const stall = state.flaps ? PLANE.stallFlaps : PLANE.stallClean;
  const drag = state.gearDown ? 0.16 : 0;
  const targetSpeed = state.throttle * PLANE.maxSpeed * (1 - drag) - state.pitchDeg * PLANE.pitchSpeed;
  state.speed += clamp(targetSpeed - state.speed, -dt * 26, dt * 14);
  if (state.speed < 0) state.speed = 0;

  // --- Stall --------------------------------------------------------------
  state.stalled = state.speed < stall && !state.onGround;
  if (state.stalled) {
    state.pitchDeg = Math.max(state.pitchDeg - dt * 30, -18);
    state.verticalSpeed -= PLANE.stallSink * dt;
  }

  // --- Coordinated turn: bank turns the nose -------------------------------
  const turnRate = (9.81 * Math.tan(state.rollDeg * DEG)) / Math.max(state.speed, 12);
  state.headingDeg = (state.headingDeg + (turnRate * dt) / DEG + 360) % 360;

  // --- Motion ---------------------------------------------------------------
  const hd = state.headingDeg * DEG;
  const pd = state.pitchDeg * DEG;
  const forwardX = Math.cos(hd) * Math.cos(pd);
  const forwardY = Math.sin(pd);
  const forwardZ = Math.sin(hd) * Math.cos(pd);
  state.verticalSpeed = state.speed * forwardY + (state.stalled ? state.verticalSpeed * 0.5 : 0);
  state.x += forwardX * state.speed * dt;
  state.z += forwardZ * state.speed * dt;
  state.y += state.verticalSpeed * dt;

  // --- Fuel -----------------------------------------------------------------
  if (state.throttle > 0) {
    state.fuel = Math.max(0, state.fuel - state.throttle * PLANE.fuelDrain * dt);
    if (state.fuel <= 0 && state.phase === PHASE.FLYING) {
      flash(state, 'FUEL EMPTY — GLIDE TO THE RUNWAY', 4);
    }
  }

  // --- Rings ----------------------------------------------------------------
  const ring = nextRing(state, world);
  if (ring && distanceTo(state, ring) < RINGS.radius) {
    ring.passed = true;
    state.ringsPassed += 1;
    state.score += SCORE.ring;
    state.fuel = Math.min(100, state.fuel + PLANE.ringFuel);
    flash(state, `RING ${state.ringsPassed}/${world.rings.length}  +${SCORE.ring}`);
    if (state.ringsPassed === world.rings.length) {
      flash(state, 'COURSE CLEAR — LAND ON THE RUNWAY', 4);
    }
  }

  // --- Ground ---------------------------------------------------------------
  const ground = world.heightAt(state.x, state.z);
  const overSea = ground < world.seaLevel + 1;
  if (state.y <= ground + 1.2) {
    state.y = ground + 1.2;
    const linedUp = onRunway(state.x, state.z);
    const gentle = Math.abs(state.verticalSpeed) <= PLANE.landMaxSink;
    const inWindow = state.speed >= PLANE.landMinSpeed && state.speed <= PLANE.landMaxSpeed;
    const courseDone = state.ringsPassed >= world.rings.length;
    if (state.onGround) {
      // Already rolling after a good touchdown: keep decelerating, never re-judge.
      state.speed = Math.max(0, state.speed - dt * 22);
      state.pitchDeg = 0;
      state.rollDeg = 0;
      if (state.speed < 4) {
        state.phase = PHASE.LANDED;
        const fuelBonus = Math.round(state.fuel * 2);
        const timeBonus = courseDone ? Math.max(0, Math.round((SCORE.parSeconds - state.time) * SCORE.timeBonusPerSecond)) : 0;
        state.score += (courseDone ? SCORE.landingBase : 0) + fuelBonus + timeBonus;
        state.landedAt = { fuelBonus, timeBonus, courseDone, base: courseDone ? SCORE.landingBase : 0 };
      }
      return;
    }
    if (linedUp && state.gearDown && gentle && inWindow) {
      state.onGround = true;
      state.speed = Math.max(0, state.speed - dt * 22);
      state.pitchDeg = 0;
      state.rollDeg = 0;
      if (state.speed < 4) {
        state.phase = PHASE.LANDED;
        const fuelBonus = Math.round(state.fuel * 2);
        const timeBonus = courseDone ? Math.max(0, Math.round((SCORE.parSeconds - state.time) * SCORE.timeBonusPerSecond)) : 0;
        state.score += (courseDone ? SCORE.landingBase : 0) + fuelBonus + timeBonus;
        state.landedAt = { fuelBonus, timeBonus, courseDone, base: courseDone ? SCORE.landingBase : 0 };
      }
      return;
    }
    // Anything else touching the ground is a crash.
    state.phase = PHASE.CRASHED;
    if (overSea) state.crashReason = 'Ditched in the sea';
    else if (!state.gearDown && linedUp) state.crashReason = 'Belly landing — gear was up';
    else if (!gentle) state.crashReason = 'Too hard — the undercarriage gave way';
    else if (!inWindow) state.crashReason = state.speed > PLANE.landMaxSpeed ? 'Too fast to land' : 'Stalled onto the ground';
    else if (!linedUp) state.crashReason = 'Flew into the terrain';
    else state.crashReason = 'Crashed';
    return;
  }
  state.onGround = false;

  // --- Out of the world -----------------------------------------------------
  if (Math.abs(state.x) > 4200 || Math.abs(state.z) > 4200) {
    state.phase = PHASE.CRASHED;
    state.crashReason = 'Flew off the charts';
  }
  if (state.y > 2400) {
    state.y = 2400;
    state.pitchDeg = Math.min(state.pitchDeg, 0);
  }
}
