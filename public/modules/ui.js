export const $ = id => document.getElementById(id);
export function showError(message) { $('error').textContent = message; $('error').hidden = false; }
export function downloadJson(data, filename) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2) + '\n'], { type: 'application/json' }));
  const link = document.createElement('a'); link.href = url; link.download = filename; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export async function apiJson(url, method = 'GET', data) {
  let response;
  try { response = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, ...(data === undefined ? {} : { body: JSON.stringify(data) }) }); }
  catch { throw new Error('Cannot reach the Node.js server. Run npm start and open its printed URL.'); }
  let value;
  try { value = JSON.parse(await response.text()); }
  catch { throw new Error('API unavailable. Restart npm start with the updated project and open its printed URL instead of an IDE HTML preview.'); }
  if (!response.ok) throw new Error(value.error || 'API operation failed');
  return value;
}

// Native popover invokers toggle on repeated clicks and dismiss on outside clicks/Escape.
export function actionMenu(label, buttons) {
  const wrapper = document.createElement('span'); wrapper.className = 'action-menu';
  const trigger = document.createElement('button'); trigger.type = 'button'; trigger.className = 'text-button request-actions-trigger'; trigger.textContent = '⋯'; trigger.setAttribute('aria-label', label); trigger.setAttribute('aria-expanded', 'false');
  const menu = document.createElement('span'); menu.className = 'request-actions-menu'; menu.id = `actions-${crypto.randomUUID()}`; menu.setAttribute('popover', 'auto');
  trigger.setAttribute('popovertarget', menu.id); trigger.setAttribute('popovertargetaction', 'toggle'); trigger.setAttribute('aria-controls', menu.id);
  menu.addEventListener('toggle', () => trigger.setAttribute('aria-expanded', String(menu.matches(':popover-open'))));
  trigger.onclick = event => {
    event.stopPropagation();
    const bounds = trigger.getBoundingClientRect();
    menu.style.left = `${Math.max(8, Math.min(bounds.right - 176, innerWidth - 184))}px`;
    menu.style.top = `${Math.max(8, Math.min(bounds.bottom + 6, innerHeight - (buttons.length * 40 + 20)))}px`;
  };
  const icons = { Rename: 'm16 3 5 5-12 12-6 1 1-6ZM14 5l5 5', New: 'M12 5v14M5 12h14', Import: 'M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5', Export: 'M12 16V4m-5 5 5-5 5 5M4 16v5h16v-5', Duplicate: 'M8 8h12v12H8zM16 8V3H3v13h5', Delete: 'M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7' };
  for (const button of buttons) {
    const path = icons[button.textContent.trim().split(' ')[0]];
    if (path && !button.querySelector('svg')) {
      const title = document.createElement('span'); title.textContent = button.textContent;
      button.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="${path}"/></svg>`; button.append(title);
    }
    const handler = button.onclick;
    button.onclick = event => { event.stopPropagation(); menu.hidePopover(); trigger.focus(); return handler?.call(button, event); };
    menu.append(button);
  }
  wrapper.append(trigger, menu); return wrapper;
}
