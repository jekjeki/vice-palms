// Vice Palms — entry script for the make.fun entry pipeline. Runs under plain Node 22 with
// type stripping, no build step and no install. It stages the entry directory: the playable
// game/ tree, the screenshots/ set, and the dossier.json that makefun's scorer compares
// against its own run of the vendored library.
//
//   node main.ts                          (writes to /output)
//   MAKEFUN_OUTPUT_DIR=out node main.ts   (writes to ./out)
//
// Nothing here reads the game's sources for editing purposes; it only copies bytes and hands
// the staged directory to buildDossier, whose signature lives in vendor/makefun-game.ts.

import { buildDossier } from './vendor/makefun-game.ts';
import { cpSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

/** The scorer's caps, verbatim from the bounty's gate. Passing them all means this program
 *  fails wherever the scorer would, instead of failing later on a cap this script let slide. */
const CAPS = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
} as const;

/** How the staged tree is named inside the output directory. */
const GAME_DIR = 'game';
const SHOTS_DIR = 'screenshots';
const DOSSIER_FILE = 'dossier.json';

/** Copy one source directory tree into <out>/<name>, creating parents as needed. */
function stage(sourceDir: string, out: string, name: string): void {
  const target = join(out, name);
  mkdirSync(target, { recursive: true });
  cpSync(sourceDir, target, { recursive: true });
}

function run(): void {
  const repo = process.cwd();
  const out = resolve(process.env.MAKEFUN_OUTPUT_DIR ?? '/output');
  mkdirSync(out, { recursive: true });

  stage(join(repo, GAME_DIR), out, GAME_DIR);
  stage(join(repo, SHOTS_DIR), out, SHOTS_DIR);

  const dossier = buildDossier(out, CAPS);
  const target = join(out, DOSSIER_FILE);
  writeFileSync(target, dossier);

  console.log(`staged ${GAME_DIR}/ and ${SHOTS_DIR}/ into ${out}`);
  console.log(`${DOSSIER_FILE}: ${dossier.length} bytes -> ${target}`);
}

try {
  run();
} catch (err) {
  const e = err as NodeJS.ErrnoException;
  console.error(`main: ${(e && e.message) || err}`);
  process.exit(1);
}
