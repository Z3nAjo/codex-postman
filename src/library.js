import { mkdir, readdir, readFile, unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { json, readJson } from './http.js';
import { validateCall } from './schemas.js';
import { writeJson, updateJson } from './storage.js';

export async function handleLibrary(req, res, pathname, callsDir) {
  await mkdir(callsDir, { recursive: true });
  const parts = pathname.split('/').slice(3);
  const id = parts[0];
  if (id && !/^[a-zA-Z0-9_-]{1,150}$/.test(id)) throw new Error('Invalid request ID');
  if (parts.length > 2 || (parts[1] && parts[1] !== 'copy')) return json(res, 404, { error: 'Not found' });
  const path = id ? resolve(callsDir, `${id}.json`) : null;
  if (req.method === 'GET' && !id) {
    const names = (await readdir(callsDir)).filter(name => /^[a-zA-Z0-9_-]{1,150}\.json$/.test(name)).sort();
    const calls = [];
    for (const name of names) {
      try { const call = validateCall(JSON.parse(await readFile(resolve(callsDir, name), 'utf8'))); calls.push({ id: name.slice(0, -5), name: call.name, method: call.method, url: call.url }); }
      catch { /* An invalid hand-edited file must not hide other saved calls. */ }
    }
    return json(res, 200, calls);
  }
  if (req.method === 'GET' && id && !parts[1]) return json(res, 200, { ...validateCall(JSON.parse(await readFile(path, 'utf8'))), id });
  if (req.method === 'DELETE' && id && !parts[1]) { await unlink(path); return json(res, 200, { deleted: id }); }
  if (!['POST', 'PUT'].includes(req.method)) return json(res, 405, { error: 'Method not allowed' });
  if (!req.headers['content-type']?.startsWith('application/json')) return json(res, 415, { error: 'Use application/json' });
  if (req.method === 'POST' && id && parts[1] === 'copy') {
    const source = validateCall(JSON.parse(await readFile(path, 'utf8')));
    for (let index = 1; index < 10000; index++) {
      const suffix = index === 1 ? '_copy' : `_copy_${index}`;
      const copyId = id.slice(0, 130) + suffix;
      const copy = { ...source, name: source.name.slice(0, 85) + suffix };
      try { await writeJson(resolve(callsDir, `${copyId}.json`), copy, true); return json(res, 201, { ...copy, id: copyId }); }
      catch (error) { if (error.code !== 'EEXIST') throw error; }
    }
    throw new Error('Too many copies');
  }
  if (parts[1] || (req.method === 'PUT' && !id) || (req.method === 'POST' && id)) return json(res, 405, { error: 'Method not allowed' });
  const call = validateCall(await readJson(req));
  if (req.method === 'PUT') {
    await updateJson(path, call);
    return json(res, 200, { ...call, id });
  }
  const newId = call.name.toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 90) || 'call';
  try { await writeJson(resolve(callsDir, `${newId}.json`), call, true); }
  catch (error) { if (error.code === 'EEXIST') return json(res, 409, { error: 'A request with this filename already exists. Choose another name or load it to update.' }); throw error; }
  return json(res, 201, { ...call, id: newId });
}
