import { initFolders } from './folders.js';
import { $, showError, downloadJson, apiJson, actionMenu } from './ui.js';

// Export complete saved requests, rather than the list endpoint's summaries.
export async function exportLibrary(callsApi, folders = []) {
  const summaries = await callsApi();
  const requests = await Promise.all(summaries.map(async ({ id }) => {
    const { id: savedId, ...request } = await callsApi(`/${id}`);
    return request;
  }));
  return { version: 1, ...(folders.length ? { folders } : {}), requests };
}

export function initLibrary(editor) {
  let activeCallId = null;
  let savedCalls = [];
  const folders = initFolders({ refresh: refreshCalls, createRequest: folderId => newRequest(folderId) });
  const callsApi = (path = '', method = 'GET', data) => apiJson(`/api/calls${path}`, method, data);
  function loadCall(call) {
    activeCallId = call.id || null; editor.load(call);
    $('saveStatus').textContent = activeCallId ? `Loaded ${activeCallId}.json` : 'New request';
    $('saveCall').textContent = activeCallId ? 'Update request' : 'Save request';
  }
  async function refreshCalls() {
    await folders.reload();
    savedCalls = await callsApi();
    renderCalls();
  }
  function renderCalls() {
    const query = $('librarySearch').value.trim().toLocaleLowerCase();
    const calls = savedCalls.filter(call => [call.name, ...(call.tags || [])].some(value => value.toLocaleLowerCase().includes(query)));
    $('savedCalls').replaceChildren();
    if (!calls.length) { const empty = document.createElement('p'); empty.className = 'hint'; empty.textContent = savedCalls.length ? 'No requests match your search.' : 'No saved requests yet. Name your request and select Save request.'; $('savedCalls').append(empty); }
    const targets = folders.containers($('savedCalls'), calls, Boolean(query));
    for (const call of calls) {
      const row = document.createElement('div'); row.className = 'saved-row';
      const load = document.createElement('button'); load.className = 'saved-load';
      const method = document.createElement('b'); method.textContent = call.method; method.dataset.method = call.method;
      const title = document.createElement('span'); title.textContent = call.name;
      title.className = 'saved-request-name';
      load.append(method, title);
      if (call.tags?.length) {
        const tags = document.createElement('span'); tags.className = 'saved-tags'; tags.title = call.tags.join(', ');
        for (const value of call.tags.slice(0, 3)) { const tag = document.createElement('span'); tag.className = 'tag'; tag.textContent = value; tags.append(tag); }
        if (call.tags.length > 3) {
          const more = document.createElement('span'); more.className = 'saved-tags-more'; more.textContent = '…'; more.setAttribute('aria-label', `${call.tags.length - 3} more tags`); tags.append(more);
        }
        load.append(tags);
      }
      load.onclick = async () => { try { loadCall(await callsApi(`/${call.id}`)); } catch (error) { showError(error.message); } };
      const copy = document.createElement('button'); copy.type = 'button'; copy.className = 'text-button';
      copy.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/></svg><span>Duplicate</span>'; copy.setAttribute('aria-label', `Duplicate ${call.name}`);
      copy.onclick = async () => { try { const saved = await callsApi(`/${call.id}/copy`, 'POST'); await refreshCalls(); loadCall(saved); $('saveStatus').textContent = `Created ${saved.id}.json`; } catch (error) { showError(error.message); } };
      const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'text-button delete-call';
      remove.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7"/></svg><span>Delete</span>'; remove.setAttribute('aria-label', `Delete ${call.name}`);
      remove.onclick = async () => {
        if (!confirm(`Delete saved request "${call.name}"? Its JSON file will be removed.`)) return;
        try { await callsApi(`/${call.id}`, 'DELETE'); if (activeCallId === call.id) { activeCallId = null; editor.setSavedId(null); $('saveCall').textContent = 'Save request'; } await refreshCalls(); $('saveStatus').textContent = `Deleted ${call.id}.json`; } catch (error) { showError(error.message); }
      };
      const move = document.createElement('button'); move.type = 'button'; move.className = 'text-button'; move.textContent = 'Move to folder';
      move.onclick = () => folders.move(call, async folderId => {
        const current = await callsApi(`/${call.id}`);
        await callsApi(`/${call.id}`, 'PUT', { ...current, folderId });
        if (activeCallId === call.id) $('requestFolder').value = folderId || '';
        await refreshCalls();
      });
      row.append(load, actionMenu(`Actions for ${call.name}`, [move, copy, remove])); (targets.get(call.folderId) || $('savedCalls')).append(row);
    }
  }
  $('librarySearch').addEventListener('input', renderCalls);
  function newRequest(folderId = null) { loadCall({ folderId, name: '', method: 'GET', url: '{{baseUrl}}/', headers: { 'Content-Type': 'application/json' }, body: '', auth: { type: 'none', values: {} } }); document.querySelector('[data-panel="requestInfoPanel"]').click(); $('callName').focus(); }
  $('newCall').onclick = () => newRequest();
  $('saveCall').onclick = async () => {
    $('saveCall').disabled = true;
    try {
      const saved = await callsApi(activeCallId ? `/${activeCallId}` : '', activeCallId ? 'PUT' : 'POST', editor.read());
      activeCallId = saved.id; editor.setSavedId(saved.id); $('saveCall').textContent = 'Update request'; $('saveStatus').textContent = `Saved ${saved.id}.json`; $('error').hidden = true; await refreshCalls();
    } catch (error) { showError(error.message); }
    finally { $('saveCall').disabled = false; }
  };
  $('exportCall').onclick = () => {
    try {
      const call = editor.read(); if (!call.name) throw new Error('Enter a request name before exporting');
      downloadJson(call, `${activeCallId || call.name.replace(/[^a-zA-Z0-9_-]/g, '_')}.json`);
    } catch (error) { showError(error.message); }
  };
  $('exportLibrary').onclick = async () => {
    $('exportLibrary').disabled = true;
    try { downloadJson(await exportLibrary(callsApi, await apiJson('/api/folders')), 'library.json'); }
    catch (error) { showError(error.message); }
    finally { $('exportLibrary').disabled = false; }
  };
  $('importCall').onclick = () => $('callFile').click();
  $('callFile').onchange = async event => {
    const file = event.target.files[0]; if (!file) return;
    try {
      if (file.size > 1024 * 1024) throw new Error('Request file exceeds 1 MB');
      const data = JSON.parse(await file.text());
      const requests = Array.isArray(data.requests) ? data.requests : [data];
      const existing = await apiJson('/api/folders');
      const remapped = new Map();
      for (const folder of data.folders || []) {
        const found = existing.find(item => item.name.toLowerCase() === folder.name.toLowerCase());
        const target = found || await apiJson('/api/folders', 'POST', { name: folder.name });
        if (!found) existing.push(target);
        remapped.set(folder.id, target.id);
      }
      let saved;
      for (const request of requests) {
        const folderId = remapped.get(request.folderId) || (existing.some(folder => folder.id === request.folderId) ? request.folderId : null);
        saved = await callsApi('', 'POST', { ...request, folderId });
      }
      await refreshCalls(); if (saved) loadCall(saved);
    } catch (error) { showError(error.message); }
    event.target.value = '';
  };
  const ready = refreshCalls().catch(error => showError(error.message));

  const presets = [
    ['GET', 'Read a resource', '/posts/1'], ['POST', 'Create a resource', '/posts'],
    ['PUT', 'Replace a resource', '/posts/1'], ['PATCH', 'Update a resource', '/posts/1'],
    ['DELETE', 'Delete a resource', '/posts/1'], ['HEAD', 'Inspect headers', '/posts/1'],
    ['OPTIONS', 'Inspect methods', '/posts'], ['QUERY', 'Query resources', '/posts']
  ];
  for (const [method, label, path] of presets) {
    const button = document.createElement('button');
    const badge = document.createElement('b'); badge.textContent = method; badge.dataset.method = method;
    button.append(badge, document.createTextNode(label));
    button.onclick = () => { activeCallId = null; editor.preset({ method, label, path }); $('saveCall').textContent = 'Save request'; $('saveStatus').textContent = 'New request'; };
    $('presets').append(button);
  }
  return { ready };
}
