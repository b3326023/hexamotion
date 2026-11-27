import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../dist',
);
const port = Number(process.env.HEXAMOTION_PORT || 4187);
const identity = 'hexamotion-studio';
const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.rsc': 'text/x-component',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.wasm': 'application/wasm',
  '.ico': 'image/x-icon',
  '.pdf': 'application/pdf',
  '.md': 'text/markdown; charset=utf-8',
};
if (!fs.existsSync(path.join(root, 'index.html')))
  throw new Error('Missing dist/index.html. Run pnpm build first.');
const server = http.createServer(async (req, res) => {
  let url;
  try {
    url = new URL(req.url, `http://127.0.0.1:${port}`);
  } catch {
    res.writeHead(400).end();
    return;
  }
  if (url.pathname === '/__stewart_health') {
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    });
    res.end(JSON.stringify({ app: identity, pid: process.pid, root, port }));
    return;
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405).end();
    return;
  }
  let file;
  try {
    file = path.resolve(root, '.' + decodeURIComponent(url.pathname));
  } catch {
    res.writeHead(400).end();
    return;
  }
  if (!file.startsWith(root + path.sep) && file !== root) {
    res.writeHead(403).end();
    return;
  }
  try {
    let stat = await fs.promises.stat(file);
    if (stat.isDirectory()) {
      file = path.join(file, 'index.html');
      stat = await fs.promises.stat(file);
    }
    if (!stat.isFile()) throw new Error('Not a file');
    res.writeHead(200, {
      'Content-Type': mime[path.extname(file)] || 'application/octet-stream',
      'Content-Length': stat.size,
      'Cache-Control': 'no-cache',
      'X-Content-Type-Options': 'nosniff',
    });
    if (req.method === 'HEAD') res.end();
    else
      fs.createReadStream(file)
        .on('error', () => res.destroy())
        .pipe(res);
  } catch {
    res
      .writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
      .end('404 — File not found');
  }
});
server.on('error', (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
server.listen(port, '127.0.0.1', () =>
  console.log(`Stewart Platform ready: http://127.0.0.1:${port}/`),
);
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, () => server.close(() => process.exit(0)));
