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
