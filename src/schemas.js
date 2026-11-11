import { methods } from './http.js';

export function validateCall(input) {
  if (!input || typeof input.name !== 'string' || !input.name.trim() || input.name.length > 100) throw new Error('Request name is required (100 characters maximum)');
  if (!methods.has(input.method) || typeof input.url !== 'string' || !input.url.trim() || typeof input.body !== 'string') throw new Error('Invalid request method, URL, or body');
  if (!input.headers || Array.isArray(input.headers) || typeof input.headers !== 'object' || Object.values(input.headers).some(value => typeof value !== 'string')) throw new Error('Headers must be a JSON object of strings');
  const variables = input.variables || {};
  if (typeof variables !== 'object' || Array.isArray(variables) || Object.entries(variables).some(([key, value]) => !/^[A-Za-z_][A-Za-z0-9_]*$/.test(key) || typeof value !== 'string')) throw new Error('Request URL variables must be an object of named string values');
  const auth = input.auth || { type: 'none', values: {} };
  const fields = { none: [], bearer: ['token'], basic: ['username', 'password'], apikey: ['key', 'value'] };
  if (!Object.hasOwn(fields, auth.type) || !auth.values || fields[auth.type].some(key => typeof auth.values[key] !== 'string')) throw new Error('Invalid authentication settings');
  return { version: 1, name: input.name.trim(), method: input.method, url: input.url, headers: input.headers, body: input.body, variables, auth: { type: auth.type, values: Object.fromEntries(fields[auth.type].map(key => [key, auth.values[key]])) } };
}
export function validateEnvironment(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || (input.name !== undefined && typeof input.name !== 'string')) throw new Error('Environment needs a name and variables object');
  let variables = input.variables;
  // Also accept native Postman environment exports.
  if (!variables && Array.isArray(input.values)) {
    variables = Object.create(null);
    for (const entry of input.values) {
      if (entry.enabled === false) continue;
      if (typeof entry.key !== 'string' || !entry.key.trim()) throw new Error('Invalid Postman variable key');
      if (Object.hasOwn(variables, entry.key)) throw new Error(`Duplicate variable key: ${entry.key}`);
      variables[entry.key] = entry.value;
    }
  }
  if (!variables || typeof variables !== 'object' || Array.isArray(variables)) throw new Error('Environment needs a variables object (or Postman values array)');
  if ((input.name || '').length > 100) throw new Error('Environment name must be 100 characters or fewer');
  if (Object.values(variables).some(value => !['string', 'number', 'boolean'].includes(typeof value) || (typeof value === 'number' && !Number.isFinite(value)))) throw new Error('Invalid variable value');
  return { name: (input.name || '').trim(), variables };
}
