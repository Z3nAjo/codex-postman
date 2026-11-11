import { mkdir, readdir, readFile, unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { json, readJson } from './http.js';
import { validateEnvironment } from './schemas.js';
import { writeJson, updateJson } from './storage.js';

const parseEnvironmentJson = text => JSON.parse(text.replace(/^\uFEFF/, ''));
const validEnvironmentId = id => typeof id === 'string' && id.length <= 150 && !id.startsWith('.') && !/[\\/\x00-\x1f]/.test(id) && id !== '';
async function listEnvironments(directory) {
  const entries = []; const warnings = [];
  for (const file of (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    if (!file.isFile() || !file.name.toLowerCase().endsWith('.json')) continue;
    const id = file.name.slice(0, -5);
    if (!validEnvironmentId(id)) { warnings.push(`${file.name}: unsupported filename`); continue; }
    try { entries.push({ id, data: validateEnvironment(parseEnvironmentJson(await readFile(resolve(directory, file.name), 'utf8'))) }); }
    catch { warnings.push(`${file.name}: invalid environment JSON; expected a variables object or Postman values array`); }
  }
  return { entries, warnings };
}
async function createEnvironmentFile(directory, env) {
  const namedId = env.name.replace(/[^a-zA-Z0-9_-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 100);
  for (let index = 1; index < 10000; index++) {
    const id = namedId ? namedId + (index === 1 ? '' : `_${index}`) : `environment_${index}`;
    const data = { ...env, name: env.name || id };
    try { await writeJson(resolve(directory, `${id}.json`), data, true); return { id, data }; }
    catch (error) { if (error.code !== 'EEXIST') throw error; }
  }
  throw new Error('Too many environments');
}
export async function handleEnvironments(req, res, pathname, environmentsDir) {
  await mkdir(environmentsDir, { recursive: true });
  if (pathname === '/api/environments/import' && req.method === 'POST') {
    if (!req.headers['content-type']?.startsWith('application/json')) return json(res, 415, { error: 'Use application/json' });
    const input = await readJson(req);
    const source = Array.isArray(input) ? input : input.environments || [input];
    if (!Array.isArray(source) || !source.length) throw new Error('No environments found in file');
    const checked = source.map(validateEnvironment);
    const imported = [];
    try { for (const env of checked) imported.push(await createEnvironmentFile(environmentsDir, env)); }
    catch (error) { await Promise.all(imported.map(item => unlink(resolve(environmentsDir, `${item.id}.json`)))); throw error; }
    return json(res, 201, { imported, directory: resolve(environmentsDir) });
  }
  if (pathname === '/api/environments/storage' && req.method === 'GET') {
    const { warnings } = await listEnvironments(environmentsDir);
    return json(res, 200, { directory: resolve(environmentsDir), warnings });
  }
  const id = pathname === '/api/environments' ? null : decodeURIComponent(pathname.slice('/api/environments/'.length));
  if (id && !validEnvironmentId(id)) throw new Error('Invalid environment ID');
  const path = id ? resolve(environmentsDir, `${id}.json`) : null;
  if (req.method === 'GET' && !id) {
    return json(res, 200, (await listEnvironments(environmentsDir)).entries);
  }
  if (req.method === 'DELETE' && id) { await unlink(path); return json(res, 200, { deleted: id }); }
  if (!['POST', 'PUT'].includes(req.method) || (req.method === 'PUT' && !id) || (req.method === 'POST' && id)) return json(res, 405, { error: 'Method not allowed' });
  if (!req.headers['content-type']?.startsWith('application/json')) return json(res, 415, { error: 'Use application/json' });
  const env = validateEnvironment(await readJson(req));
  if (req.method === 'PUT') {
    if (!env.name) env.name = id;
    await updateJson(path, env);
    return json(res, 200, { id, data: env });
  }
  return json(res, 201, await createEnvironmentFile(environmentsDir, env));
}
