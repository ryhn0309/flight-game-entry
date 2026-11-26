// Merapi Sky Run — the renderer.
// A pseudo-3D chase view in plain Canvas 2D: the terrain is a heightfield mesh projected
// through a chase camera, the sky is a golden-hour gradient with a low sun, and the bottom
// of the screen is a lit instrument panel with real gauges. No images, no network: every
// pixel is drawn from the world.

import { PALETTE, SUN, SUNSET, VIEW } from './config.js';
import { onRunway, runwayAcross, runwayAlong, RUNWAY } from './world.js';
import { fbm, hash2 } from './random.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';
export const SCREEN_LANDED = 'landed';

const DEG = Math.PI / 180;
const W = VIEW.width;
const H = VIEW.height;
const PANEL_H = VIEW.panelHeight;

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function mixRgb(c1, c2, t) {
  return [
    Math.round(lerp(c1[0], c2[0], t)),
    Math.round(lerp(c1[1], c2[1], t)),
    Math.round(lerp(c1[2], c2[2], t)),
  ];
}

function hexRgb(hex) {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
}

function rgb(c, a = 1) {
  return `rgba(${c[0]},${c[1]},${c[2]},${a})`;
}

const C = {
  skyTop: hexRgb(PALETTE.skyTop),
  skyMid: hexRgb(PALETTE.skyMid),
  skyLow: hexRgb(PALETTE.skyLow),
  seaDeep: hexRgb(PALETTE.seaDeep),
  seaShallow: hexRgb(PALETTE.seaShallow),
  sand: hexRgb(PALETTE.sand),
  grassLow: hexRgb(PALETTE.grassLow),
  grassHigh: hexRgb(PALETTE.grassHigh),
  jungle: hexRgb(PALETTE.jungle),
  rock: hexRgb(PALETTE.rock),
  volcano: hexRgb(PALETTE.volcano),
  crater: hexRgb(PALETTE.crater),
  asphalt: hexRgb(PALETTE.asphalt),
  runwayMark: hexRgb(PALETTE.runwayMark),
};

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  canvas.width = W;
  canvas.height = H;

  // --- Camera ---------------------------------------------------------------
  function cameraFor(world, flight, screen, nowMs) {
    if (screen === SCREEN_TITLE) {
      // Attract mode: slow orbit from the sea side, volcano on the horizon.
      const t = nowMs / 1000;
      const cx = 1100 + Math.cos(t * 0.05) * 250;
      const cz = 900 + Math.sin(t * 0.05) * 250;
      const eye = { x: cx, y: 180, z: cz };
      const at = { x: 0, y: 320, z: -1250 };
      return { eye, at };
    }
    const hd = flight.headingDeg * DEG;
    const pd = flight.pitchDeg * DEG;
    const fx = Math.cos(hd) * Math.cos(pd);
    const fy = Math.sin(pd);
    const fz = Math.sin(hd) * Math.cos(pd);
    const eye = {
      x: flight.x - fx * 20,
      y: flight.y - fy * 20 + 5.5,
      z: flight.z - fz * 20,
    };
    const ground = world.heightAt(eye.x, eye.z);
    if (eye.y < ground + 5) eye.y = ground + 5;
    const at = { x: flight.x + fx * 40, y: flight.y + fy * 40, z: flight.z + fz * 40 };
    return { eye, at };
  }

  function basis(eye, at) {
    let fx = at.x - eye.x;
    let fy = at.y - eye.y;
    let fz = at.z - eye.z;
    const fl = Math.hypot(fx, fy, fz) || 1;
    fx /= fl; fy /= fl; fz /= fl;
    // right = forward x world-up
    let rx = -fz;
    let rz = fx;
    const rl = Math.hypot(rx, rz) || 1;
    rx /= rl; rz /= rl;
    const ux = rz * fy - 0 * fz;
    const uy = 0 * fx - rx * fz;
    const uz = rx * fy - rz * fx;
    return { f: [fx, fy, fz], r: [rx, 0, rz], u: [ux, uy, uz] };
  }

  function makeProjector(eye, bas) {
    const focal = (H * 0.5) / Math.tan(35 * DEG);
    const horizonY = H * 0.46;
    return function project(x, y, z) {
      const dx = x - eye.x;
      const dy = y - eye.y;
      const dz = z - eye.z;
      const cz = dx * bas.f[0] + dy * bas.f[1] + dz * bas.f[2];
      if (cz < 2) return null;
      const cx = dx * bas.r[0] + dy * bas.r[1] + dz * bas.r[2];
      const cy = dx * bas.u[0] + dy * bas.u[1] + dz * bas.u[2];
      return { x: W / 2 + (cx * focal) / cz, y: horizonY - (cy * focal) / cz, s: focal / cz, z: cz };
    };
  }

  // --- Sky ------------------------------------------------------------------
  function drawSky(bas, sunset) {
    const sun = sunset ? SUNSET : SUN;
    const grad = ctx.createLinearGradient(0, 0, 0, H * 0.62);
    grad.addColorStop(0, rgb(C.skyTop));
    grad.addColorStop(0.55, rgb(C.skyMid));
    grad.addColorStop(1, rgb(C.skyLow));
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H * 0.62 + 2);
    // Sun: a direction at infinity, projected through the camera basis.
    const az = sun.azimuthDeg * DEG;
    const el = sun.elevationDeg * DEG;
    const dir = [Math.cos(az) * Math.cos(el), Math.sin(el), Math.sin(az) * Math.cos(el)];
    const cz = dir[0] * bas.f[0] + dir[1] * bas.f[1] + dir[2] * bas.f[2];
    if (cz > 0.05) {
      const cx = dir[0] * bas.r[0] + dir[1] * bas.r[1] + dir[2] * bas.r[2];
      const cy = dir[0] * bas.u[0] + dir[1] * bas.u[1] + dir[2] * bas.u[2];
      const focal = (H * 0.5) / Math.tan(35 * DEG);
      const sx = W / 2 + (cx * focal) / cz;
      const sy = H * 0.46 - (cy * focal) / cz;
      if (sx > -200 && sx < W + 200 && sy > -200 && sy < H * 0.7) {
        const glow = ctx.createRadialGradient(sx, sy, 4, sx, sy, 260);
        glow.addColorStop(0, PALETTE.sunGlow);
        glow.addColorStop(1, 'rgba(255,176,84,0)');
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(sx, sy, 260, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = PALETTE.sunCore;
        ctx.beginPath();
        ctx.arc(sx, sy, 30, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,240,200,0.5)';
        ctx.beginPath();
        ctx.arc(sx, sy, 44, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  // --- Terrain --------------------------------------------------------------
  function terrainColor(world, x, z, h, seed) {
    if (onRunway(x, z)) {
      const across = Math.abs(runwayAcross(x, z));
      const along = runwayAlong(x, z);
      if (across < 1.4 && Math.abs(((along % 44) + 44) % 44 - 22) < 11) return C.runwayMark;
      if (Math.abs(Math.abs(along) - (620 / 2 - 14)) < 8 && across > 6) return C.runwayMark;
      return C.asphalt;
    }
    if (h < 2.5) {
      const t = clamp((h + 1) / 3.5, 0, 1);
      return mixRgb(C.seaShallow, C.sand, t);
    }
    if (h < 6) return C.sand;
    const n = fbm(x / 260, z / 260, seed, 3);
    let base = mixRgb(C.grassLow, C.grassHigh, clamp((h - 6) / 320, 0, 1));
    if (n > 0.62) base = mixRgb(base, C.jungle, clamp((n - 0.62) * 3, 0, 0.7));
    if (h > 380) base = mixRgb(base, C.rock, clamp((h - 380) / 220, 0, 1));
    const dvx = x;
    const dvz = z + 1250;
    const dv = Math.hypot(dvx, dvz);
    if (dv < 950) {
      base = mixRgb(base, C.volcano, clamp((950 - dv) / 500, 0, 0.85));
      if (h > 700) base = mixRgb(base, C.crater, clamp((h - 700) / 160, 0, 0.5));
    }
    return base;
  }

  function drawTerrain(world, origin, headingDeg, project, seed) {
    const hd = headingDeg * DEG;
    const fx = Math.cos(hd);
    const fz = Math.sin(hd);
    const rx = -fz;
    const rz = fx;
    const step = 130;
    const LAT = 15;
    const FWD = 34;
    // Sample the mesh in camera-relative rows, far to near.
    const rows = [];
    for (let j = FWD; j >= 0; j -= 1) {
      const row = [];
      for (let i = -LAT; i <= LAT; i += 1) {
        const wx = origin.x + fx * j * step + rx * i * step;
        const wz = origin.z + fz * j * step + rz * i * step;
        const wy = world.heightAt(wx, wz);
        row.push({ x: wx, y: wy, z: wz, p: project(wx, wy, wz) });
      }
      rows.push(row);
    }
    const sunAz = SUN.azimuthDeg * DEG;
    const sunX = Math.cos(sunAz);
    const sunZ = Math.sin(sunAz);
    for (let r = 0; r < rows.length - 1; r += 1) {
      const near = rows[r];
      const far = rows[r + 1];
      for (let i = 0; i < near.length - 1; i += 1) {
        const a = near[i];
        const b = near[i + 1];
        const c = far[i + 1];
        const d = far[i];
        if (!a.p || !b.p || !c.p || !d.p) continue;
        const mx = (a.x + c.x) / 2;
        const mz = (a.z + c.z) / 2;
        const mh = (a.y + c.y) / 2;
        let col = terrainColor(world, mx, mz, mh, seed);
        // Slope shading: faces tilted toward the sun catch more light.
        const slopeX = (world.heightAt(mx + 60, mz) - world.heightAt(mx - 60, mz)) / 120;
        const slopeZ = (world.heightAt(mx, mz + 60) - world.heightAt(mx, mz - 60)) / 120;
        const facing = clamp(1 - (slopeX * sunX + slopeZ * sunZ) * 0.9, 0.72, 1.18);
        if (mh < 2.5) {
          // Sea: glitter where the sun path runs.
          const glitter = hash2(Math.floor(mx / 90), Math.floor(mz / 90), seed + 5);
          const path = Math.exp(-Math.pow((mz - 780) / 900, 2)) * 0.5;
          const bright = 0.85 + glitter * 0.35 + path * 0.5;
          col = [col[0] * bright, col[1] * bright, col[2] * bright];
        } else {
          col = [col[0] * facing, col[1] * facing, col[2] * facing];
        }
        ctx.fillStyle = rgb(col.map((v) => clamp(Math.round(v), 0, 255)));
        ctx.beginPath();
        ctx.moveTo(a.p.x, a.p.y);
        ctx.lineTo(b.p.x, b.p.y);
        ctx.lineTo(c.p.x, c.p.y);
        ctx.lineTo(d.p.x, d.p.y);
        ctx.closePath();
        ctx.fill();
      }
    }
  }

  // --- Runway -------------------------------------------------------------
  // Drawn as its own projected polygon: the 42 m strip is narrower than the terrain
  // mesh sampling, so the mesh alone would almost never show it.
  function drawRunway(project) {
    const hd = RUNWAY.headingDeg * DEG;
    const ax = Math.cos(hd);
    const az = Math.sin(hd);
    const bx = -az;
    const bz = ax;
    const half = RUNWAY.length / 2;
    const halfW = RUNWAY.width / 2;
    const y = RUNWAY.height + 0.4;
    function quad(along0, across0, along1, across1) {
      const pts = [
        project(RUNWAY.cx + ax * along0 + bx * across0, y, RUNWAY.cz + az * along0 + bz * across0),
        project(RUNWAY.cx + ax * along1 + bx * across0, y, RUNWAY.cz + az * along1 + bz * across0),
        project(RUNWAY.cx + ax * along1 + bx * across1, y, RUNWAY.cz + az * along1 + bz * across1),
        project(RUNWAY.cx + ax * along0 + bx * across1, y, RUNWAY.cz + az * along0 + bz * across1),
      ];
      if (pts.some((p) => !p)) return;
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      ctx.lineTo(pts[1].x, pts[1].y);
      ctx.lineTo(pts[2].x, pts[2].y);
      ctx.lineTo(pts[3].x, pts[3].y);
      ctx.closePath();
      ctx.fill();
    }
    ctx.fillStyle = rgb(C.asphalt);
    quad(-half, -halfW, half, halfW);
    // Centreline dashes.
    ctx.fillStyle = rgb(C.runwayMark);
    for (let s = -half + 18; s < half - 18; s += 44) {
      quad(s, -1.4, s + 22, 1.4);
    }
    // Threshold bars at both ends.
    quad(-half + 6, -halfW + 3, -half + 16, halfW - 3);
    quad(half - 16, -halfW + 3, half - 6, halfW - 3);
  }

  // --- Clouds ---------------------------------------------------------------
  function drawClouds(world, project, nowMs) {
    for (const cloud of world.clouds) {
      const drift = ((nowMs / 1000) * 1.5) % 400;
      const p = project(cloud.x + drift, cloud.y, cloud.z);
      if (!p || p.z < 10) continue;
      const r = cloud.r * p.s;
      if (r < 4) continue;
      ctx.save();
      ctx.globalAlpha = 0.68;
      for (let k = 0; k < cloud.puffs; k += 1) {
        const px = p.x + (hash2(cloud.seed, k, 3) - 0.5) * r * 1.6;
        const py = p.y + (hash2(cloud.seed, k, 11) - 0.5) * r * 0.5;
        const pr = r * (0.35 + hash2(cloud.seed, k, 23) * 0.3);
        const g = ctx.createRadialGradient(px, py, pr * 0.1, px, py, pr);
        g.addColorStop(0, 'rgba(255, 226, 196, 0.55)');
        g.addColorStop(0.7, 'rgba(255, 210, 180, 0.28)');
        g.addColorStop(1, 'rgba(255, 210, 180, 0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(px, py, pr, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  // --- Town -----------------------------------------------------------------
  function drawTown(world, project) {
    for (const b of world.town) {
      const top = project(b.x, b.y + b.hgt, b.z);
      if (!top || top.z < 8) continue;
      const hw = (b.w / 2) * top.s;
      const hd = (b.d / 2) * top.s;
      const hh = b.hgt * top.s;
      if (hw < 1.5 || hh > 260) continue;
      ctx.fillStyle = b.warm ? 'rgba(214, 164, 110, 0.95)' : 'rgba(148, 152, 160, 0.95)';
      ctx.fillRect(top.x - hw, top.y - hh, hw * 2, hh);
      ctx.fillStyle = 'rgba(60, 48, 44, 0.9)';
      ctx.fillRect(top.x - hw, top.y - hh, hw * 2, Math.max(1.5, hh * 0.08));
      if (b.warm && hh > 6) {
        ctx.fillStyle = 'rgba(255, 214, 130, 0.95)';
        for (let k = 0; k < 3; k += 1) {
          if (hash2(b.x | 0, b.z | 0, k) < 0.5) continue;
          ctx.fillRect(top.x - hw + hw * (0.25 + k * 0.3), top.y - hh * (0.35 + (k % 2) * 0.3), 2.5, 2.5);
        }
      }
      void hd;
    }
  }

  // --- Rings ----------------------------------------------------------------
  function drawRings(world, flight, project, nowMs) {
    for (const ring of world.rings) {
      const idx = ring.index;
      if (idx < flight.ringsPassed) continue;
      const next = world.rings[Math.min(idx + 1, world.rings.length - 1)];
      const prev = world.rings[Math.max(idx - 1, 0)];
      // Ring faces along the course.
      let nx = next.x - prev.x;
      let ny = next.y - prev.y;
      let nz = next.z - prev.z;
      const nl = Math.hypot(nx, ny, nz) || 1;
      nx /= nl; ny /= nl; nz /= nl;
      // Basis perpendicular to the normal.
      let ux = -nz;
      let uz = nx;
      const ul = Math.hypot(ux, uz) || 1;
      ux /= ul; uz /= ul;
      const vx = ny * uz - nz * 0;
      const vy = nz * ux - nx * uz;
      const vz = nx * 0 - ny * ux;
      const isNext = idx === flight.ringsPassed;
      const pulse = 0.75 + 0.25 * Math.sin(nowMs / 280);
      const R = 26;
      ctx.save();
      ctx.lineJoin = 'round';
      ctx.strokeStyle = isNext ? `rgba(255, 210, 60, ${pulse})` : 'rgba(255, 210, 60, 0.45)';
      ctx.shadowColor = 'rgba(255, 200, 60, 0.8)';
      ctx.shadowBlur = isNext ? 18 : 6;
      ctx.lineWidth = Math.max(2, 90 / Math.max(1, project(ring.x, ring.y, ring.z)?.z ?? 100) * 6);
      ctx.beginPath();
      let started = false;
      for (let k = 0; k <= 28; k += 1) {
        const a = (k / 28) * Math.PI * 2;
        const px = ring.x + (ux * Math.cos(a) + vx * Math.sin(a)) * R;
        const py = ring.y + (0 * Math.cos(a) + vy * Math.sin(a)) * R;
        const pz = ring.z + (uz * Math.cos(a) + vz * Math.sin(a)) * R;
        const p = project(px, py, pz);
        if (!p) continue;
        if (!started) {
          ctx.moveTo(p.x, p.y);
          started = true;
        } else ctx.lineTo(p.x, p.y);
      }
      ctx.closePath();
      ctx.stroke();
      ctx.restore();
      if (isNext) {
        const cp = project(ring.x, ring.y + R + 12, ring.z);
        if (cp) {
          ctx.fillStyle = 'rgba(255, 210, 60, 0.95)';
          ctx.font = `bold ${Math.max(13, 700 / cp.z)}px ${'system-ui, sans-serif'}`;
          ctx.textAlign = 'center';
          ctx.fillText(`RING ${idx + 1}`, cp.x, cp.y);
        }
      }
    }
  }

  // --- The plane (chase view) ----------------------------------------------
  function drawPlane(flight, nowMs) {
    const cx = W / 2;
    const cy = H * 0.52;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate((-flight.rollDeg * DEG) / 1.4);
    const blink = Math.floor(nowMs / 500) % 2 === 0;
    // Propeller disc (translucent, spinning spokes).
    ctx.save();
    ctx.globalAlpha = 0.28;
    ctx.fillStyle = '#c8ccd4';
    ctx.beginPath();
    ctx.ellipse(0, -34, 10, 46, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 0.5;
    ctx.strokeStyle = '#8b93a3';
    ctx.lineWidth = 3;
    const pa = (nowMs / 40) % Math.PI;
    ctx.beginPath();
    ctx.moveTo(0, -34 - 40 * Math.cos(pa));
    ctx.lineTo(0, -34 + 40 * Math.cos(pa));
    ctx.stroke();
    ctx.restore();
    // Wings.
    ctx.fillStyle = PALETTE.planeWing;
    ctx.beginPath();
    ctx.moveTo(-118, 6);
    ctx.lineTo(-16, -8);
    ctx.lineTo(-14, 12);
    ctx.lineTo(-112, 22);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(118, 6);
    ctx.lineTo(16, -8);
    ctx.lineTo(14, 12);
    ctx.lineTo(112, 22);
    ctx.closePath();
    ctx.fill();
    // Wing tips.
    ctx.fillStyle = PALETTE.planeBody;
    ctx.fillRect(-122, 4, 10, 18);
    ctx.fillRect(112, 4, 10, 18);
    // Fuselage (seen from behind-above).
    const fus = ctx.createLinearGradient(0, -40, 0, 34);
    fus.addColorStop(0, '#f0703f');
    fus.addColorStop(0.5, PALETTE.planeBody);
    fus.addColorStop(1, '#a83a1c');
    ctx.fillStyle = fus;
    ctx.beginPath();
    ctx.moveTo(-13, -38);
    ctx.quadraticCurveTo(0, -46, 13, -38);
    ctx.lineTo(17, 22);
    ctx.quadraticCurveTo(0, 32, -17, 22);
    ctx.closePath();
    ctx.fill();
    // Cheatline.
    ctx.fillStyle = PALETTE.planeTrim;
    ctx.fillRect(-14, -6, 28, 5);
    // Tail fin.
    ctx.fillStyle = PALETTE.planeBody;
    ctx.beginPath();
    ctx.moveTo(-4, -36);
    ctx.lineTo(0, -62);
    ctx.lineTo(6, -36);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 9px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('MERAPI', 0, -14);
    // Nav lights.
    if (blink) {
      ctx.fillStyle = '#ff4040';
      ctx.beginPath();
      ctx.arc(-120, 12, 3.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#40ff70';
      ctx.beginPath();
      ctx.arc(120, 12, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // --- Instruments ------------------------------------------------------------
  function drawGauge(x, y, r, label) {
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = PALETTE.gaugeFace;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = PALETTE.gaugeRing;
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.fillStyle = PALETTE.muted;
    ctx.font = 'bold 10px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(label, 0, r + 13);
    ctx.restore();
  }

  function drawHorizon(flight) {
    const x = 132;
    const y = H - PANEL_H / 2 - 4;
    const r = 52;
    drawGauge(x, y, r, 'ATTITUDE');
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, r - 3, 0, Math.PI * 2);
    ctx.clip();
    ctx.translate(x, y);
    ctx.rotate(-flight.rollDeg * DEG);
    const pitchPx = clamp(flight.pitchDeg, -30, 30) * 1.6;
    ctx.translate(0, pitchPx);
    const sky = ctx.createLinearGradient(0, -r, 0, 0);
    sky.addColorStop(0, '#7a9cc6');
    sky.addColorStop(1, '#e8a04c');
    ctx.fillStyle = sky;
    ctx.fillRect(-r, -r, r * 2, r);
    ctx.fillStyle = '#6b4a2f';
    ctx.fillRect(-r, 0, r * 2, r);
    ctx.fillStyle = '#f2f2e8';
    ctx.fillRect(-r, -1, r * 2, 2);
    ctx.restore();
    ctx.save();
    ctx.translate(x, y);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(-26, 0);
    ctx.lineTo(-8, 0);
    ctx.moveTo(8, 0);
    ctx.lineTo(26, 0);
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(0, 0, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawDial(x, y, r, label, value, max, unit, ticks = 5) {
    drawGauge(x, y, r, label);
    ctx.save();
    ctx.translate(x, y);
    ctx.strokeStyle = '#c8ccd4';
    ctx.fillStyle = '#eef1f5';
    ctx.font = '9px system-ui, sans-serif';
    ctx.textAlign = 'center';
    for (let i = 0; i <= ticks; i += 1) {
      const a = (-225 + (270 * i) / ticks) * DEG;
      const x1 = Math.cos(a) * (r - 8);
      const y1 = Math.sin(a) * (r - 8);
      const x2 = Math.cos(a) * (r - 3);
      const y2 = Math.sin(a) * (r - 3);
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      const v = Math.round((max * i) / ticks);
      ctx.fillText(String(v), Math.cos(a) * (r - 19), Math.sin(a) * (r - 19) + 3);
    }
    const na = (-225 + 270 * clamp(value / max, 0, 1)) * DEG;
    ctx.strokeStyle = PALETTE.needle;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(na) * (r - 10), Math.sin(na) * (r - 10));
    ctx.stroke();
    ctx.fillStyle = '#eef1f5';
    ctx.font = 'bold 13px ui-monospace, monospace';
    ctx.fillText(`${Math.round(value)}`, 0, r * 0.42);
    ctx.font = '8px system-ui, sans-serif';
    ctx.fillStyle = PALETTE.muted;
    ctx.fillText(unit, 0, r * 0.62);
    ctx.restore();
  }

  function drawCompass(flight) {
    const x = W / 2;
    const y = H - PANEL_H + 26;
    const w = 300;
    const h = 34;
    ctx.save();
    ctx.fillStyle = PALETTE.gaugeFace;
    ctx.beginPath();
    ctx.roundRect(x - w / 2, y - h / 2, w, h, 8);
    ctx.fill();
    ctx.strokeStyle = PALETTE.gaugeRing;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.beginPath();
    ctx.rect(x - w / 2, y - h / 2, w, h);
    ctx.clip();
    const pxPerDeg = w / 120;
    const names = { 0: 'N', 45: 'NE', 90: 'E', 135: 'SE', 180: 'S', 225: 'SW', 270: 'W', 315: 'NW' };
    // Step over absolute degrees so the 45° marks are always hit, whatever the heading.
    const startDeg = Math.floor((flight.headingDeg - 60) / 5) * 5;
    for (let deg = startDeg; deg <= flight.headingDeg + 60; deg += 5) {
      const wrapped = ((deg % 360) + 360) % 360;
      const d = ((wrapped - flight.headingDeg + 540) % 360) - 180;
      const px = x + d * pxPerDeg;
      const major = wrapped % 45 === 0;
      const minor = wrapped % 15 === 0;
      ctx.strokeStyle = major ? '#eef1f5' : '#8b93a3';
      ctx.lineWidth = major ? 2 : 1;
      ctx.beginPath();
      ctx.moveTo(px, y + h / 2 - (major ? 12 : minor ? 8 : 5));
      ctx.lineTo(px, y + h / 2);
      ctx.stroke();
      if (major) {
        ctx.fillStyle = '#eef1f5';
        ctx.font = 'bold 11px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(names[wrapped] ?? String(wrapped), px, y - h / 2 + 13);
      }
    }
    ctx.restore();
    // Centre caret.
    ctx.fillStyle = PALETTE.amber;
    ctx.beginPath();
    ctx.moveTo(x - 7, y - h / 2 - 2);
    ctx.lineTo(x + 7, y - h / 2 - 2);
    ctx.lineTo(x, y - h / 2 + 7);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = PALETTE.muted;
    ctx.font = 'bold 10px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('HEADING', x, y + h / 2 + 13);
  }

  function drawBars(flight) {
    const x0 = W - 250;
    const y0 = H - PANEL_H + 18;
    // Fuel bar.
    ctx.fillStyle = PALETTE.muted;
    ctx.font = 'bold 10px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('FUEL', x0, y0);
    ctx.fillStyle = '#0a0d12';
    ctx.fillRect(x0, y0 + 6, 200, 14);
    const fuelCol = flight.fuel < 20 ? PALETTE.red : flight.fuel < 45 ? PALETTE.amber : PALETTE.green;
    ctx.fillStyle = fuelCol;
    ctx.fillRect(x0, y0 + 6, 200 * clamp(flight.fuel / 100, 0, 1), 14);
    ctx.fillStyle = '#eef1f5';
    ctx.font = 'bold 11px ui-monospace, monospace';
    ctx.textAlign = 'right';
    ctx.fillText(`${Math.round(flight.fuel)}%`, x0 + 200, y0 + 17);
    // Throttle bar.
    const y1 = y0 + 34;
    ctx.fillStyle = PALETTE.muted;
    ctx.textAlign = 'left';
    ctx.fillText('THROTTLE', x0, y1);
    ctx.fillStyle = '#0a0d12';
    ctx.fillRect(x0, y1 + 6, 200, 14);
    ctx.fillStyle = PALETTE.amber;
    ctx.fillRect(x0, y1 + 6, 200 * clamp(flight.throttle, 0, 1), 14);
    ctx.fillStyle = '#eef1f5';
    ctx.textAlign = 'right';
    ctx.fillText(`${Math.round(flight.throttle * 100)}%`, x0 + 200, y1 + 17);
    // Gear / flaps lamps.
    const y2 = y1 + 34;
    const lamps = [
      { label: 'GEAR', on: flight.gearDown, col: PALETTE.green },
      { label: 'FLAPS', on: flight.flaps, col: PALETTE.green },
      { label: 'STALL', on: flight.stalled, col: PALETTE.red },
    ];
    let lx = x0;
    for (const lamp of lamps) {
      ctx.fillStyle = lamp.on ? lamp.col : '#33383f';
      ctx.beginPath();
      ctx.arc(lx + 6, y2 + 6, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = PALETTE.muted;
      ctx.font = 'bold 10px system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(lamp.label, lx + 16, y2 + 10);
      lx += 72;
    }
  }

  function drawPanel(flight) {
    ctx.fillStyle = PALETTE.panel;
    ctx.fillRect(0, H - PANEL_H, W, PANEL_H);
    ctx.fillStyle = PALETTE.panelEdge;
    ctx.fillRect(0, H - PANEL_H, W, 3);
    // Rivets along the top edge.
    ctx.fillStyle = '#4a4f5a';
    for (let x = 20; x < W; x += 64) {
      ctx.beginPath();
      ctx.arc(x, H - PANEL_H + 8, 2, 0, Math.PI * 2);
      ctx.fill();
    }
    drawHorizon(flight);
    drawDial(268, H - PANEL_H / 2 - 4, 52, 'ALTITUDE', flight.y, 1000, 'm');
    drawDial(396, H - PANEL_H / 2 - 4, 52, 'AIRSPEED', flight.speed * 3.6, 360, 'km/h');
    drawDial(524, H - PANEL_H / 2 - 4, 52, 'VERT SPEED', clamp(flight.verticalSpeed, -10, 10) + 10, 20, 'm/s');
    drawCompass(flight);
    drawBars(flight);
  }

  // --- HUD ------------------------------------------------------------------
  function drawHud(world, flight, nowMs) {
    ctx.save();
    ctx.textAlign = 'left';
    ctx.font = 'bold 15px ui-monospace, monospace';
    const lines = [
      `ALT  ${String(Math.max(0, Math.round(flight.y))).padStart(5, ' ')} m`,
      `SPD  ${String(Math.round(flight.speed * 3.6)).padStart(3, ' ')} km/h`,
      `HDG  ${String(Math.round(flight.headingDeg)).padStart(3, '0')}°`,
    ];
    ctx.shadowColor = 'rgba(0,0,0,0.7)';
    ctx.shadowBlur = 4;
    lines.forEach((line, i) => {
      ctx.fillStyle = PALETTE.amber;
      ctx.fillText(line, 18, 30 + i * 22);
    });
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#eef1f5';
    ctx.font = 'bold 15px ui-monospace, monospace';
    ctx.fillText(`SCORE ${flight.score}`, 18, 30 + 3 * 22);
    ctx.fillStyle = PALETTE.ring;
    ctx.fillText(`RINGS ${flight.ringsPassed}/${world.rings.length}`, 18, 30 + 4 * 22);
    const t = Math.floor(flight.time);
    ctx.fillStyle = '#eef1f5';
    ctx.fillText(`TIME ${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`, 18, 30 + 5 * 22);
    // Objective, top right.
    ctx.textAlign = 'right';
    ctx.font = 'bold 14px system-ui, sans-serif';
    const objective = flight.ringsPassed < world.rings.length
      ? `Fly through ring ${flight.ringsPassed + 1} — then land on the runway`
      : 'Course clear — land on the runway, gear down';
    ctx.fillStyle = 'rgba(238,241,245,0.92)';
    ctx.fillText(objective, W - 18, 30);
    // Next-ring distance and bearing.
    const ring = world.rings[flight.ringsPassed];
    if (ring) {
      const dx = ring.x - flight.x;
      const dz = ring.z - flight.z;
      const dist = Math.round(Math.hypot(dx, dz));
      const bearing = (Math.atan2(dz, dx) / DEG + 360) % 360;
      let rel = ((bearing - flight.headingDeg + 540) % 360) - 180;
      const arrow = rel < -30 ? '◀◀' : rel < -8 ? '◀' : rel > 30 ? '▶▶' : rel > 8 ? '▶' : '▲';
      ctx.fillStyle = PALETTE.ring;
      ctx.font = 'bold 14px ui-monospace, monospace';
      ctx.fillText(`NEXT RING ${dist} m  ${arrow}`, W - 18, 54);
    }
    // Centre flight-path marker.
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(W / 2, H * 0.42, 9, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.beginPath();
    ctx.arc(W / 2, H * 0.42, 2, 0, Math.PI * 2);
    ctx.fill();
    // Flash message.
    if (flight.message && nowMs / 1000 < flight.messageUntil) {
      ctx.textAlign = 'center';
      ctx.font = 'bold 26px system-ui, sans-serif';
      ctx.fillStyle = 'rgba(255, 210, 60, 0.98)';
      ctx.shadowColor = 'rgba(0,0,0,0.8)';
      ctx.shadowBlur = 6;
      ctx.fillText(flight.message, W / 2, 132);
      ctx.shadowBlur = 0;
    }
    ctx.restore();
  }

  // --- Screens ---------------------------------------------------------------
  function drawTitle(flight, best) {
    ctx.save();
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, 'rgba(10, 12, 24, 0.25)');
    g.addColorStop(0.55, 'rgba(10, 12, 24, 0.05)');
    g.addColorStop(1, 'rgba(10, 12, 24, 0.72)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#fff3c4';
    ctx.font = 'bold 64px system-ui, sans-serif';
    ctx.shadowColor = 'rgba(0,0,0,0.65)';
    ctx.shadowBlur = 12;
    ctx.fillText('MERAPI SKY RUN', W / 2, 168);
    ctx.font = '20px system-ui, sans-serif';
    ctx.fillStyle = '#ffe9c4';
    ctx.fillText('Golden-hour island flying — ten rings around the volcano, then home to the runway.', W / 2, 206);
    ctx.font = '16px system-ui, sans-serif';
    ctx.fillStyle = '#eef1f5';
    const lines = [
      'W / S or ↑ / ↓  pitch      A / D or ← / →  bank and turn      Mouse steers too',
      'Shift / Ctrl  throttle      G  gear      F  flaps      Space  brake      P  pause',
      'Fly through all 10 rings, then land gently on the runway with the gear down.',
    ];
    lines.forEach((line, i) => ctx.fillText(line, W / 2, 268 + i * 26));
    ctx.font = 'bold 22px system-ui, sans-serif';
    ctx.fillStyle = PALETTE.ring;
    ctx.fillText('Press Enter or click to fly', W / 2, 392);
    if (best > 0) {
      ctx.fillStyle = '#eef1f5';
      ctx.font = '16px system-ui, sans-serif';
      ctx.fillText(`Best score: ${best}`, W / 2, 424);
    }
    ctx.restore();
  }

  function drawOverlay(title, lines, accent = PALETTE.amber) {
    ctx.save();
    ctx.fillStyle = 'rgba(8, 10, 18, 0.62)';
    ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center';
    ctx.fillStyle = accent;
    ctx.font = 'bold 46px system-ui, sans-serif';
    ctx.shadowColor = 'rgba(0,0,0,0.7)';
    ctx.shadowBlur = 10;
    ctx.fillText(title, W / 2, 250);
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#eef1f5';
    ctx.font = '19px system-ui, sans-serif';
    lines.forEach((line, i) => ctx.fillText(line, W / 2, 300 + i * 30));
    ctx.restore();
  }

  // --- Main draw ---------------------------------------------------------------
  function draw(world, flight, screen, best, nowMs, sunset = false) {
    const { eye, at } = cameraFor(world, flight, screen, nowMs);
    const bas = basis(eye, at);
    const project = makeProjector(eye, bas);
    ctx.clearRect(0, 0, W, H);
    drawSky(bas, sunset);
    // The mesh is sampled around the camera, along where the camera looks.
    const camHeadingDeg = Math.atan2(bas.f[2], bas.f[0]) / DEG;
    drawTerrain(world, eye, camHeadingDeg, project, world.seed);
    drawRunway(project);
    drawClouds(world, project, nowMs);
    drawTown(world, project);
    drawRings(world, flight, project, nowMs);
    if (screen !== SCREEN_TITLE) drawPlane(flight, nowMs);
    drawPanel(flight);
    if (screen === SCREEN_PLAY || screen === SCREEN_PAUSED) drawHud(world, flight, nowMs);
    if (screen === SCREEN_TITLE) drawTitle(flight, best);
    else if (screen === SCREEN_PAUSED) {
      drawOverlay('PAUSED', ['Press P to keep flying.', `Score ${flight.score} — rings ${flight.ringsPassed}/${world.rings.length}`]);
    } else if (screen === SCREEN_OVER) {
      drawOverlay('CRASHED', [
        flight.crashReason,
        `Score ${flight.score} — rings ${flight.ringsPassed}/${world.rings.length}`,
        'Press R to fly again.',
      ], PALETTE.red);
    } else if (screen === SCREEN_LANDED) {
      const lb = flight.landedAt ?? { fuelBonus: 0, timeBonus: 0, courseDone: false, base: 0 };
      const title = lb.courseDone ? 'LANDED — MISSION COMPLETE' : 'LANDED — COURSE UNFINISHED';
      const lines = [
        `Landing bonus ${lb.base}  +  fuel ${lb.fuelBonus}  +  time ${lb.timeBonus}`,
        `Final score ${flight.score}   •   Best ${Math.max(best, flight.score)}`,
      ];
      if (!lb.courseDone) lines.splice(1, 0, 'Fly all 10 rings first for the full landing bonus.');
      lines.push('Press R to fly the course again.');
      drawOverlay(title, lines, lb.courseDone ? PALETTE.green : PALETTE.amber);
    }
  }

  return { draw };
}
