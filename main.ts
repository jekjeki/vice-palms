// Vice Palms — build step: stage game/ + screenshots/ into MAKEFUN_OUTPUT_DIR, write dossier.json.
import { mkdirSync, cpSync, existsSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { buildDossier } from './vendor/makefun-game.ts';

const out = resolve(process.env.MAKEFUN_OUTPUT_DIR || '/output');
mkdirSync(out, { recursive: true });
cpSync('game', join(out, 'game'), { recursive: true });
if (existsSync('screenshots')) cpSync('screenshots', join(out, 'screenshots'), { recursive: true });

const caps = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
};

try {
  const dossier = buildDossier(out, caps);
  writeFileSync(join(out, 'dossier.json'), dossier);
  console.log(`dossier.json written → ${out}`);
} catch (e) {
  console.error('dossier failed:', e instanceof Error ? e.message : e);
  process.exit(1);
}
