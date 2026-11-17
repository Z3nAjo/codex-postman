import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createServer } from './server.js';

test('local client serves UI and proxies CRUD, credentials, errors, and redirects', async t => {
  const upstream = http.createServer(async (req, res) => {
    if (req.url === '/redirect') { res.writeHead(302, { location: '/echo' }); return res.end(); }
    if (req.url === '/missing') { res.writeHead(404); return res.end('missing'); }
    const chunks = []; for await (const chunk of req) chunks.push(chunk);
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ method: req.method, auth: req.headers.authorization, key: req.headers['x-api-key'], body: Buffer.concat(chunks).toString() }));
  });
  const app = createServer();
  await new Promise(resolve => upstream.listen(0, '127.0.0.1', resolve));
  await new Promise(resolve => app.listen(0, '127.0.0.1', resolve));
  t.after(() => Promise.all([new Promise(resolve => app.close(resolve)), new Promise(resolve => upstream.close(resolve))]));
  const base = `http://127.0.0.1:${app.address().port}`;
  const target = `http://127.0.0.1:${upstream.address().port}`;
  const send = (input, extra = {}) => fetch(`${base}/api/request`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...extra }, body: JSON.stringify(input) });
  assert.match(await (await fetch(base)).text(), /Request Lab/);
  for (const module of ['ui', 'request', 'environments', 'library', 'layout']) {
    const asset = await fetch(`${base}/modules/${module}.js`);
    assert.equal(asset.status, 200); assert.match(asset.headers.get('content-type'), /text\/javascript/);
  }
  assert.equal((await fetch(`${base}/modules/unknown.js`)).status, 404);
  assert.equal((await (await fetch(`${base}/api/environment`)).json()).name, 'Demo');
  for (const method of ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'QUERY']) {
    const response = await send({ method, url: `${target}/echo`, headers: { Authorization: 'Bearer dynamic-token', 'X-API-Key': 'dynamic-key' }, body: '{"title":"test"}' });
    assert.equal(response.status, 200);
    const data = await response.json(); assert.equal(data.status, 200);
    const echo = JSON.parse(data.body); assert.equal(echo.method, method); assert.equal(echo.auth, 'Bearer dynamic-token'); assert.equal(echo.key, 'dynamic-key');
    assert.equal(echo.body, method === 'GET' ? '' : '{"title":"test"}');
  }
  const head = await (await send({ method: 'HEAD', url: `${target}/echo` })).json();
  assert.equal(head.status, 200); assert.equal(head.body, '');
  assert.equal((await (await send({ method: 'GET', url: `${target}/missing` })).json()).status, 404);
  assert.equal((await (await send({ method: 'GET', url: `${target}/redirect` })).json()).status, 302);
  assert.equal((await send({ method: 'GET', url: 'file:///etc/passwd' })).status, 400);
  assert.equal((await send({ method: 'TRACE', url: target })).status, 400);
  assert.equal((await send({ method: 'GET', url: target }, { Origin: 'https://example.com' })).status, 403);
  assert.equal((await fetch(`${base}/unknown`)).status, 404);
});

