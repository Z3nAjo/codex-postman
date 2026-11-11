import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { json } from './src/http.js';
import { handleEnvironments } from './src/environments.js';
import { handleLibrary } from './src/library.js';
import { handleRequest } from './src/proxy.js';
import { serveStatic } from './src/static.js';

const publicDir = fileURLToPath(new URL('./public/', import.meta.url));
export function createServer({ callsDir = fileURLToPath(new URL('./calls/', import.meta.url)), environmentsDir = fileURLToPath(new URL('./environments/', import.meta.url)) } = {}) {
  return http.createServer(async (req, res) => {
    // The proxy is intended only for this local UI. Reject cross-site requests and DNS rebinding.
    const host = req.headers.host || '';
    if (!/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host)) return json(res, 403, { error: 'Local access only' });
    if (req.headers.origin && req.headers.origin !== `http://${host}`) return json(res, 403, { error: 'Origin rejected' });
    if (req.headers['sec-fetch-site'] === 'cross-site') return json(res, 403, { error: 'Cross-site request rejected' });
    const pathname = new URL(req.url, `http://${host}`).pathname;
    try {
      if (pathname === '/api/environments' || pathname.startsWith('/api/environments/')) return await handleEnvironments(req, res, pathname, environmentsDir);
      if (pathname === '/api/calls' || pathname.startsWith('/api/calls/')) return await handleLibrary(req, res, pathname, callsDir);
      if (pathname === '/api/request' && req.method === 'POST') return await handleRequest(req, res);
      return await serveStatic(req, res, pathname, publicDir);
    } catch (error) {
      json(res, error.code === 'ENOENT' ? 404 : 400, { error: error.name === 'TimeoutError' ? 'Request timed out after 30 seconds' : error.message });
    }
  });
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 4000);
  createServer().listen(port, '127.0.0.1', () => console.log(`Request Lab → http://127.0.0.1:${port}\nEnvironment files → ${fileURLToPath(new URL('./environments/', import.meta.url))}\nOpen the app at this URL, not an IDE HTML preview.`));
}
