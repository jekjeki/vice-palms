// Vice Palms — static file server for game/ (Node 22, stdlib only).
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, normalize, resolve, extname } from 'node:path';

const args = process.argv.slice(2);
const flag = args.indexOf('--port');
const port = flag >= 0 ? Number(args[flag + 1]) || 8080 : 8080;
const root = resolve('game');
const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? '/', 'http://localhost');
    let p = decodeURIComponent(url.pathname);
    if (p.endsWith('/')) p += 'index.html';
    const file = resolve(join(root, normalize(p).replace(/^([/\\])+/, '')));
    if (!file.startsWith(root)) { res.writeHead(403); res.end('forbidden'); return; }
    const s = await stat(file).catch(() => null);
    if (!s || s.isDirectory()) { res.writeHead(404); res.end('not found'); return; }
    const body = await readFile(file);
    res.writeHead(200, {
      'content-type': MIME[extname(file).toLowerCase()] ?? 'application/octet-stream',
      'content-length': body.length,
    });
    if (req.method === 'HEAD') res.end(); else res.end(body);
  } catch {
    res.writeHead(500); res.end('error');
  }
});

server.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${port} is busy — try: node serve.ts --port ${port + 1}`);
    process.exit(1);
  }
  throw err;
});
server.listen(port, () => console.log(`Vice Palms serving game/ at http://localhost:${port}`));
process.on('SIGINT', () => {
  console.log('\nVice Palms: shutting down.');
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 200).unref();
});
