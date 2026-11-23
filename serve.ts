// Minimal Node stdlib static file server for game/ on http://localhost:8080
// Usage: node serve.ts [--port N]
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, normalize, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), 'game');
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
  '.txt': 'text/plain; charset=utf-8',
  '.woff2': 'font/woff2',
};
let port = 8080;
const pi = process.argv.indexOf('--port');
if (pi > 0 && process.argv[pi + 1]) port = Number(process.argv[pi + 1]) || 8080;

const server = createServer(async (req, res) => {
  try {
    let urlPath = decodeURIComponent((req.url ?? '/').split('?')[0]);
    if (urlPath.endsWith('/')) urlPath += 'index.html';
    const rel = normalize(urlPath.replace(/^[/\\]+/, ''));
    const file = resolve(ROOT, rel);
    if (!file.startsWith(resolve(ROOT) + '')) {
      res.writeHead(403).end('forbidden');
      return;
    }
    const s = await stat(file).catch(() => null);
    if (!s || !s.isFile()) {
      res.writeHead(404).end('not found');
      return;
    }
    const body = await readFile(file);
    res.writeHead(200, {
      'content-type': MIME[extname(file).toLowerCase()] ?? 'application/octet-stream',
      'content-length': body.length,
      'cache-control': 'no-store',
    });
    res.end(req.method === 'HEAD' ? undefined : body);
  } catch (err) {
    res.writeHead(500).end('error: ' + (err as Error).message);
  }
});

server.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`serve: port ${port} is busy — close the other server or run \`node serve.ts --port ${port + 1}\``);
    process.exit(1);
  }
  console.error('serve: ' + err.message);
  process.exit(1);
});

server.listen(port, () => console.log(`serve: http://localhost:${port}/ (Ctrl+C to stop)`));

process.on('SIGINT', () => {
  console.log('\nserve: bye');
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 200);
});
