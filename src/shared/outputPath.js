// Pure helpers to make sure an output folder is always a plain string (never a dialog result object).
// Used by the renderer (ESM) and unit-tested in test/outputPath.test.mjs. Main process mirrors the logic inline.

/**
 * Normalize anything that might come back from a folder picker / prefs file into a string path or null.
 * Accepts: string, { filePaths: [..] } (Electron dialog result), { canceled, filePaths }, arrays of paths.
 * Rejects: empty strings, '[object Object]', other objects (e.g. { ok: true }), numbers, null/undefined.
 */
export function asPathString(value) {
  if (value == null) return null;
  if (typeof value === 'string') {
    const s = value.trim();
    if (!s || s === '[object Object]' || s === 'undefined' || s === 'null') return null;
    return s;
  }
  if (Array.isArray(value)) return asPathString(value[0]);
  if (typeof value === 'object') {
    if (value.canceled === true) return null;
    if (Array.isArray(value.filePaths)) return asPathString(value.filePaths[0]);
    if (typeof value.filePath === 'string') return asPathString(value.filePath);
    if (typeof value.path === 'string') return asPathString(value.path);
    return null;
  }
  return null;
}

/** Convert an Electron showOpenDialog result into the first selected path (string) or null. */
export function dialogResultToPath(result) {
  if (!result || result.canceled || !Array.isArray(result.filePaths) || !result.filePaths.length) return null;
  return asPathString(result.filePaths[0]);
}
