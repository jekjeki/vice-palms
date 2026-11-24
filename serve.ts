// Vice Palms — static dev server for game/ (Node 22 stdlib only).
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, resolve, extname, sep } from 'node:path';

const ROOT = resolve('game');
const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.wasm': 'application/wasm',
  '.mp3': 'audio/mpeg',
};

let port = 8080;
const pi = process.argv.indexOf('--port');
if (pi > 0 && process.argv[pi + 1]) port = Number(process.argv[pi + 1]) || 8080;

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? '/', 'http://localhost');
    let p = decodeURIComponent(url.pathname);
    if (p.endsWith('/')) p += 'index.html';
    const file = resolve(join(ROOT, p));
    if (file !== ROOT && !file.startsWith(ROOT + sep)) {
      res.writeHead(403);
      res.end('forbidden');
      return;
    }
    const st = await stat(file).catch(() => null);
    if (!st || st.isDirectory()) {
      res.writeHead(404);
      res.end('not found');
      return;
    }
    const body = req.method === 'HEAD' ? null : await readFile(file);
    res.writeHead(200, {
      'content-type': MIME[extname(file).toLowerCase()] ?? 'application/octet-stream',
      'content-length': st.size,
      'cache-control': 'no-store',
    });
    res.end(body);
  } catch {
    try { res.writeHead(500); res.end('error'); } catch { /* socket gone */ }
  }
});

server.on('error', (e: NodeJS.ErrnoException) => {
  if (e.code === 'EADDRINUSE') {
    console.error(`Port ${port} is busy — another Vice Palms server is already running there.`);
    process.exit(1);
  }
  throw e;
});

server.listen(port, () => console.log(`Vice Palms → http://localhost:${port}/  (Ctrl+C to stop)`));
process.on('SIGINT', () => {
  server.close(() => process.exit(0));
  process.exit(0);
});
