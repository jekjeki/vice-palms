// Vice Palms — entry dossier builder (Node 22, stdlib + vendored makefun-game).
// Usage: mkdir out; $env:MAKEFUN_OUTPUT_DIR="out"; node main.ts
import { buildDossier } from './vendor/makefun-game.ts';
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const out = resolve(process.env.MAKEFUN_OUTPUT_DIR || '/output');
mkdirSync(out, { recursive: true });

for (const dir of ['game', 'screenshots'] as const) {
  if (!existsSync(dir)) { console.error(`main: missing ${dir}/ — cannot build the dossier`); process.exit(1); }
  rmSync(join(out, dir), { recursive: true, force: true });
  cpSync(dir, join(out, dir), { recursive: true });
}

const caps = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
};

const bytes = buildDossier(out, caps);
writeFileSync(join(out, 'dossier.json'), bytes);
console.log(`main: wrote ${join(out, 'dossier.json')} (${bytes.length} bytes)`);
