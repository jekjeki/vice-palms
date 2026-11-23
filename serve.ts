// Static dev server for game/ — Node 22 TypeScript, stdlib only.
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize, sep } from "node:path";

const portArg = process.argv.indexOf("--port");
const port = portArg > -1 ? Number(process.argv[portArg + 1]) : 8080;
const root = normalize(join(process.cwd(), "game") + sep);

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

createServer(async (req, res) => {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405, { Allow: "GET, HEAD" });
    return res.end();
  }
  const rel = decodeURIComponent(new URL(req.url!, "http://x").pathname).replace(/^\/+/, "");
  const abs = normalize(join(root, rel));
  if (abs !== root && !abs.startsWith(root)) {
    res.writeHead(403);
    return res.end();
  }
  try {
    let file = abs;
    if ((await stat(file)).isDirectory()) file = join(file, "index.html");
    const body = await readFile(file);
    res.writeHead(200, { "Content-Type": MIME[extname(file)] ?? "application/octet-stream" });
    res.end(req.method === "HEAD" ? undefined : body);
  } catch {
    res.writeHead(404);
    res.end("Not found");
  }
})
  .on("error", (e: NodeJS.ErrnoException) => {
    if (e.code === "EADDRINUSE")
      console.error(`Port ${port} is busy — is another server already running?`);
    else throw e;
    process.exit(1);
  })
  .listen(port, () => console.log(`Serving game/ at http://localhost:${port}/`));

process.on("SIGINT", () => {
  console.log("\nStopped.");
  process.exit(0);
});
