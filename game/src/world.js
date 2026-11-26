// Merapi Sky Run — the world: a volcanic archipelago at golden hour.
// One height function drives the terrain mesh, the physics (ground collisions) and the
// colours. Everything is seeded, so a seed rebuilds the same islands, rings and clouds.

import { SEA_LEVEL } from './config.js';
import { createRandom, fbm, noise2 } from './random.js';

/** Smooth bump: 1 at the centre, 0 past `radius`. */
function bump(dx, dz, radius) {
  const d2 = (dx * dx + dz * dz) / (radius * radius);
  if (d2 >= 1) return 0;
  const t = 1 - d2;
  return t * t * (3 - 2 * t);
}

/** Cone with a crater dip at the top. */
function volcanoCone(dx, dz, radius, height) {
  const d = Math.sqrt(dx * dx + dz * dz) / radius;
  if (d >= 1) return 0;
  const rim = 1 - d;
  const crater = d < 0.22 ? (0.22 - d) / 0.22 : 0;
  return height * (rim * rim * (3 - 2 * rim) - crater * crater * 0.35);
}

/** The islands: [cx, cz, radius, height, kind]. */
const ISLANDS = [
  { cx: -700, cz: 700, r: 1150, h: 150, kind: 'main' },
  { cx: 1250, cz: -450, r: 720, h: 230, kind: 'rock' },
  { cx: 1450, cz: 1250, r: 520, h: 95, kind: 'green' },
  { cx: -1500, cz: -700, r: 620, h: 170, kind: 'rock' },
  { cx: -300, cz: 1750, r: 420, h: 70, kind: 'green' },
  { cx: 300, cz: -1750, r: 380, h: 60, kind: 'green' },
  { cx: 1900, cz: 300, r: 260, h: 45, kind: 'sand' },
  { cx: -1900, cz: 900, r: 240, h: 40, kind: 'sand' },
];

/** Merapi, the volcano that names the game. */
const VOLCANO = { cx: 0, cz: -1250, r: 950, h: 880 };

/** The runway on the main island's east coast: a flat strip the terrain flattens around,
    with a clean approach over the sea from the east. */
export const RUNWAY = {
  cx: 200, cz: 700, headingDeg: 90, length: 620, width: 42,
  /** Ground height on the strip (flattened). */
  height: 26,
};

/** Flatten factor near the runway: 1 = fully flat at the strip. */
function runwayMask(x, z) {
  const hd = (RUNWAY.headingDeg * Math.PI) / 180;
  const fx = Math.cos(hd);
  const fz = Math.sin(hd);
  const dx = x - RUNWAY.cx;
  const dz = z - RUNWAY.cz;
  const along = dx * fx + dz * fz;
  const across = -dx * fz + dz * fx;
  const a = Math.max(0, 1 - Math.abs(along) / (RUNWAY.length / 2 + 260));
  const b = Math.max(0, 1 - Math.abs(across) / (RUNWAY.width / 2 + 240));
  return Math.min(a, b);
}

function rawHeight(x, z, seed) {
  let h = -26; // seabed
  for (const isle of ISLANDS) {
    h += bump(x - isle.cx, z - isle.cz, isle.r) * isle.h;
  }
  h += volcanoCone(x - VOLCANO.cx, z - VOLCANO.cz, VOLCANO.r, VOLCANO.h);
  // Rolling hills on land, gentle swell under the sea.
  const rough = fbm(x / 420, z / 420, seed, 4) - 0.5;
  h += rough * (h > 4 ? 46 : 12);
  // Fine detail so slopes shade nicely.
  h += (noise2(x / 90, z / 90, seed + 7) - 0.5) * 7;
  return h;
}

/** Terrain height in metres at world (x, z). */
export function terrainHeight(x, z, seed) {
  const h = rawHeight(x, z, seed);
  const mask = runwayMask(x, z);
  if (mask > 0) return h * (1 - mask) + RUNWAY.height * mask;
  return h;
}

