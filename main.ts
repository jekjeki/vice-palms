// main.ts — build the make.fun dossier: stage game/ + screenshots/ into out/,
// then hand the staged dir to the vendored buildDossier.
import { cp, mkdir, writeFile, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { buildDossier } from './vendor/makefun-game.ts';

const out = process.env.MAKEFUN_OUTPUT_DIR || '/output';

await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
await cp(resolve('game'), join(out, 'game'), { recursive: true });
await cp(resolve('screenshots'), join(out, 'screenshots'), { recursive: true });

const dossier = buildDossier(out, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
});

await writeFile(join(out, 'dossier.json'), dossier);
console.log(`dossier written: ${join(out, 'dossier.json')} (${dossier.length} bytes)`);
