// serve.ts — tiny static server for game/ on http://localhost:8080.
// Node 22 stdlib only. `node serve.ts [--port N]`.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, normalize, extname } from 'node:path';

const ROOT = join(process.cwd(), 'game');
const argPort = process.argv.indexOf('--port');
const PORT = argPort > -1 ? Number(process.argv[argPort + 1]) || 8080 : 8080;

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.ts': 'text/plain; charset=utf-8',
};

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? '/', 'http://x');
    let p = normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, '');
    if (!p || p === '.') p = 'index.html';
    const file = join(ROOT, p);
    // traversal guard: resolved path must stay inside ROOT
    if (!file.startsWith(ROOT)) {
      res.writeHead(403).end('forbidden');
      return;
    }
    const data = await readFile(file);
    res.writeHead(200, {
      'content-type': MIME[extname(file).toLowerCase()] ?? 'application/octet-stream',
      'cache-control': 'no-store',
    });
    res.end(req.method === 'HEAD' ? undefined : data);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain' }).end('404 not found');
  }
});

server.on('error', (e: NodeJS.ErrnoException) => {
  if (e.code === 'EADDRINUSE') {
    console.error(`port ${PORT} is busy — is another serve.ts already running?`);
    process.exit(1);
  }
  throw e;
});

server.listen(PORT, () => console.log(`vice palms serving game/ on http://localhost:${PORT}`));
process.on('SIGINT', () => {
  console.log('\nbye');
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 300).unref();
});
