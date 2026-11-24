// Vice Palms — stdlib static file server for game/ on :8080
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, 'game');
const PORT = Number(process.env.PORT) || 8080;
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css', '.json': 'application/json', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
};

createServer(async (req, res) => {
  try {
    let p = decodeURIComponent(new URL(req.url || '/', 'http://x').pathname);
    if (p === '/') p = '/index.html';
    const full = resolve(ROOT, '.' + p);
    if (!full.startsWith(ROOT)) { res.writeHead(403); res.end('forbidden'); return; }
    const file = await readFile(full);
    res.writeHead(200, { 'content-type': MIME[extname(p)] || 'application/octet-stream' });
    res.end(file);
  } catch {
    res.writeHead(404); res.end('not found');
  }
}).listen(PORT, () => console.log(`Vice Palms → http://localhost:${PORT}`));
