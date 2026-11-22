// Build entry: stage an entry directory the make.fun scorer can read, then emit its
// dossier. Output goes to MAKEFUN_OUTPUT_DIR (or /output by convention), game/ and
// screenshots/ are copied in verbatim, and vendor/makefun-game.ts's buildDossier
// writes dossier.json under this bounty's caps. Node 22, stdlib only.

import { cpSync, mkdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { buildDossier } from './vendor/makefun-game.ts';

const outArg = process.env.MAKEFUN_OUTPUT_DIR;

function pickOutDir() {
  if (outArg && outArg.trim()) return resolve(outArg.trim());
  // The bounty's default: /output. On hosts where that cannot exist, fall back
  // to a local ./output so the build still produces a dossier.
  try {
    mkdirSync('/output', { recursive: true });
    return '/output';
  } catch {
    return resolve('output');
  }
}

const out = pickOutDir();
mkdirSync(out, { recursive: true });

// Copy the entry's two halves into place. Both must exist: the game is a
// directory of static files with index.html at its root, and screenshots/ holds
// the renders whose first file the scorer treats as the cover.
for (const dir of ['game', 'screenshots']) {
  const src = resolve(dir);
  statSync(src); // throws with a clear errno if the entry is incomplete
  const dst = join(out, dir);
  rmSync(dst, { recursive: true, force: true });
  cpSync(src, dst, { recursive: true });
}

// Caps for bounty gta6-01: text 160 KiB, up to 4 renders of 256 KiB each,
// 993 game files totalling under 48 MiB, no path longer than 1000 bytes.
const caps = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
};

const dossier = buildDossier(out, caps);
const dossierPath = join(out, 'dossier.json');
writeFileSync(dossierPath, dossier);

console.log(`[main.ts] output dir: ${out}`);
console.log(`[main.ts] dossier.json: ${dossierPath} (${dossier.length} bytes)`);
process.exit(0);
