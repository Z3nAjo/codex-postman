import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { json } from './http.js';

const files = { '/': ['index.html', 'text/html'], '/app.js': ['app.js', 'text/javascript'], '/style.css': ['style.css', 'text/css'], '/request-variables.js': ['request-variables.js', 'text/javascript'] };
const modules = ['ui', 'request', 'library', 'environments', 'layout'];
for (const name of modules) files[`/modules/${name}.js`] = [`modules/${name}.js`, 'text/javascript'];

export async function serveStatic(req, res, pathname, publicDir) {
  if (req.method !== 'GET') return json(res, 405, { error: 'Method not allowed' });
  if (pathname === '/api/environment') return json(res, 200, JSON.parse(await readFile(new URL('../environments/example.json', import.meta.url), 'utf8')));
  const file = files[pathname];
  if (!file) return json(res, 404, { error: 'Not found' });
  res.writeHead(200, { 'Content-Type': `${file[1]}; charset=utf-8`, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'self'; style-src 'self'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'" });
  res.end(await readFile(resolve(publicDir, file[0])));
}
