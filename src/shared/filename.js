// Windows-safe output file name sanitizing. ESM so the sandboxed renderer can import it;
// the main process loads it with a dynamic import() (see exporter.js).

const ILLEGAL = /[<>:"/\\|?*\u0000-\u001f]/g;
const RESERVED = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i;
export const MAX_NAME = 200;

/** Returns a safe base name (no extension). Never returns an empty string. */
export function sanitizeName(name) {
  let n = String(name ?? '').replace(ILLEGAL, '').replace(/\s+/g, ' ').trim();
  n = n.replace(/[. ]+$/g, '');                 // Windows strips trailing dots/spaces
  if (n.length > MAX_NAME) n = n.slice(0, MAX_NAME).replace(/[. ]+$/g, '');
  if (RESERVED.test(n)) n = '_' + n;
  return n || 'output';
}

/** Validation message for inline rename, or null when valid as typed. */
export function validateName(name) {
  const raw = String(name ?? '');
  if (!raw.trim()) return 'Name cannot be empty';
  if (ILLEGAL.test(raw)) { ILLEGAL.lastIndex = 0; return 'Illegal characters: < > : " / \\ | ? *'; }
  ILLEGAL.lastIndex = 0;
  if (/[. ]$/.test(raw)) return 'Cannot end with a dot or space';
  if (RESERVED.test(raw.trim())) return 'Reserved Windows name';
  if (raw.length > MAX_NAME) return `Max ${MAX_NAME} characters`;
  return null;
}

/**
 * Pick a non-colliding file name: "name.ext", "name (1).ext", ... given a predicate exists(fullName).
 * `avoid` is a set of lowercase names already claimed by the current batch.
 */
export function uniqueName(base, ext, exists, avoid = new Set()) {
  const taken = (n) => avoid.has(n.toLowerCase()) || exists(n);
  let candidate = `${base}${ext}`;
  for (let i = 1; taken(candidate); i++) candidate = `${base} (${i})${ext}`;
  return candidate;
}
