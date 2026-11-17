export function normalizeTags(tags = []) {
  if (!Array.isArray(tags) || tags.some(tag => typeof tag !== 'string' || !/^[\p{L}\p{N}_-]+$/u.test(tag))) {
    throw new Error('Tags must be one word using only letters, digits, underscores (_) or hyphens (-).');
  }
  return [...new Set(tags)];
}