test('saved JSON calls persist, update, duplicate, export, and delete safely', async t => {
  const { mkdtemp, readFile, readdir, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const dir = await mkdtemp(join(tmpdir(), 'request-lab-'));
  const app = createServer({ callsDir: dir });
  await new Promise(resolve => app.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await new Promise(resolve => app.close(resolve)); await rm(dir, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${app.address().port}/api/calls`;
  const api = (path = '', method = 'GET', data) => fetch(base + path, { method, headers: { 'Content-Type': 'application/json' }, ...(data === undefined ? {} : { body: JSON.stringify(data) }) });
  const call = { description: 'Read a customer by ID.', tags: ['customers', 'api_v2', 'read-only'], name: 'Get customers', method: 'GET', url: '{{baseUrl}}/customers/:CUSTOMER_ID', variables: { CUSTOMER_ID: '{{customerId}}' }, headers: { Accept: 'application/json' }, body: '', auth: { type: 'bearer', values: { token: '{{token}}', password: 'unused' } } };
  const created = await api('', 'POST', call); assert.equal(created.status, 201);
  const saved = await created.json(); assert.equal(saved.id, 'get-customers');
  assert.deepEqual(saved.auth.values, { token: '{{token}}' });
  const disk = JSON.parse(await readFile(join(dir, 'get-customers.json'), 'utf8')); assert.equal(disk.url, call.url); assert.deepEqual(disk.variables, call.variables); assert.deepEqual(disk.tags, call.tags); assert.equal(disk.description, call.description); assert.equal(disk.id, undefined);
  assert.equal((await api('', 'POST', call)).status, 409);
  assert.equal((await (await api()).json()).length, 1);
  assert.equal((await (await api('/get-customers')).json()).auth.values.token, '{{token}}');
  const updated = await api('/get-customers', 'PUT', { ...call, name: 'Customers v2', method: 'POST', body: '{"name":"new"}' }); assert.equal(updated.status, 200);
  for (const suffix of ['_copy', '_copy_2']) {
    const copy = await (await api('/get-customers/copy', 'POST')).json(); assert.equal(copy.id, `get-customers${suffix}`); assert.equal(copy.name, `Customers v2${suffix}`); assert.equal(copy.body, '{"name":"new"}'); assert.deepEqual(copy.variables, call.variables); assert.deepEqual(copy.tags, call.tags); assert.equal(copy.description, call.description);
  }
  const { exportLibrary } = await import('./public/modules/library.js');
  const bundle = await exportLibrary(async (path = '') => (await api(path)).json());
  assert.equal(bundle.version, 1); assert.equal(bundle.requests.length, 3);
  assert.equal(bundle.requests[0].body, '{"name":"new"}');
  assert.deepEqual(bundle.requests[0].variables, call.variables);
  assert.deepEqual(bundle.requests[0].tags, call.tags);
  assert.equal(bundle.requests[0].description, call.description);
  assert.deepEqual(bundle.requests[0].auth.values, { token: '{{token}}' });
  assert.equal(bundle.requests[0].id, undefined);
  assert.deepEqual(await exportLibrary(async () => []), { version: 1, requests: [] });
  assert.equal((await readdir(dir)).length, 3);
  assert.equal((await api('/get-customers', 'DELETE')).status, 200);
  assert.equal((await api('/get-customers')).status, 404);
  assert.equal((await api('/get-customers', 'PUT', call)).status, 404);
  assert.equal((await api('', 'POST', { ...call, method: 'INVALID' })).status, 400);
  assert.equal((await api('', 'POST', { ...call, tags: ['two words'] })).status, 400);
  assert.deepEqual((await (await api()).json())[0].tags, call.tags);
  assert.equal((await api('/bad%2Fpath', 'DELETE')).status, 400);
  assert.equal((await api('', 'POST', { ...call, name: '../outside' })).status, 201);
  assert.equal((await readdir(dir)).includes('outside.json'), true);
});

test('environment files autosave, use sequential fallback names, and reload', async t => {
  const { mkdtemp, readFile, readdir, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os'); const { join } = await import('node:path');
  const dir = await mkdtemp(join(tmpdir(), 'request-env-'));
  const app = createServer({ environmentsDir: dir });
  await new Promise(resolve => app.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await new Promise(resolve => app.close(resolve)); await rm(dir, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${app.address().port}/api/environments`;
  const api = async (path = '', method = 'GET', data) => {
    const response = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json' }, ...(data === undefined ? {} : { body: JSON.stringify(data) }) });
    return { status: response.status, data: await response.json() };
  };
  for (const id of ['environment_1', 'environment_2']) assert.equal((await api('', 'POST', { name: '', variables: {} })).data.id, id);
  assert.equal((await api('', 'POST', { name: 'Staging', variables: { token: '{{secret}}' } })).data.id, 'Staging');
  assert.equal((await api('', 'POST', { name: 'Staging', variables: {} })).data.id, 'Staging_2');
  assert.equal((await api('/Staging', 'PUT', { name: 'Renamed', variables: { baseUrl: 'https://example.com', count: 5, enabled: true } })).status, 200);
  const disk = JSON.parse(await readFile(join(dir, 'Staging.json'), 'utf8')); assert.equal(disk.name, 'Renamed'); assert.equal(disk.variables.count, '5');
  assert.equal((await api()).data.find(item => item.id === 'Staging').data.variables.enabled, 'true');
  assert.equal((await api('/Staging', 'PUT', { name: 'Bad', variables: { a: {} } })).status, 400);
  assert.equal((await api('/bad%2Fpath', 'PUT', { name: 'Bad', variables: {} })).status, 400);
  assert.equal((await api('/environment_2', 'DELETE')).status, 200);
  assert.equal((await readdir(dir)).length, 3);
});

test('environment import writes files and listing reports invalid files', async t => {
  const { mkdtemp, readFile, writeFile, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os'); const { join } = await import('node:path');
  const dir = await mkdtemp(join(tmpdir(), 'request-import-'));
  const app = createServer({ environmentsDir: dir });
  await new Promise(resolve => app.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await new Promise(resolve => app.close(resolve)); await rm(dir, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${app.address().port}/api/environments`;
  const imported = await fetch(base + '/import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ environments: [{ name: 'QA', variables: { baseUrl: 'https://example.com' } }, { name: 'Prod', values: [{ key: 'token', value: 'test' }, { key: 'disabled', value: 'skip', enabled: false }] }] }) });
  assert.equal(imported.status, 201);
  const result = await imported.json(); assert.equal(result.directory, dir); assert.equal(result.imported.length, 2);
  assert.equal(JSON.parse(await readFile(join(dir, 'QA.json'), 'utf8')).variables.baseUrl, 'https://example.com');
  assert.deepEqual(JSON.parse(await readFile(join(dir, 'Prod.json'), 'utf8')).variables, { token: 'test' });
  await writeFile(join(dir, 'my environment.local.json'), '\uFEFF' + JSON.stringify({ variables: { id: 7 } }));
  await writeFile(join(dir, 'broken.json'), 'not JSON');
  const list = await (await fetch(base)).json(); assert.equal(list.length, 3); assert.ok(list.some(item => item.id === 'my environment.local'));
  const diagnostics = await (await fetch(base + '/storage')).json(); assert.equal(diagnostics.directory, dir); assert.equal(diagnostics.warnings.length, 1); assert.match(diagnostics.warnings[0], /broken.json/);
  const update = await fetch(base + '/' + encodeURIComponent('my environment.local'), { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Local', variables: { id: 9 } }) });
  assert.equal(update.status, 200); assert.equal(JSON.parse(await readFile(join(dir, 'my environment.local.json'), 'utf8')).variables.id, '9');
  const invalid = await fetch(base + '/import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ environments: [{ name: 'NoPartial', variables: {} }, { name: 'Bad', variables: [] }] }) });
  assert.equal(invalid.status, 400); assert.equal((await (await fetch(base)).json()).length, 3);
});


test('request URL placeholders encode values without changing hosts, ports or literals', async () => {
  const { urlVariableNames, resolveRequestUrl } = await import('./public/request-variables.js');
  assert.deepEqual(urlVariableNames('{{baseUrl}}/users/:USER_ID/posts/:POST_ID?owner=:USER_ID'), ['USER_ID', 'POST_ID']);
  assert.equal(resolveRequestUrl('http://localhost:3000/users/:USER_ID?q=:QUERY', { USER_ID: 'a/b', QUERY: 'x y&z#ü' }), 'http://localhost:3000/users/a%2Fb?q=x%20y%26z%23%C3%BC');
  assert.equal(resolveRequestUrl('http://[::1]:8080/users/:ID', { ID: '5' }), 'http://[::1]:8080/users/5');
  assert.equal(resolveRequestUrl('https://example.com/time?at=12:30&url=https://foo.test', {}), 'https://example.com/time?at=12:30&url=https://foo.test');
  assert.throws(() => resolveRequestUrl('https://example.com/:MISSING', {}), /Missing request URL variable/);
  assert.equal(resolveRequestUrl('https://example.com/:ID/:ID', { ID: '7' }), 'https://example.com/7/7');
});


test('URL variable typing reuses one row per placeholder and preserves values', async () => {
  const { reconcileUrlVariables } = await import('./public/request-variables.js');
  let rows = [];
  for (const name of ['U', 'US', 'USE', 'USER', 'USER_', 'USER_I', 'USER_ID']) {
    rows = reconcileUrlVariables(`https://example.com/:${name}`, rows);
    assert.equal(rows.length, 1); assert.equal(rows[0].name, name);
    rows[0].value = '42';
  }
  assert.equal(rows[0].value, '42');
  rows = reconcileUrlVariables('https://example.com/:USER_ID/:POST_ID', rows);
  assert.equal(rows.length, 2); rows[1].value = '7';
  rows = reconcileUrlVariables('https://example.com/:POST_ID', rows);
  assert.equal(rows.length, 1); assert.equal(rows[0].value, '7');
  rows = reconcileUrlVariables('https://example.com/:POST_ID/:POST_ID', rows); assert.equal(rows.length, 1);
  rows.push({ name: 'MANUAL', value: 'keep', automatic: false });
  rows = reconcileUrlVariables('https://example.com/', rows); assert.deepEqual(rows, [{ name: 'MANUAL', value: 'keep', automatic: false }]);
});


test('request tag validation supports single words and legacy requests', async () => {
  const { normalizeTags } = await import('./public/request-tags.js');
  const { validateCall } = await import('./src/schemas.js');
  assert.deepEqual(normalizeTags(), []);
  assert.deepEqual(normalizeTags(['api_v2', 'read-only', 'api_v2', 'café']), ['api_v2', 'read-only', 'café']);
  for (const invalid of [['two words'], ['tab\tname'], ['line\nname'], [''], [' api'], ['api/test'], ['a.b'], [42], 'api', null]) assert.throws(() => normalizeTags(invalid), /Tags must/);
  const legacy = validateCall({ name: 'Old', method: 'GET', url: 'https://example.com', headers: {}, body: '' });
  assert.deepEqual(legacy.tags, []);
  assert.equal(legacy.description, '');
  assert.throws(() => validateCall({ ...legacy, description: {} }), /description must be text/);
});

test('library folders persist, reject nesting, and keep request moves and copies', async t => {
  const { mkdtemp, readFile, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os'); const { join } = await import('node:path');
  const dir = await mkdtemp(join(tmpdir(), 'request-folders-'));
  const app = createServer({ callsDir: dir });
  await new Promise(resolve => app.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await new Promise(resolve => app.close(resolve)); await rm(dir, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${app.address().port}/api`;
  const api = (path, method = 'GET', data) => fetch(base + path, { method, headers: { 'Content-Type': 'application/json' }, ...(data ? { body: JSON.stringify(data) } : {}) });
  const folder = await (await api('/folders', 'POST', { name: 'Customers' })).json();
  const other = await (await api('/folders', 'POST', { name: 'Orders' })).json();
  assert.equal(folder.parentId, null);
  const renamed = await (await api('/folders', 'PUT', { id: folder.id, name: 'Clients' })).json();
  assert.equal(renamed.id, folder.id); assert.equal(renamed.name, 'Clients');
  assert.equal((await api('/folders', 'PUT', { id: folder.id, name: 'Orders' })).status, 400);
  assert.equal((await api('/folders', 'PUT', { id: folder.id, name: ' ' })).status, 400);
  assert.equal((await api('/folders', 'PUT', { id: 'missing', name: 'Missing' })).status, 404);
  assert.equal((await api('/folders', 'POST', { name: 'Nested', parentId: folder.id })).status, 400);
  assert.equal((await api('/folders', 'POST', { name: 'clients' })).status, 400);
  assert.equal(JSON.parse(await readFile(join(dir, '.folders.json'), 'utf8')).length, 2);
  const call = { name: 'Folder request', method: 'GET', url: 'https://example.com', headers: {}, body: '', folderId: folder.id };
  const saved = await (await api('/calls', 'POST', call)).json();
  assert.equal((await (await api('/calls')).json())[0].folderId, folder.id);
  assert.equal((await (await api(`/calls/${saved.id}/copy`, 'POST')).json()).folderId, folder.id);
  for (const folderId of [other.id, null]) {
    assert.equal((await api(`/calls/${saved.id}`, 'PUT', { ...call, folderId })).status, 200);
    assert.equal((await (await api(`/calls/${saved.id}`)).json()).folderId, folderId);
  }
  assert.equal((await api(`/calls/${saved.id}`, 'PUT', { ...call, folderId: 'missing' })).status, 400);
  const { exportLibrary } = await import('./public/modules/library.js');
  const folders = await (await api('/folders')).json();
  const bundle = await exportLibrary(async (path = '') => (await api('/calls' + path)).json(), folders);
  assert.deepEqual(bundle.folders, folders);
  assert.equal(bundle.requests.find(request => request.folderId)?.folderId, folder.id);
  assert.equal((await api('/calls')).status, 200);
  assert.equal((await fetch(base.replace('/api', '') + '/modules/folders.js')).status, 200);
});
