import { $, showError, downloadJson, apiJson } from './ui.js';

export function initEnvironments() {
  let environmentEditorError = '';
  const environments = [];
  let environmentSaveQueue = Promise.resolve();
  let loadingEnvironment = false;
  let activeEnvironmentId = null;
  function environment() {
    if (environmentEditorError) throw new Error(environmentEditorError);
    const env = JSON.parse($('environment').value);
    if (!env || typeof env !== 'object' || !env.variables || Array.isArray(env.variables) || typeof env.variables !== 'object') throw new Error('Environment must contain a variables object');
    for (const [key, value] of Object.entries(env.variables)) if (!['string', 'number', 'boolean'].includes(typeof value)) throw new Error(`Environment variable ${key} must be a string, number, or boolean`);
    return env;
  }
  function environmentMessage(message = '') {
    environmentEditorError = message;
    $('environmentError').textContent = message;
    $('environmentError').hidden = !message;
  }
  function syncVariableRows() {
    try {
      const variables = Object.create(null);
      for (const row of $('variableRows').children) {
        const key = row.querySelector('[data-key]').value.trim();
        const type = row.querySelector('select').value;
        const raw = row.querySelector('[data-value]').value;
        if (!key) throw new Error('Every variable needs a key. Fill in or remove the empty row.');
        if (Object.hasOwn(variables, key)) throw new Error(`Duplicate variable key: ${key}`);
        let value = raw;
        if (type === 'number') { if (!raw.trim() || !Number.isFinite(Number(raw))) throw new Error(`Enter a valid number for ${key}`); value = Number(raw); }
        if (type === 'boolean') { if (!['true', 'false'].includes(raw)) throw new Error(`Use true or false for ${key}`); value = raw === 'true'; }
        variables[key] = value;
      }
      $('environment').value = JSON.stringify({ name: $('environmentLabel').value, variables }, null, 2);
      $('environmentName').textContent = `Environment: ${$('environmentLabel').value || 'Untitled'}`;
      environmentMessage();
      rememberEnvironment();
    } catch (error) { environmentMessage(error.message); }
  }
  function addVariableRow(key = '', value = '') {
    const row = document.createElement('tr');
    const keyInput = document.createElement('input'); keyInput.dataset.key = ''; keyInput.value = key; keyInput.placeholder = 'variableName'; keyInput.setAttribute('aria-label', 'Variable key');
    const type = document.createElement('select'); type.setAttribute('aria-label', 'Variable type');
    for (const name of ['string', 'number', 'boolean']) { const option = document.createElement('option'); option.value = name; option.textContent = name; type.append(option); }
    type.value = typeof value;
    const input = document.createElement('input'); input.dataset.value = ''; input.value = String(value); input.setAttribute('aria-label', 'Variable value'); input.autocomplete = 'off'; input.spellcheck = false;
    input.type = /token|secret|password|api.?key/i.test(key) ? 'password' : 'text';
    const reveal = document.createElement('button'); reveal.type = 'button'; reveal.className = 'text-button'; reveal.textContent = input.type === 'password' ? 'Show' : 'Hide'; reveal.setAttribute('aria-label', 'Toggle variable visibility');
    reveal.onclick = () => { input.type = input.type === 'password' ? 'text' : 'password'; reveal.textContent = input.type === 'password' ? 'Show' : 'Hide'; };
    const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'text-button delete-call'; remove.textContent = 'Remove'; remove.onclick = () => { row.remove(); syncVariableRows(); };
    for (const element of [keyInput, type, input]) {
      const cell = document.createElement('td');
      if (element === type) { const wrapper = document.createElement('div'); wrapper.className = 'variable-type-select'; wrapper.append(element); cell.append(wrapper); }
      else cell.append(element);
      row.append(cell); element.oninput = syncVariableRows;
    }
    const actions = document.createElement('td'); actions.append(reveal, remove); row.append(actions); $('variableRows').append(row);
    return keyInput;
  }
  $('addVariable').onclick = () => { const input = addVariableRow(); syncVariableRows(); input.focus(); };
  $('environmentLabel').oninput = syncVariableRows;
  $('environment').oninput = () => {
    environmentMessage();
    try {
      const env = environment();
      $('environmentLabel').value = env.name || '';
      $('variableRows').replaceChildren();
      for (const [key, value] of Object.entries(env.variables)) addVariableRow(key, value);
      $('environmentName').textContent = `Environment: ${env.name || 'Untitled'}`;
      rememberEnvironment();
    } catch (error) { environmentMessage(error.message); $('environmentName').textContent = 'Invalid environment JSON'; }
  };
  $('importEnvironment').onclick = () => $('environmentFile').click();
  $('environmentFile').onchange = async event => {
    const file = event.target.files[0]; if (!file) return;
    try {
      if (file.size > 1024 * 1024) throw new Error('Environment file exceeds 1 MB');
      const data = JSON.parse((await file.text()).replace(/^\uFEFF/, ''));
      if (environmentEditorError) throw new Error('Fix the current environment before importing.');
      await environmentSaveQueue;
      const result = await environmentApi('/import', 'POST', data);
      await refreshEnvironments(result.imported[0].id);
      $('environmentSaveStatus').textContent = `Imported ${result.imported.length} file(s) into ${result.directory}`;
    } catch (error) { showError(error.message); }
    event.target.value = '';
  };
  $('exportEnvironment').onclick = () => {
    try {
      downloadJson(environment(), `${activeEnvironmentId || 'environment'}.json`);
    } catch (error) { showError(error.message); }
  };
  function validateEnvironment(env) {
    if (!env || typeof env !== 'object' || typeof env.name !== 'string' || !env.variables || Array.isArray(env.variables) || typeof env.variables !== 'object') throw new Error('Each environment needs a name and variables object');
    for (const value of Object.values(env.variables)) if (!['string', 'number', 'boolean'].includes(typeof value) || (typeof value === 'number' && !Number.isFinite(value))) throw new Error('Variable values must be strings, numbers, or booleans');
    return { name: env.name, variables: structuredClone(env.variables) };
  }
  function renderEnvironmentSelector() {
    $('activeEnvironment').replaceChildren();
    for (const item of environments) {
      const option = document.createElement('option'); option.value = item.id; option.textContent = item.data.name || 'Untitled'; $('activeEnvironment').append(option);
    }
    $('activeEnvironment').value = activeEnvironmentId || '';
    $('deleteEnvironment').disabled = environments.length < 2;
  }
  function rememberEnvironment() {
    const current = environments.find(item => item.id === activeEnvironmentId);
    if (current) {
      current.data = validateEnvironment(environment());
      if (!loadingEnvironment) queueEnvironmentSave(current.id, structuredClone(current.data));
    }
    renderEnvironmentSelector();
  }
  function activateEnvironment(id) {
    const item = environments.find(item => item.id === id); if (!item) return;
    activeEnvironmentId = id;
    $('environment').value = JSON.stringify(item.data, null, 2);
    loadingEnvironment = true;
    $('environment').oninput();
    loadingEnvironment = false;
    renderEnvironmentSelector();
  }
  $('activeEnvironment').onchange = event => {
    if (environmentEditorError) { event.target.value = activeEnvironmentId; showError('Fix the current environment before switching.'); return; }
    activateEnvironment(event.target.value);
  };
  function uniqueEnvironmentName(base) {
    let name = base; let index = 2;
    while (environments.some(item => item.data.name === name)) name = `${base} ${index++}`;
    return name;
  }
  function closeNewEnvironment() {
    $('newEnvironmentForm').hidden = true;
    $('environmentDetails').hidden = false;
    $('activeEnvironment').disabled = false;
  }
  $('newEnvironment').onclick = () => {
    $('newEnvironmentName').value = '';
    $('newEnvironmentError').hidden = true;
    $('environmentDetails').hidden = true;
    $('newEnvironmentForm').hidden = false;
    $('activeEnvironment').disabled = true;
    $('newEnvironmentName').focus();
  };
  $('cancelNewEnvironment').onclick = closeNewEnvironment;
  $('newEnvironmentForm').onsubmit = async event => {
    event.preventDefault();
    const name = $('newEnvironmentName').value.trim();
    $('confirmNewEnvironment').disabled = true;
    $('cancelNewEnvironment').disabled = true;
    $('newEnvironmentName').disabled = true;
    $('newEnvironmentError').hidden = true;
    try {
      await environmentSaveQueue;
      const item = await environmentApi('', 'POST', { name, variables: {} });
      environments.push(item); activateEnvironment(item.id); closeNewEnvironment();
      $('environmentSaveStatus').textContent = `Created ${item.id}.json`;
    } catch (error) {
      $('newEnvironmentError').textContent = error.message;
      $('newEnvironmentError').hidden = false;
    } finally {
      $('confirmNewEnvironment').disabled = false;
      $('cancelNewEnvironment').disabled = false;
      $('newEnvironmentName').disabled = false;
    }
  };
  $('duplicateEnvironment').onclick = async () => {
    try {
      const env = structuredClone(environment()); env.name = uniqueEnvironmentName(`${env.name || 'Untitled'}_copy`);
      await environmentSaveQueue;
      const item = await environmentApi('', 'POST', env); environments.push(item); activateEnvironment(item.id);
    } catch (error) { showError(error.message); }
  };
  $('deleteEnvironment').onclick = async () => {
    if (environments.length < 2) return;
    const index = environments.findIndex(item => item.id === activeEnvironmentId);
    if (!confirm(`Delete environment "${environments[index].data.name}" and its JSON file?`)) return;
    try {
      await environmentSaveQueue; await environmentApi(`/${encodeURIComponent(activeEnvironmentId)}`, 'DELETE');
      environments.splice(index, 1); activateEnvironment(environments[Math.min(index, environments.length - 1)].id);
    } catch (error) { showError(error.message); }
  };
  $('exportAllEnvironments').onclick = () => {
    try {
      rememberEnvironment();
      const data = { version: 1, environments: environments.map(item => item.data) };
      downloadJson(data, 'environments.local.json');
    } catch (error) { showError(error.message); }
  };
  const environmentApi = (path = '', method = 'GET', data) => apiJson(`/api/environments${path}`, method, data);
  async function refreshEnvironments(preferredId = activeEnvironmentId) {
    const listed = await environmentApi();
    if (!Array.isArray(listed)) throw new Error('Unexpected environment API response. Restart the Node.js server.');
    if (!listed.length) listed.push(await environmentApi('', 'POST', { name: '', variables: {} }));
    environments.splice(0, environments.length, ...listed);
    activateEnvironment(environments.some(item => item.id === preferredId) ? preferredId : environments[0].id);
    const storage = await environmentApi('/storage');
    $('environmentStorage').textContent = `Folder: ${storage.directory}`;
    $('environmentStorageWarnings').textContent = storage.warnings.join('\n');
    $('environmentStorageWarnings').hidden = !storage.warnings.length;
  }
  $('refreshEnvironments').onclick = async () => {
    if (environmentEditorError) return showError('Fix the current environment before refreshing.');
    try { await environmentSaveQueue; await refreshEnvironments(); }
    catch (error) { showError(error.message); $('environmentStorageWarnings').hidden = false; $('environmentStorageWarnings').textContent = error.message; }
  };
  function queueEnvironmentSave(id, data) {
    $('environmentSaveStatus').textContent = 'Saving…';
    environmentSaveQueue = environmentSaveQueue.then(async () => {
      try { await environmentApi(`/${encodeURIComponent(id)}`, 'PUT', data); $('environmentSaveStatus').textContent = `Saved ${id}.json`; }
      catch (error) { $('environmentSaveStatus').textContent = `Not saved: ${error.message}`; showError(`Environment autosave failed: ${error.message}`); }
    });
  }
  const ready = refreshEnvironments().catch(error => {
    showError(error.message); $('environmentStorageWarnings').hidden = false; $('environmentStorageWarnings').textContent = error.message;
  });
  return { read: environment, ready };
}
