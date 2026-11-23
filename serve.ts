import { createServer } from 'node:http';
import { promises as fs } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve('game');
const PORT = Number(process.argv[2] === '--port' ? process.argv[3] : 8080) || 8080;
const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml',
};

const server = createServer(async (req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { Allow: 'GET, HEAD' }).end('Method Not Allowed');
    return;
  }
  let urlPath: string;
  try {
    urlPath = decodeURIComponent(new URL(req.url ?? '/', `http://localhost:${PORT}`).pathname);
  } catch {
    res.writeHead(400).end('Bad Request');
    return;
  }
  let file = path.resolve(ROOT, '.' + path.posix.normalize(urlPath));
  if (file !== ROOT && !file.startsWith(ROOT + path.sep)) {
    res.writeHead(403).end('Forbidden');
    return;
  }
  let stat = await fs.stat(file).catch(() => null);
  if (stat?.isDirectory()) {
    file = path.join(file, 'index.html');
    stat = await fs.stat(file).catch(() => null);
  }
  if (!stat) {
    res.writeHead(404).end('Not Found');
    return;
  }
  res.writeHead(200, {
    'Content-Type': MIME[path.extname(file).toLowerCase()] ?? 'application/octet-stream',
    'Content-Length': stat.size,
  });
  if (req.method === 'HEAD') return res.end();
  await fs.readFile(file).then((data) => res.end(data)).catch(() => res.end());
});

server.once('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') console.error(`Port ${PORT} is busy — pick another with --port N`);
  else console.error(err);
  process.exit(1);
});

server.listen(PORT, 'localhost', () => console.log(`Serving ${ROOT} at http://localhost:${PORT}`));

process.on('SIGINT', () => {
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 500).unref();
});
