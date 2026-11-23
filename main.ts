// The build entry: stage the entry directory the way the make.fun grader reads it.
// Copies game/ and screenshots/ into the output directory, then writes dossier.json
// through the vendored makefun library — its buildDossier, and nothing else, is the
// only export this file is allowed to know.
//
// Outside the grader: MAKEFUN_OUTPUT_DIR=out node main.ts (the default output
// directory is /output, which is where the scorer mounts the entry).

import { mkdir, cp, writeFile } from 'node:fs/promises';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { buildDossier } from './vendor/makefun-game.ts';

const out = process.env.MAKEFUN_OUTPUT_DIR || '/output';

// The caps this bounty's gate.json names: the dossier text, the screenshot set,
// the game file tree, and the longest path the scorer will walk.
const caps = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
};

await mkdir(out, { recursive: true });

// Fresh copies every build: the output directory is the entry, byte for byte.
await cp('game', path.join(out, 'game'), { recursive: true });
await cp('screenshots', path.join(out, 'screenshots'), { recursive: true });

// The dossier is the vendored library's job: it walks the staged directory and
// emits the canonical makefun/dossier/v1 JSON this bounty is scored from.
const dossier = buildDossier(out, caps);
writeFileSync(path.join(out, 'dossier.json'), dossier);

process.exit(0);
