// serve.ts — tiny static server for game/ on http://localhost:8080.
// Node 22 stdlib only. `npx tsx serve.ts --port 3000` style usage:
//   node serve.ts            -> port 8080
//   node serve.ts --port N   -> port N
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, normalize, extname } from 'node:path';

const args = process.argv.slice(2);
let port = 8080;
const pi = args.indexOf('--port');
if (pi !== -1 && args[pi + 1]) port = parseInt(args[pi + 1], 10) || 8080;

const ROOT = join(process.cwd(), 'game');

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

const server = createServer(async (req, res) => {
  try {
    let urlPath = decodeURIComponent((req.url ?? '/').split('?')[0]!);
    if (urlPath === '/') urlPath = '/index.html';
    // traversal guard: resolve inside ROOT only
    const safe = normalize(urlPath).replace(/^([/\\])+/, '');
    const file = join(ROOT, safe);
    if (!file.startsWith(ROOT)) {
      res.writeHead(403).end('forbidden');
      return;
    }
    const data = await readFile(file);
    res.writeHead(200, {
      'content-type': MIME[extname(file).toLowerCase()] ?? 'application/octet-stream',
      'cache-control': 'no-store',
    });
    if (req.method === 'HEAD') res.end();
    else res.end(data);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain' }).end('404 not found');
  }
});

server.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`port ${port} is busy — is another serve.ts already running?`);
    process.exit(1);
  }
  throw err;
});

server.listen(port, () => {
  console.log(`serving game/ at http://localhost:${port}`);
});

process.on('SIGINT', () => {
  server.close(() => process.exit(0));
  process.exit(0);
});
