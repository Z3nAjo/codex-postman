// Match URL path/query placeholders, excluding schemes, hosts, ports and IPv6.
function urlParts(url) {
  const authority = url.match(/^[a-z][a-z0-9+.-]*:\/\/[^/?#]*/i)?.[0] || '';
  return [authority, url.slice(authority.length)];
}
const placeholderPattern = () => /(^|[/?#=&]):([A-Za-z_][A-Za-z0-9_]*)/g;
export function urlVariableNames(url) {
  return [...new Set([...urlParts(url)[1].matchAll(placeholderPattern())].map(match => match[2]))];
}
export function resolveRequestUrl(url, variables) {
  const [authority, rest] = urlParts(url);
  return authority + rest.replace(placeholderPattern(), (_, prefix, name) => {
    if (!Object.hasOwn(variables, name)) throw new Error(`Missing request URL variable: ${name}`);
    return prefix + encodeURIComponent(String(variables[name])).replace(/[!'()*]/g, character => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
  });
}

// Reuse auto-generated rows while a placeholder is being typed or renamed.
export function reconcileUrlVariables(url, entries) {
  const names = urlVariableNames(url);
  const wanted = new Set(names);
  const exact = new Map(entries.map(entry => [entry.name, entry]));
  const reusable = entries.filter(entry => entry.automatic && !wanted.has(entry.name));
  const selected = names.map(name => {
    const entry = exact.get(name) || reusable.shift();
    return entry ? { ...entry, name } : { name, value: '', automatic: true };
  });
  return [...entries.filter(entry => !entry.automatic && !wanted.has(entry.name)), ...selected];
}
