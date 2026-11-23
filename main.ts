// Build the make.fun dossier: copy game/ + screenshots/ into the output dir and write dossier.json.
import { mkdir, cp, writeFile, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { buildDossier } from './vendor/makefun-game.ts';

const out = resolve(process.env.MAKEFUN_OUTPUT_DIR || '/output');
await mkdir(out, { recursive: true });
await cp(join(process.cwd(), 'game'), join(out, 'game'), { recursive: true });
await cp(join(process.cwd(), 'screenshots'), join(out, 'screenshots'), { recursive: true });

// Belt-and-braces: a dossier needs 3-4 shots; fail fast with a readable message.
const shots = (await readdir(join(process.cwd(), 'screenshots'))).filter((n) => !n.startsWith('.'));
if (shots.length < 3 || shots.length > 4) {
  console.error(`main: screenshots/ holds ${shots.length} shots, need 3 or 4`);
  process.exit(1);
}

const dossier = buildDossier(process.cwd(), {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
});
await writeFile(join(out, 'dossier.json'), dossier);
console.log(`main: wrote ${out}/dossier.json (${dossier.length} bytes), ${shots.length} shots`);
process.exit(0);