/** True when (x, z) is on the runway strip itself (for landings and paint). */
export function onRunway(x, z) {
  const hd = (RUNWAY.headingDeg * Math.PI) / 180;
  const fx = Math.cos(hd);
  const fz = Math.sin(hd);
  const dx = x - RUNWAY.cx;
  const dz = z - RUNWAY.cz;
  const along = dx * fx + dz * fz;
  const across = -dx * fz + dz * fx;
  return Math.abs(along) <= RUNWAY.length / 2 && Math.abs(across) <= RUNWAY.width / 2;
}

/** Distance across the strip, metres from the centreline (for the centreline dashes). */
export function runwayAcross(x, z) {
  const hd = (RUNWAY.headingDeg * Math.PI) / 180;
  const fx = Math.cos(hd);
  const fz = Math.sin(hd);
  return -(x - RUNWAY.cx) * fz + (z - RUNWAY.cz) * fx;
}

/** Distance along the strip from its centre, metres (for threshold marks). */
export function runwayAlong(x, z) {
  const hd = (RUNWAY.headingDeg * Math.PI) / 180;
  const fx = Math.cos(hd);
  const fz = Math.sin(hd);
  return (x - RUNWAY.cx) * fx + (z - RUNWAY.cz) * fz;
}

/** The ring course: ten gates from the runway, around the volcano, back to the strip.
    The strip runs along the runway heading (+z): takeoff flies south, ring 10 is the
    final approach fix north of the strip. Altitudes clear the terrain below each gate. */
export function buildRings() {
  const gates = [
    { x: 300, z: 1100, y: 130 },
    { x: 700, z: 900, y: 200 },
    { x: 900, z: 300, y: 350 },
    { x: 600, z: -600, y: 520 },
    { x: -150, z: -1150, y: 980 },
    { x: -850, z: -900, y: 520 },
    { x: -1200, z: -150, y: 300 },
    { x: -700, z: 500, y: 220 },
    { x: -500, z: 800, y: 240 },
    { x: 200, z: 150, y: 90 },
  ];
  return gates.map((g, i) => ({ ...g, index: i, passed: false }));
}

/** A small coastal town beside the runway, for the skyline on approach. */
export function buildTown(seed) {
  const rnd = createRandom(seed + 31);
  const blocks = [];
  const hd = (RUNWAY.headingDeg * Math.PI) / 180;
  for (let i = 0; i < 30; i += 1) {
    const along = (rnd() - 0.5) * 700;
    // Far enough out that the blocks never loom over the strip.
    const across = 200 + rnd() * 280;
    const side = rnd() < 0.5 ? 1 : -1;
    const x = RUNWAY.cx + Math.cos(hd) * along - Math.sin(hd) * across * side;
    const z = RUNWAY.cz + Math.sin(hd) * along + Math.cos(hd) * across * side;
    const h = terrainHeight(x, z, seed);
    if (h < 6) continue;
    blocks.push({
      x, z, y: h,
      w: 14 + rnd() * 22, d: 14 + rnd() * 22, hgt: 6 + rnd() * 12,
      warm: rnd() < 0.6, // lit windows at golden hour
    });
  }
  return blocks;
}

/** Puffy clouds drifting over the islands. */
export function buildClouds(seed) {
  const rnd = createRandom(seed + 77);
  const clouds = [];
  for (let i = 0; i < 16; i += 1) {
    const angle = rnd() * Math.PI * 2;
    const dist = 400 + rnd() * 2200;
    clouds.push({
      x: Math.cos(angle) * dist,
      z: Math.sin(angle) * dist,
      y: 420 + rnd() * 320,
      r: 90 + rnd() * 160,
      puffs: 3 + Math.floor(rnd() * 3),
      seed: Math.floor(rnd() * 100000),
    });
  }
  return clouds;
}

/** Create the world for a seed: height function, rings, town, clouds. */
export function createWorld(seed) {
  return {
    seed,
    heightAt: (x, z) => terrainHeight(x, z, seed),
    rings: buildRings(),
    town: buildTown(seed),
    clouds: buildClouds(seed),
    runway: RUNWAY,
    seaLevel: SEA_LEVEL,
  };
}
