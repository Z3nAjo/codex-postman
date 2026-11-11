import { $, showError, downloadJson, apiJson } from './ui.js';

// Export complete saved requests, rather than the list endpoint's summaries.
export async function exportLibrary(callsApi) {
  const summaries = await callsApi();
  const requests = await Promise.all(summaries.map(async ({ id }) => {
    const { id: savedId, ...request } = await callsApi(`/${id}`);
    return request;
  }));
  return { version: 1, requests };
}

export function initLibrary(editor) {
  let activeCallId = null;
  const callsApi = (path = '', method = 'GET', data) => apiJson(`/api/calls${path}`, method, data);
  function loadCall(call) {
    activeCallId = call.id || null; editor.load(call);
    $('saveStatus').textContent = activeCallId ? `Loaded ${activeCallId}.json` : 'New request';
    $('saveCall').textContent = activeCallId ? 'Update request' : 'Save request';
  }
  async function refreshCalls() {
    const calls = await callsApi(); $('savedCalls').replaceChildren();
    if (!calls.length) { const empty = document.createElement('p'); empty.className = 'hint'; empty.textContent = 'No saved requests yet. Name your request and select Save request.'; $('savedCalls').append(empty); }
    for (const call of calls) {
      const row = document.createElement('div'); row.className = 'saved-row';
      const load = document.createElement('button'); load.className = 'saved-load';
      const method = document.createElement('b'); method.textContent = call.method;
      const title = document.createElement('span'); title.textContent = call.name;
      const file = document.createElement('small'); file.textContent = `${call.id}.json`;
      load.append(method, title, file);
      load.onclick = async () => { try { loadCall(await callsApi(`/${call.id}`)); } catch (error) { showError(error.message); } };
      const copy = document.createElement('button'); copy.className = 'text-button'; copy.textContent = 'Duplicate'; copy.setAttribute('aria-label', `Duplicate ${call.name}`);
      copy.onclick = async () => { try { const saved = await callsApi(`/${call.id}/copy`, 'POST'); await refreshCalls(); loadCall(saved); $('saveStatus').textContent = `Created ${saved.id}.json`; } catch (error) { showError(error.message); } };
      const remove = document.createElement('button'); remove.className = 'text-button delete-call'; remove.textContent = 'Delete'; remove.setAttribute('aria-label', `Delete ${call.name}`);
      remove.onclick = async () => {
        if (!confirm(`Delete saved request "${call.name}"? Its JSON file will be removed.`)) return;
        try { await callsApi(`/${call.id}`, 'DELETE'); if (activeCallId === call.id) { activeCallId = null; $('saveCall').textContent = 'Save request'; } await refreshCalls(); $('saveStatus').textContent = `Deleted ${call.id}.json`; } catch (error) { showError(error.message); }
      };
      row.append(load, copy, remove); $('savedCalls').append(row);
    }
  }
  $('newCall').onclick = () => loadCall({ name: '', method: 'GET', url: '{{baseUrl}}/', headers: { 'Content-Type': 'application/json' }, body: '', auth: { type: 'none', values: {} } });
  $('saveCall').onclick = async () => {
    $('saveCall').disabled = true;
    try {
      const saved = await callsApi(activeCallId ? `/${activeCallId}` : '', activeCallId ? 'PUT' : 'POST', editor.read());
      activeCallId = saved.id; $('saveCall').textContent = 'Update request'; $('saveStatus').textContent = `Saved ${saved.id}.json`; $('error').hidden = true; await refreshCalls();
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
    try { downloadJson(await exportLibrary(callsApi), 'library.json'); }
    catch (error) { showError(error.message); }
    finally { $('exportLibrary').disabled = false; }
  };
  $('importCall').onclick = () => $('callFile').click();
  $('callFile').onchange = async event => {
    const file = event.target.files[0]; if (!file) return;
    try {
      if (file.size > 1024 * 1024) throw new Error('Request file exceeds 1 MB');
      const saved = await callsApi('', 'POST', JSON.parse(await file.text())); await refreshCalls(); loadCall(saved);
    } catch (error) { showError(error.message); }
    event.target.value = '';
  };
  const ready = refreshCalls().catch(error => showError(error.message));

  const presets = [['GET', 'Read a resource', '/posts/1'], ['POST', 'Create a resource', '/posts'], ['PUT', 'Update a resource', '/posts/1'], ['DELETE', 'Delete a resource', '/posts/1']];
  for (const [method, label, path] of presets) {
    const button = document.createElement('button');
    const badge = document.createElement('b'); badge.textContent = method;
    button.append(badge, document.createTextNode(label));
    button.onclick = () => { activeCallId = null; editor.preset({ method, label, path }); $('saveCall').textContent = 'Save request'; $('saveStatus').textContent = 'New request'; };
    $('presets').append(button);
  }
  return { ready };
}
