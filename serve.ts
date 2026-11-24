// serve.ts — tiny Node 22 stdlib static server for game/ on http://localhost:8080
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, normalize, extname, resolve } from 'node:path';

const ROOT = resolve('game');
const PORT = (() => {
  const i = process.argv.indexOf('--port');
  return i > 0 && process.argv[i + 1] ? Number(process.argv[i + 1]) || 8080 : 8080;
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
  '.txt': 'text/plain; charset=utf-8',
};

function tryListen(port: number, attemptsLeft: number) {
  const server = createServer(async (req, res) => {
    try {
      let path = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname);
      if (path === '/') path = '/index.html';
      const abs = normalize(join(ROOT, path));
      if (!abs.startsWith(ROOT)) {
        res.writeHead(403).end('forbidden');
        return;
      }
      const st = await stat(abs).catch(() => null);
      if (!st || st.isDirectory()) {
        res.writeHead(404).end('not found');
        return;
      }
      const body = await readFile(abs);
      res.writeHead(200, {
        'content-type': MIME[extname(abs).toLowerCase()] ?? 'application/octet-stream',
        'content-length': String(body.length),
        'cache-control': 'no-store',
      });
      if (req.method === 'HEAD') res.end();
      else res.end(body);
    } catch (e) {
      res.writeHead(500).end('error');
    }
  });

  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`port ${port} is busy — pass another with --port N`);
      process.exit(1);
    }
    throw err;
  });

  server.listen(port, () => {
    console.log(`serving game/ on http://localhost:${port}`);
    console.log('Ctrl+C to stop');
  });
}

tryListen(PORT, 0);

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => {
    console.log('bye');
    process.exit(0);
  });
}
