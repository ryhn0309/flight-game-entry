// Merapi Sky Run — the game loop.
// Builds the world, owns the screen state, steps physics at a fixed 60 Hz, and draws.
// ?shot=takeoff|rings|sunset|landing stages a fixed moment for screenshots and sets
// window.__shotReady when the frame is painted.

import { createWorld } from './world.js';
import { createFlight, resetFlight, stepFlight, PHASE } from './physics.js';
import { createRenderer, SCREEN_TITLE, SCREEN_PLAY, SCREEN_PAUSED, SCREEN_OVER, SCREEN_LANDED } from './render.js';
import { createInput, ACTION_CONFIRM, ACTION_PAUSE, ACTION_RESTART } from './input.js';
import { createAudio } from './audio.js';
import { stageShot } from './shots.js';
import { STEP } from './config.js';

const canvas = document.getElementById('game');
const world = createWorld();
const renderer = createRenderer(canvas);
const input = createInput(canvas);
const audio = createAudio();

let flight = createFlight(world);
let screen = SCREEN_TITLE;
let best = 0;
try {
  best = Number(window.localStorage.getItem('merapi-sky-run-best') ?? 0) || 0;
} catch {
  best = 0;
}
let lastTime = performance.now();
let accumulator = 0;
let shotName = null;
let shotSettled = false;
let sunsetMode = false;

const params = new URLSearchParams(window.location.search);
shotName = params.get('shot');
if (params.get('sunset') === '1') sunsetMode = true;

function startFlight() {
  flight = resetFlight(flight, world);
  screen = SCREEN_PLAY;
  audio.unlock();
}

if (shotName) {
  const staged = stageShot(shotName, world);
  flight = staged.flight;
  screen = staged.screen;
  sunsetMode = shotName === 'sunset';
  window.__shotReady = false;
}

function handleActions() {
  const actions = input.takeActions();
  if (actions & ACTION_CONFIRM) {
    audio.unlock();
    if (screen === SCREEN_TITLE) startFlight();
    else if (screen === SCREEN_OVER || screen === SCREEN_LANDED) startFlight();
  }
  if (actions & ACTION_PAUSE) {
    if (screen === SCREEN_PLAY) screen = SCREEN_PAUSED;
    else if (screen === SCREEN_PAUSED) screen = SCREEN_PLAY;
  }
  if (actions & ACTION_RESTART) {
    if (screen !== SCREEN_TITLE) startFlight();
  }
}

function frame(nowMs) {
  const dtMs = Math.min(100, nowMs - lastTime);
  lastTime = nowMs;
  handleActions();

  if (screen === SCREEN_PLAY) {
    const stick = input.poll();
    const before = flight.phase;
    const ringsBefore = flight.ringsPassed;
    accumulator += dtMs / 1000;
    let guard = 0;
    while (accumulator >= STEP && guard < 8) {
      stepFlight(flight, world, stick, STEP);
      accumulator -= STEP;
      guard += 1;
    }
    if (flight.ringsPassed > ringsBefore) audio.ring();
    if (flight.phase === PHASE.CRASHED && before !== PHASE.CRASHED) {
      screen = SCREEN_OVER;
      audio.crash();
    } else if (flight.phase === PHASE.LANDED && before !== PHASE.LANDED) {
      screen = SCREEN_LANDED;
      best = Math.max(best, flight.score);
      try {
        window.localStorage.setItem('merapi-sky-run-best', String(best));
      } catch {
        // Best score is a nicety; a blocked store never stops the game.
      }
      audio.land();
    }
    audio.update(flight);
  }

  renderer.draw(world, flight, screen, best, nowMs, sunsetMode);

  // Debug handle for headless play-testing (read-only snapshot).
  window.__merapi = {
    screen,
    phase: flight.phase,
    score: flight.score,
    rings: flight.ringsPassed,
    x: Math.round(flight.x),
    y: Math.round(flight.y),
    z: Math.round(flight.z),
    speed: Math.round(flight.speed * 3.6),
    heading: Math.round(flight.headingDeg),
    fuel: Math.round(flight.fuel),
    crashReason: flight.crashReason,
  };

  if (shotName && !shotSettled) {
    // Two painted frames, then the screenshot may fire.
    requestAnimationFrame(() => {
      window.__shotReady = true;
      shotSettled = true;
    });
  }
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
