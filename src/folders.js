import { readFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { json, readJson } from './http.js';
import { writeJson } from './storage.js';

// Stable IDs and parentId leave room for nested folders without changing requests.
export async function readFolders(callsDir) {
  try { return JSON.parse(await readFile(resolve(callsDir, '.folders.json'), 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return []; throw error; }
}
export async function handleFolders(req, res, callsDir) {
  await mkdir(callsDir, { recursive: true });
  const folders = await readFolders(callsDir);
  if (req.method === 'GET') return json(res, 200, folders);
  if (!['POST', 'PUT'].includes(req.method)) return json(res, 405, { error: 'Method not allowed' });
  const input = await readJson(req);
  const name = typeof input.name === 'string' ? input.name.trim() : '';
  if (!name || name.length > 100) throw new Error('Folder name is required (100 characters maximum)');
  if (input.parentId) throw new Error('Nested folders are not supported yet');
  const existing = req.method === 'PUT' ? folders.find(folder => folder.id === input.id) : null;
  if (req.method === 'PUT' && !existing) return json(res, 404, { error: 'Folder not found' });
  if (folders.some(folder => folder.id !== existing?.id && folder.name.toLowerCase() === name.toLowerCase())) throw new Error('A folder with this name already exists');
  const folder = existing || { id: crypto.randomUUID(), name, parentId: null };
  if (existing) existing.name = name;
  else folders.push(folder);
  await writeJson(resolve(callsDir, '.folders.json'), folders);
  return json(res, existing ? 200 : 201, folder);
}
