// main.ts — build the make.fun dossier: copy game/ and screenshots/ into the
// output directory, then run the vendored kit's buildDossier over it.
// Node 22, stdlib only. Output dir: env MAKEFUN_OUTPUT_DIR or /output.

import { cp, mkdir, writeFile, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { buildDossier } from './vendor/makefun-game.ts';

const out = resolve(process.env.MAKEFUN_OUTPUT_DIR || '/output');
const caps = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
};

await rm(join(out, 'game'), { recursive: true, force: true });
await rm(join(out, 'screenshots'), { recursive: true, force: true });
await mkdir(join(out, 'game'), { recursive: true });
await mkdir(join(out, 'screenshots'), { recursive: true });

await cp('game', join(out, 'game'), { recursive: true });
await cp('screenshots', join(out, 'screenshots'), { recursive: true });

const dossier = buildDossier(out, caps);
await writeFile(join(out, 'dossier.json'), dossier);

console.log(`dossier written: ${join(out, 'dossier.json')} (${dossier.length} bytes)`);
