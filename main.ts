// Merapi Sky Run — the hand-in program (Node 22, standard library only).
//
// The game is this directory's game/ folder: plain static files a desktop browser loads
// offline (game/index.html and its ES modules, no library, no network request). This
// program hands it in: it copies game/ and screenshots/ from beside this file to /output
// and writes /output/dossier.json, the summary the judge reads, with the vendored
// make.fun library. Serve it locally with `node serve.ts`, then open
// http://localhost:8080. Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in
// for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

// The scorer's caps (reference/gate.json): only text_max_bytes shapes the bytes; the
// others refuse an entry the scorer would refuse (more than 4 screenshots or one over
// 256 KiB; more than 993 files in game/ or 48 MiB of game files in all, or a path under
// game/ over 1000 bytes: game/ counts beside /output's own 1000-entry cap, its
// screenshots/ and dossier.json).
const DOSSIER_OPTIONS = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
};

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

/** Count every file and directory under a path, and the bytes of the files. */
function measure(root: string): { entries: number; bytes: number } {
  let entries = 0;
  let bytes = 0;
  const walk = (dir: string): void => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      const stats = statSync(path);
      entries += 1;
      if (stats.isDirectory()) walk(path);
      else bytes += stats.size;
    }
  };
  walk(root);
  return { entries, bytes };
}

/** Fail fast with a plain message when the entry would break a scorer cap. */
function checkCaps(): void {
  const game = measure(join(here, 'game'));
  if (game.entries > DOSSIER_OPTIONS.game_max_files) {
    throw new Error(`game/ holds ${game.entries} entries, over the ${DOSSIER_OPTIONS.game_max_files} cap`);
  }
  if (game.bytes > DOSSIER_OPTIONS.game_max_bytes) {
    throw new Error(`game/ holds ${game.bytes} bytes, over the ${DOSSIER_OPTIONS.game_max_bytes} cap`);
  }
  const shotsDir = join(here, 'screenshots');
  if (existsSync(shotsDir)) {
    const shots = readdirSync(shotsDir).filter((name) => !name.startsWith('.'));
    if (shots.length > DOSSIER_OPTIONS.screenshots.max) {
      throw new Error(`screenshots/ holds ${shots.length} images, over the ${DOSSIER_OPTIONS.screenshots.max} cap`);
    }
    for (const name of shots) {
      const size = statSync(join(shotsDir, name)).size;
      if (size > DOSSIER_OPTIONS.screenshots.max_bytes) {
        throw new Error(`screenshots/${name} is ${size} bytes, over the ${DOSSIER_OPTIONS.screenshots.max_bytes} cap`);
      }
    }
  }
}

checkCaps();
mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) {
  cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });
}

const dossier = buildDossier(out, DOSSIER_OPTIONS);
writeFileSync(join(out, 'dossier.json'), dossier);

const game = measure(join(out, 'game'));
const shots = existsSync(join(out, 'screenshots'))
  ? readdirSync(join(out, 'screenshots')).filter((name) => !name.startsWith('.'))
  : [];
console.log(`Merapi Sky Run handed in to ${out}: game/ ${game.entries} entries, ${game.bytes} bytes; screenshots ${shots.join(', ')}; dossier.json ${dossier.length} bytes.`);
