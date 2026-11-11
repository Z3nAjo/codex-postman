import { readFile, writeFile, rename, unlink } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

export async function writeJson(path, data, exclusive = false) {
  await writeFile(path, JSON.stringify(data, null, 2) + '\n', { mode: 0o600, ...(exclusive ? { flag: 'wx' } : {}) });
}
export async function updateJson(path, data) {
  await readFile(path); // Updates must not recreate deleted files.
  const temporary = resolve(dirname(path), `.${crypto.randomUUID()}.tmp`);
  try { await writeJson(temporary, data); await rename(temporary, path); }
  finally { await unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error; }); }
}
