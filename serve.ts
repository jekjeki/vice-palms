// serve.ts — static dev server for game/ on http://localhost:8080
// Node 22 stdlib only. Usage: node serve.ts [--port N]

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, normalize, extname, resolve } from 'node:path';

const ROOT = resolve('game');
const argPort = (() => {
  const i = process.argv.indexOf('--port');
  if (i >= 0 && process.argv[i + 1]) return parseInt(process.argv[i + 1], 10);
  return 8080;
})();

const MIME = {
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
  '.wasm': 'application/wasm',
  '.txt': 'text/plain; charset=utf-8',
};

let port = argPort;
const server = createServer(async (req, res) => {
  try {
    let url = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (url === '/') url = '/index.html';
    const path = normalize(join(ROOT, url));
    if (!path.startsWith(ROOT)) { res.writeHead(403); res.end('forbidden'); return; }
    const st = await stat(path).catch(() => null);
    if (!st || st.isDirectory()) { res.writeHead(404); res.end('not found'); return; }
    const body = await readFile(path);
    res.writeHead(200, { 'content-type': MIME[extname(path).toLowerCase()] || 'application/octet-stream', 'content-length': body.length });
    if (req.method === 'HEAD') { res.end(); return; }
    res.end(body);
  } catch {
    res.writeHead(500);
    res.end('error');
  }
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.log(`Port ${port} is busy — pick another with: node serve.ts --port N`);
    process.exit(1);
  }
  throw err;
});

server.listen(port, () => console.log(`Vice Palms serving game/ at http://localhost:${port}`));

process.on('SIGINT', () => { server.close(); process.exit(0); });
