// main.ts — make.fun packaging entry. Copies game/ + screenshots/ into the
// output dir and writes dossier.json via the vendored kit builder.
// Node 22 stdlib only. Output dir = $MAKEFUN_OUTPUT_DIR or /output.
import { mkdir, cp, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { buildDossier } from './vendor/makefun-game.ts';

const out = process.env.MAKEFUN_OUTPUT_DIR || '/output';
await mkdir(out, { recursive: true });

// copy the entry tree (game sources) and the screenshots
await cp(join(process.cwd(), 'game'), join(out, 'game'), { recursive: true });
await cp(join(process.cwd(), 'screenshots'), join(out, 'screenshots'), { recursive: true });

// dossier: source text + screenshots of this entry, under the bounty caps
const dossier = buildDossier(process.cwd(), {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
});
await writeFile(join(out, 'dossier.json'), dossier);

console.log(`dossier + trees written to ${out}`);
process.exit(0);
