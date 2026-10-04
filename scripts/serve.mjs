#!/usr/bin/env node
/*
 * Local preview server that behaves like GitHub Pages: folders serve their index.html and
 * anything missing gets 404.html with a 404 status. No dependencies.
 *
 *   node scripts/serve.mjs [--port 4173]
 */
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { dirname, extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const TYPES = {
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8", ".xml": "application/xml; charset=utf-8", ".txt": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2", ".ico": "image/x-icon", ".pdf": "application/pdf"
};

async function resolveFile(root, urlPath) {
  const path = normalize(join(root, decodeURIComponent(urlPath)));
  if (path !== root && !path.startsWith(root + sep)) return null;
  try {
    const info = await stat(path);
    if (info.isDirectory()) return resolveFile(root, join(urlPath, "index.html"));
    return path;
  } catch { return null; }
}

export function serve({ root = ROOT, port = 4173, host = "127.0.0.1" } = {}) {
  const server = createServer(async (req, res) => {
    const { pathname } = new URL(req.url, "http://localhost");
    let file = await resolveFile(root, pathname), status = 200;
    if (!file) { file = join(root, "404.html"); status = 404; }
    res.writeHead(status, { "Content-Type": TYPES[extname(file)] || "application/octet-stream", "Cache-Control": "no-cache" });
    res.end(req.method === "HEAD" ? undefined : await readFile(file));
  });
  return new Promise(ok => server.listen(port, host, () => ok(server)));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const i = process.argv.indexOf("--port");
  const port = i > 0 ? Number(process.argv[i + 1]) : 4173;
  await serve({ port });
  console.log(`Serving ${ROOT} at http://127.0.0.1:${port}/`);
}
