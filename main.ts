// ============================================================================
// VICE PALMS — main.ts (build/dossier entry, Node 22, standard library only)
// Stages the submission: copies game/ and screenshots/ into the output
// directory (MAKEFUN_OUTPUT_DIR or /output), then hands both trees to the
// vendored buildDossier and writes out/dossier.json with the bounty's caps.
// ============================================================================
import { mkdir, cp, writeFile, access } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = resolve(dirname(fileURLToPath(import.meta.url)));

const out = process.env.MAKEFUN_OUTPUT_DIR || '/output';
const outDir = resolve(here, out);

await mkdir(outDir, { recursive: true });
await cp(join(here, 'game'), join(outDir, 'game'), { recursive: true });
await cp(join(here, 'screenshots'), join(outDir, 'screenshots'), {
  recursive: true,
  force: true,
});

// The bounty's gate caps (see vendor/makefun-game.ts header for the semantics).
const dossier = buildDossier(outDir, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
});

const dossierPath = join(outDir, 'dossier.json');
await writeFile(dossierPath, dossier);

// Sanity: the dossier must exist and be parseable before we call it done.
const written = await access(dossierPath).then(() => true, () => false);
if (!written) {
  console.error('dossier.json was not written to ' + dossierPath);
  process.exit(1);
}

console.log('VICE PALMS: staged ' + outDir);
console.log('dossier.json written (' + dossier.byteLength + ' bytes)');
process.exit(0);
