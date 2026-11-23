// main.ts — the makefun entry point. Copies game/ and screenshots/ into the
// output dir and writes out/dossier.json via the vendored dossier builder.
// Node 22+ stdlib only; run:  node main.ts   (MAKEFUN_OUTPUT_DIR overrides out)
import { mkdir, cp, writeFile, stat, readdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = process.env.MAKEFUN_OUTPUT_DIR || '/output';

const GAME_DIR = join(here, 'game');
const SHOTS_DIR = join(here, 'screenshots');

await mkdir(outDir, { recursive: true });
await cp(GAME_DIR, join(outDir, 'game'), { recursive: true });
try {
  await stat(SHOTS_DIR);
  await cp(SHOTS_DIR, join(outDir, 'screenshots'), { recursive: true });
} catch {
  // screenshots/ missing: buildDossier will complain with a clear message
}

// count what we copied for a sane log line
let gameFiles = 0;
const walk = async (dir: string): Promise<void> => {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) await walk(p);
    else gameFiles++;
  }
};
await walk(join(outDir, 'game'));

const caps = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
};

const dossierBytes = buildDossier(here, caps);
const dossierPath = join(outDir, 'dossier.json');
await writeFile(dossierPath, dossierBytes);

console.log(`game files copied: ${gameFiles}`);
console.log(`dossier written: ${dossierPath} (${dossierBytes.length} bytes)`);
process.exit(0);
