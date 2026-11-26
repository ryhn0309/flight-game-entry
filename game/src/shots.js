// The screenshot scenes behind ?shot=takeoff|rings|sunset|landing.
// Each one places the plane on the real course at a fixed moment — takeoff roll on the
// runway, threading a ring over the sea, a golden-hour cruise past the volcano, and the
// final approach with the gear down — then paints it twice and sets window.__shotReady
// for the screenshot. The frames are what the game really draws; only the moment is staged.

import { createFlight, stepFlight, PHASE } from './physics.js';
import { SCREEN_PLAY } from './render.js';
import { STEP } from './config.js';

/** Place the flight at a named moment. Returns the screen to draw. */
export function stageShot(name, world) {
  const flight = createFlight(world);
  flight.phase = PHASE.FLYING;
  flight.best = 0;
  if (name === 'rings') {
    // Mid-course: banking through ring 4, volcano beyond.
    flight.x = 750;
    flight.z = -350;
    flight.y = 480;
    flight.headingDeg = 239;
    flight.pitchDeg = -2;
    flight.rollDeg = -24;
    flight.speed = 68;
    flight.throttle = 0.72;
    flight.fuel = 78;
    flight.ringsPassed = 3;
    flight.score = 300;
    flight.time = 74;
    flight.gearDown = false;
    flight.onGround = false;
    flight.message = 'RING 4/10  +100';
    flight.messageUntil = 99999;
  } else if (name === 'sunset') {
    // Golden-hour cruise east of the islands: volcano and sun ahead, sea below.
    flight.x = 1500;
    flight.z = 300;
    flight.y = 600;
    flight.headingDeg = 245;
    flight.pitchDeg = 0;
    flight.rollDeg = 6;
    flight.speed = 74;
    flight.throttle = 0.66;
    flight.fuel = 61;
    flight.ringsPassed = 5;
    flight.score = 500;
    flight.time = 132;
    flight.gearDown = false;
    flight.onGround = false;
  } else if (name === 'landing') {
    // Short final: lined up on the runway from the north, gear down, flaps out.
    flight.x = 200;
    flight.z = 150;
    flight.y = 70;
    flight.headingDeg = 90;
    flight.pitchDeg = -4;
    flight.rollDeg = 0;
    flight.speed = 42;
    flight.throttle = 0.38;
    flight.fuel = 44;
    flight.ringsPassed = 10;
    flight.score = 1000;
    flight.time = 208;
    flight.gearDown = true;
    flight.flaps = true;
    flight.onGround = false;
    flight.message = 'COURSE CLEAR — LAND ON THE RUNWAY';
    flight.messageUntil = 99999;
  } else {
    // takeoff: climbing out south down the strip, sea ahead past the coast.
    flight.x = 200;
    flight.z = 700;
    flight.y = 90;
    flight.headingDeg = 90;
    flight.pitchDeg = 8;
    flight.rollDeg = 0;
    flight.speed = 58;
    flight.throttle = 1;
    flight.fuel = 96;
    flight.ringsPassed = 0;
    flight.score = 0;
    flight.time = 9;
    flight.gearDown = true;
    flight.onGround = false;
  }
  // Settle a few fixed steps so the instruments and the world agree.
  for (let i = 0; i < 12; i += 1) {
    stepFlight(flight, world, { pitch: 0, roll: 0, throttle: 0, brake: false, toggleGear: false, toggleFlaps: false }, STEP);
    if (flight.phase !== PHASE.FLYING) break;
  }
  return { flight, screen: SCREEN_PLAY };
}
