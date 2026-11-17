import { $, apiJson, showError, actionMenu } from './ui.js';

export function initFolders({ refresh, createRequest }) {
  let folders = [];
  const expanded = new Set();
  $('newFolder').onclick = () => { $('newFolderForm').hidden = false; $('folderName').focus(); };
  $('cancelFolder').onclick = () => { $('newFolderForm').hidden = true; };
  $('newFolderForm').onsubmit = async event => {
    event.preventDefault();
    try {
      const folder = await apiJson('/api/folders', 'POST', { name: $('folderName').value });
      expanded.add(folder.id); $('folderName').value = ''; $('newFolderForm').hidden = true; await refresh();
    } catch (error) { showError(error.message); }
  };
  function options(select, selected = '') {
    select.replaceChildren(new Option('No folder', ''));
    for (const folder of folders) select.append(new Option(folder.name, folder.id));
    select.value = selected;
  }
  async function reload() {
    folders = await apiJson('/api/folders');
    options($('requestFolder'), $('requestFolder').value);
  }
  function containers(root, calls, searching) {
    const targets = new Map();
    for (const folder of folders) {
      if (searching && !calls.some(call => call.folderId === folder.id)) continue;
      const section = document.createElement('details'); section.className = 'library-folder'; section.open = searching || expanded.has(folder.id);
      section.ontoggle = () => { if (!searching) { if (section.open) expanded.add(folder.id); else expanded.delete(folder.id); } };
      const summary = document.createElement('summary');
      const title = document.createElement('span'); title.textContent = folder.name; title.className = 'folder-name';
      const create = document.createElement('button'); create.type = 'button'; create.className = 'text-button'; create.textContent = 'New request'; create.onclick = () => createRequest(folder.id);
      const rename = document.createElement('button'); rename.type = 'button'; rename.className = 'text-button'; rename.textContent = 'Rename';
      rename.onclick = () => renameFolder(folder);
      const actions = document.createElement('span'); actions.className = 'section-actions'; actions.append(actionMenu(`Actions for folder ${folder.name}`, [create, rename]));
      summary.append(title, actions);
      const content = document.createElement('div'); content.className = 'folder-requests';
      if (!calls.some(call => call.folderId === folder.id)) { const empty = document.createElement('p'); empty.className = 'hint'; empty.textContent = 'No requests yet.'; content.append(empty); }
      section.append(summary, content); root.append(section); targets.set(folder.id, content);
    }
    return targets;
  }
  function renameFolder(folder) {
    const dialog = document.createElement('dialog'); dialog.className = 'move-request-dialog rename-folder-dialog'; dialog.setAttribute('aria-label', 'Rename folder');
    const form = document.createElement('form');
    const label = document.createElement('label'); label.textContent = 'Folder name';
    const input = document.createElement('input'); input.value = folder.name; input.maxLength = 100; input.required = true; input.setAttribute('aria-label', 'Folder name');
    const error = document.createElement('p'); error.className = 'storage-warning'; error.setAttribute('role', 'alert'); error.hidden = true;
    const save = document.createElement('button'); save.type = 'submit'; save.className = 'text-button'; save.textContent = 'Save';
    const cancel = document.createElement('button'); cancel.type = 'button'; cancel.className = 'text-button'; cancel.textContent = 'Cancel'; cancel.onclick = () => dialog.close();
    label.append(input); form.append(label, error, save, cancel); dialog.append(form); document.body.append(dialog);
    dialog.onclose = () => dialog.remove();
    form.onsubmit = async event => {
      event.preventDefault(); save.disabled = true; error.hidden = true;
      try { await apiJson('/api/folders', 'PUT', { id: folder.id, name: input.value }); await refresh(); dialog.close(); }
      catch (failure) { error.textContent = failure.message; error.hidden = false; input.focus(); }
      finally { save.disabled = false; }
    };
    dialog.showModal(); input.focus(); input.select();
  }
  function move(call, save) {
    const dialog = document.createElement('dialog'); dialog.className = 'move-request-dialog';
    const form = document.createElement('form');
    const label = document.createElement('label'); label.textContent = `Move ${call.name}`;
    const select = document.createElement('select'); select.setAttribute('aria-label', 'Destination folder'); options(select, call.folderId || '');
    const submit = document.createElement('button'); submit.className = 'text-button'; submit.textContent = 'Move'; submit.type = 'submit';
    const cancel = document.createElement('button'); cancel.className = 'text-button'; cancel.textContent = 'Cancel'; cancel.type = 'button'; cancel.onclick = () => dialog.close();
    label.append(select); form.append(label, submit, cancel); dialog.append(form); document.body.append(dialog);
    dialog.onclose = () => dialog.remove();
    form.onsubmit = async event => { event.preventDefault(); submit.disabled = true; try { await save(select.value || null); dialog.close(); } catch (error) { showError(error.message); } finally { submit.disabled = false; } };
    dialog.showModal();
  }
  return { reload, containers, move };
}
