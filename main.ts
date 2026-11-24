// main.ts — build the make.fun dossier: copy game/ + screenshots/ into the
// output dir, run the kit's buildDossier, write dossier.json. Node 22:
// node main.ts   (out = $MAKEFUN_OUTPUT_DIR or /output)

import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { buildDossier } from './vendor/makefun-game.ts';

const out = resolve(process.env.MAKEFUN_OUTPUT_DIR || '/output');
mkdirSync(out, { recursive: true });

for (const dir of ['game', 'screenshots']) {
  rmSync(join(out, dir), { recursive: true, force: true });
  cpSync(join(import.meta.dirname, dir), join(out, dir), { recursive: true });
}

const dossier = buildDossier(out, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
});

writeFileSync(join(out, 'dossier.json'), dossier);
console.log(`dossier.json written to ${join(out, 'dossier.json')} (${dossier.length} bytes)`);
