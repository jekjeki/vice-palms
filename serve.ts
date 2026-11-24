// serve.ts — tiny static server for game/ on http://localhost:8080
// Node 22 stdlib only. Usage: node serve.ts [--port N]

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, normalize, extname } from 'node:path';

const root = normalize(join(process.cwd(), 'game'));

const argPort = (() => {
  const i = process.argv.indexOf('--port');
  if (i !== -1 && process.argv[i + 1]) return parseInt(process.argv[i + 1], 10);
  return 8080;
})();

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
  '.map': 'application/json',
  '.wasm': 'application/wasm',
  '.mp3': 'audio/mpeg',
  '.txt': 'text/plain; charset=utf-8',
};

const server = createServer(async (req, res) => {
  try {
    let path = decodeURIComponent((req.url || '/').split('?')[0]);
    if (path.endsWith('/')) path += 'index.html';
    const file = normalize(join(root, path));
    if (!file.startsWith(root)) {
      res.writeHead(403).end('forbidden');
      return;
    }
    const st = await stat(file).catch(() => null);
    if (!st || !st.isFile()) {
      res.writeHead(404).end('not found');
      return;
    }
    const body = await readFile(file);
    res.writeHead(200, {
      'content-type': MIME[extname(file).toLowerCase()] || 'application/octet-stream',
      'content-length': body.length,
      'cache-control': 'no-cache',
    });
    if (req.method === 'HEAD') { res.end(); return; }
    res.end(body);
  } catch (e: any) {
    res.writeHead(500).end('error: ' + e.message);
  }
});

server.on('error', (e: any) => {
  if (e.code === 'EADDRINUSE') {
    console.error(`port ${argPort} is busy — try: node serve.ts --port ${argPort + 1}`);
    process.exit(1);
  }
  throw e;
});

server.listen(argPort, () => {
  console.log(`Vice Palms serving game/ at http://localhost:${argPort}`);
  console.log('Ctrl+C to stop.');
});

process.on('SIGINT', () => {
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 300).unref();
});
