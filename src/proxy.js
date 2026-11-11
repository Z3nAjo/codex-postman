import { json, readJson, methods, limit } from './http.js';

export async function handleRequest(req, res) {
  if (!req.headers['content-type']?.startsWith('application/json')) return json(res, 415, { error: 'Use application/json' });
  const input = await readJson(req);
  const url = new URL(input.url);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Only HTTP and HTTPS URLs are supported');
  if (!methods.has(input.method)) throw new Error('Unsupported HTTP method');
  const headers = new Headers(input.headers || {});
  for (const key of ['host', 'connection', 'content-length', 'transfer-encoding']) headers.delete(key);
  const started = performance.now();
  const upstream = await fetch(url, {
    method: input.method, headers,
    body: ['GET', 'HEAD'].includes(input.method) ? undefined : input.body || undefined,
    signal: AbortSignal.timeout(30000), redirect: 'manual'
  });
  const chunks = []; let size = 0;
  if (upstream.body) for await (const chunk of upstream.body) {
    size += chunk.length;
    if (size > limit) throw new Error('Response exceeds 5 MB');
    chunks.push(chunk);
  }
  return json(res, 200, {
    status: upstream.status, statusText: upstream.statusText,
    headers: Object.fromEntries(upstream.headers),
    body: Buffer.concat(chunks).toString('utf8'), size,
    duration: Math.round(performance.now() - started)
  });
}
