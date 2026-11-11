import { $, showError, apiJson } from './ui.js';
import { urlVariableNames, resolveRequestUrl, reconcileUrlVariables } from '../request-variables.js';

export function initRequestEditor(getEnvironment) {
  const history = [];
  let result = null;
  let responseView = 'body';
  const authDefaults = { token: '{{token}}', username: '{{username}}', password: '{{password}}', key: 'X-API-Key', value: '{{token}}' };
  const authValues = { ...authDefaults };
  const authFields = { none: [], bearer: [['token', 'Bearer token']], basic: [['username', 'Username'], ['password', 'Password']], apikey: [['key', 'Header name'], ['value', 'API key']] };
  function selectPanel(id) {
    document.querySelectorAll('.panel').forEach(panel => panel.hidden = panel.id !== id);
    document.querySelectorAll('#requestTabs button').forEach(button => button.classList.toggle('active', button.dataset.panel === id));
  }
  $('requestTabs').onclick = event => { if (event.target.dataset.panel) selectPanel(event.target.dataset.panel); };
  function resolveVariables(text, variables) {
    return text.replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (_, key) => {
      if (!Object.hasOwn(variables, key)) throw new Error(`Missing environment variable: ${key}`);
      return String(variables[key]);
    });
  }
  function renderAuth() {
    $('authFields').replaceChildren();
    const fields = authFields[$('authType').value];
    for (const [key, title] of fields) {
      const label = document.createElement('label'); label.textContent = title;
      const input = document.createElement('input'); input.value = authValues[key]; input.type = ['token', 'password', 'value'].includes(key) ? 'password' : 'text';
      input.autocomplete = 'off'; input.spellcheck = false;
      input.oninput = () => authValues[key] = input.value;
      if (input.type === 'password') {
        const wrapper = document.createElement('div'); wrapper.className = 'auth-secret';
        const toggle = document.createElement('button'); toggle.type = 'button'; toggle.className = 'auth-visibility';
        const eye = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg>';
        const eyeOff = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="m3 3 18 18M10 5.2A12 12 0 0 1 12 5c6.5 0 10 7 10 7a19 19 0 0 1-3.4 4.3M6.2 6.2A20 20 0 0 0 2 12s3.5 7 10 7a12 12 0 0 0 5.8-1.8M10 10a3 3 0 0 0 4 4"/></svg>';
        toggle.innerHTML = eye; toggle.setAttribute('aria-label', `Show ${title.toLowerCase()}`); toggle.title = `Show ${title.toLowerCase()}`; toggle.setAttribute('aria-pressed', 'false');
        toggle.onclick = () => {
          const visible = input.type === 'password'; input.type = visible ? 'text' : 'password';
          const action = `${visible ? 'Hide' : 'Show'} ${title.toLowerCase()}`;
          toggle.innerHTML = visible ? eyeOff : eye; toggle.setAttribute('aria-label', action); toggle.title = action; toggle.setAttribute('aria-pressed', String(visible));
        };
        wrapper.append(input, toggle); label.append(wrapper);
      } else label.append(input);
      $('authFields').append(label);
    }
  }
  $('authType').onchange = renderAuth;
  renderAuth();
  function renderResponse() {
    if (!result) return;
    let value = responseView === 'headers' ? JSON.stringify(result.headers, null, 2) : result.body;
    if (responseView === 'body') { try { value = JSON.stringify(JSON.parse(value), null, 2); } catch {} }
    $('response').textContent = value || '(empty response)';
  }
  $('responseTabs').onclick = event => {
    if (!event.target.dataset.view) return;
    responseView = event.target.dataset.view;
    document.querySelectorAll('[data-view]').forEach(button => button.classList.toggle('active', button.dataset.view === responseView));
    renderResponse();
  };
  $('copyResponse').onclick = async () => {
    try { await navigator.clipboard.writeText($('response').textContent); $('copyResponse').textContent = 'Copied'; setTimeout(() => $('copyResponse').textContent = 'Copy', 1500); }
    catch { showError('Clipboard unavailable. Select and copy the response manually.'); }
  };
  function renderHistory() {
    $('historyList').replaceChildren();
    for (const item of history) {
      const button = document.createElement('button'); button.className = 'history-row';
      const method = document.createElement('b'); method.textContent = item.method;
      const url = document.createElement('span'); url.textContent = item.url;
      const status = document.createElement('small'); status.textContent = item.status;
      button.append(method, url, status);
      button.onclick = () => { $('method').value = item.method; $('url').value = item.url; setRequestVariables({}); };
      $('historyList').append(button);
    }
  }
  $('clearHistory').onclick = () => { history.length = 0; renderHistory(); };
  $('requestForm').onsubmit = async event => {
    event.preventDefault(); $('error').hidden = true; $('send').disabled = true; $('send').textContent = 'Sending…';
    result = null; $('responseMeta').replaceChildren(); $('response').textContent = 'Waiting for response…';
    try {
      const env = getEnvironment();
      const expand = text => resolveVariables(text, env.variables);
      const rawHeaders = JSON.parse($('headers').value || '{}');
      if (!rawHeaders || Array.isArray(rawHeaders) || typeof rawHeaders !== 'object') throw new Error('Headers must be a JSON object');
      const headers = {};
      for (const [key, value] of Object.entries(rawHeaders)) {
        if (typeof value !== 'string') throw new Error('Header values must be strings');
        headers[expand(key)] = expand(value);
      }
      const resolvedHeaders = new Headers(headers);
      switch ($('authType').value) {
        case 'bearer': resolvedHeaders.set('Authorization', `Bearer ${expand(authValues.token)}`); break;
        case 'basic': {
          const bytes = new TextEncoder().encode(`${expand(authValues.username)}:${expand(authValues.password)}`);
          resolvedHeaders.set('Authorization', `Basic ${btoa(Array.from(bytes, byte => String.fromCharCode(byte)).join(''))}`); break;
        }
        case 'apikey': resolvedHeaders.set(expand(authValues.key), expand(authValues.value)); break;
      }
      const method = $('method').value;
      const variables = Object.fromEntries(Object.entries(requestVariables()).map(([name, value]) => [name, expand(value)]));
      const payload = { method, url: resolveRequestUrl(expand($('url').value.trim()), variables), headers: Object.fromEntries(resolvedHeaders), body: ['GET', 'HEAD'].includes(method) ? '' : expand($('body').value) };
      const data = await apiJson('/api/request', 'POST', payload);
      result = data;
      const status = document.createElement('span'); status.className = `status${data.status >= 400 ? ' bad' : ''}`; status.textContent = `${data.status} ${data.statusText}`;
      const timing = document.createElement('span'); timing.textContent = `${data.duration} ms`;
      const size = document.createElement('span'); size.textContent = `${(data.size / 1024).toFixed(1)} KB`;
      $('responseMeta').append(status, timing, size); renderResponse();
      // Store the template URL only, never expanded credentials or response bodies.
      history.unshift({ method, url: $('url').value, status: data.status }); history.splice(20); renderHistory();
    } catch (error) { showError(error.message); $('response').textContent = 'No response received.'; }
    finally { $('send').disabled = false; $('send').textContent = 'Send request ↗'; }
  };
  function read() {
    const headers = JSON.parse($('headers').value || '{}');
    if (!headers || Array.isArray(headers) || typeof headers !== 'object' || Object.values(headers).some(value => typeof value !== 'string')) throw new Error('Headers must be a JSON object of strings');
    const fields = authFields[$('authType').value].map(([key]) => key);
    return { version: 1, name: $('callName').value.trim(), method: $('method').value, url: $('url').value, headers, body: $('body').value, variables: requestVariables(), auth: { type: $('authType').value, values: Object.fromEntries(fields.map(key => [key, authValues[key]])) } };
  }
  function load(call) {
    $('callName').value = call.name;
    $('method').value = call.method; $('url').value = call.url;
    $('headers').value = JSON.stringify(call.headers, null, 2); $('body').value = call.body;
    setRequestVariables(call.variables || {});
    $('authType').value = call.auth.type;
    Object.assign(authValues, authDefaults, call.auth.values);
    renderAuth(); result = null; $('responseMeta').replaceChildren(); $('response').textContent = 'Request loaded. Select Send request to test it.'; $('error').hidden = true;
  }
  function updateRequestVariableEmpty() { $('requestVariableEmpty').hidden = $('requestVariableRows').children.length > 0; }
  function addRequestVariable(name = '', value = '', automatic = false) {
    const row = document.createElement('tr');
    row.dataset.automatic = String(automatic);
    const key = document.createElement('input'); key.dataset.requestKey = ''; key.value = name; key.placeholder = 'VARIABLE_NAME'; key.setAttribute('aria-label', 'Request variable name'); key.spellcheck = false;
    key.oninput = () => row.dataset.automatic = 'false';
    const input = document.createElement('input'); input.dataset.requestValue = ''; input.value = value; input.placeholder = 'Value or {{environmentVariable}}'; input.setAttribute('aria-label', 'Request variable value'); input.autocomplete = 'off';
    const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'text-button delete-call'; remove.textContent = 'Remove'; remove.onclick = () => { row.remove(); updateRequestVariableEmpty(); };
    for (const element of [key, input, remove]) { const cell = document.createElement('td'); cell.append(element); row.append(cell); }
    $('requestVariableRows').append(row); updateRequestVariableEmpty(); return key;
  }
  function requestVariables() {
    const values = Object.create(null);
    for (const row of $('requestVariableRows').children) {
      const name = row.querySelector('[data-request-key]').value.trim();
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) throw new Error('URL variable names must start with a letter or underscore and contain only letters, numbers, and underscores');
      if (Object.hasOwn(values, name)) throw new Error(`Duplicate request URL variable: ${name}`);
      values[name] = row.querySelector('[data-request-value]').value;
    }
    return values;
  }
  function discoverRequestVariables() {
    const rows = [...$('requestVariableRows').children];
    const entries = rows.map(row => ({ name: row.querySelector('[data-request-key]').value.trim(), value: row.querySelector('[data-request-value]').value, automatic: row.dataset.automatic === 'true', row }));
    const next = reconcileUrlVariables($('url').value, entries);
    const retained = new Set(next.map(entry => entry.row));
    for (const row of rows) if (!retained.has(row)) row.remove();
    for (const entry of next) {
      if (entry.row) entry.row.querySelector('[data-request-key]').value = entry.name;
      else addRequestVariable(entry.name, entry.value, entry.automatic);
    }
    updateRequestVariableEmpty();
  }
  function setRequestVariables(values) {
    $('requestVariableRows').replaceChildren();
    const placeholders = new Set(urlVariableNames($('url').value));
    for (const [name, value] of Object.entries(values)) addRequestVariable(name, value, placeholders.has(name));
    discoverRequestVariables(); updateRequestVariableEmpty();
  }
  $('url').addEventListener('input', discoverRequestVariables);
  $('addRequestVariable').onclick = () => addRequestVariable().focus();

  function preset({ method, label, path }) {
    $('callName').value = label; $('method').value = method; $('url').value = `{{baseUrl}}${path}`;
    setRequestVariables({}); selectPanel(['POST', 'PUT', 'PATCH'].includes(method) ? 'bodyPanel' : 'headersPanel');
  }
  return { read, load, preset };
}
