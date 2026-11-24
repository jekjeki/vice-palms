// Vice Palms — build make.fun dossier from game/ + screenshots/ into the output dir
import { buildDossier } from './vendor/makefun-game.ts';
import { cpSync, mkdirSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const out = process.env.MAKEFUN_OUTPUT_DIR || '/output';
mkdirSync(out, { recursive: true });
cpSync('game', join(out, 'game'), { recursive: true });
if (statSync('screenshots', { throwIfNoEntry: false })?.isDirectory()) {
  cpSync('screenshots', join(out, 'screenshots'), { recursive: true });
}

const caps = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
};
const dossier = buildDossier(out, caps);
writeFileSync(join(out, 'dossier.json'), dossier);
console.log(`dossier written: ${join(out, 'dossier.json')} (${dossier.length} bytes), files: ${readdirSync(join(out, 'game'), { recursive: true }).length}`);
process.exit(0);
