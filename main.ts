// ============================================================
// main.ts — make.fun build entrypoint for Vice Palms (build #9)
// Node 22, TypeScript, stdlib only.
//
// Behavior:
//   * out dir = process.env.MAKEFUN_OUTPUT_DIR or /output
//   * recursively copy game/ -> <out>/game/, screenshots/ -> <out>/screenshots/
//   * import buildDossier from ./vendor/makefun-game.ts
//   * write <out>/dossier.json with the bounty caps
//   * exit 0
// ============================================================

import { buildDossier } from './vendor/makefun-game.ts';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT_DIR = process.env.MAKEFUN_OUTPUT_DIR || '/output';
const ROOT = path.dirname(fileURLToPath(import.meta.url));

// The bounty's caps, passed whole to buildDossier.
const CAPS = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
};

function ensureDir(p: string): void {
  fs.mkdirSync(p, { recursive: true });
}

function copyDir(src: string, dest: string): { files: number; bytes: number } {
  let files = 0;
  let bytes = 0;
  ensureDir(dest);
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name);
    const d = path.join(dest, e.name);
    if (e.isDirectory()) {
      const sub = copyDir(s, d);
      files += sub.files;
      bytes += sub.bytes;
    } else if (e.isFile()) {
      const content = fs.readFileSync(s);
      fs.writeFileSync(d, content);
      files++;
      bytes += content.length;
    }
  }
  return { files, bytes };
}

function main(): number {
  try {
    ensureDir(OUT_DIR);

    // 1. Copy game/ into the entry directory.
    const gameSrc = path.join(ROOT, 'game');
    const gameOut = path.join(OUT_DIR, 'game');
    let gameFiles = 0;
    let gameBytes = 0;
    if (fs.existsSync(gameSrc)) {
      const stats = copyDir(gameSrc, gameOut);
      gameFiles = stats.files;
      gameBytes = stats.bytes;
    } else {
      console.error('main.ts: no game/ directory next to main.ts');
      return 1;
    }

    // 2. Copy screenshots/ into the entry directory.
    const shotsSrc = path.join(ROOT, 'screenshots');
    const shotsOut = path.join(OUT_DIR, 'screenshots');
    if (fs.existsSync(shotsSrc)) {
      copyDir(shotsSrc, shotsOut);
    } else {
      console.error('main.ts: no screenshots/ directory next to main.ts');
      return 1;
    }

    // 3. Build the dossier from the entry directory (the vendor enforces
    //    every cap itself and throws DossierError on a violation).
    const dossierBytes = buildDossier(OUT_DIR, CAPS);

    // 4. Write dossier.json — the vendor has already enforced every cap
    //    (the text cut fits text_max_bytes; images ride as base64 on top).
    const dossierPath = path.join(OUT_DIR, 'dossier.json');
    fs.writeFileSync(dossierPath, dossierBytes);

    // 5. Summary.
    const shots = fs
      .readdirSync(shotsOut)
      .filter((f) => /\.(jpg|jpeg|png)$/i.test(f));
    console.log(
      `Vice Palms dossier: game=${gameFiles} files / ${gameBytes} bytes, ` +
      `shots=${shots.length}, dossier=${dossierBytes.byteLength} bytes -> ${dossierPath}`
    );
    return 0;
  } catch (err) {
    console.error('main.ts failed:', err);
    return 1;
  }
}

process.exitCode = main();
