// Small shared helpers for the renderer (no DOM state here).

export function basename(p) {
  return p.split(/[\\/]/).pop();
}

export function stripExt(name) {
  const i = name.lastIndexOf('.');
  return i > 0 ? name.slice(0, i) : name;
}

export function extOf(p) {
  const m = /\.([a-z0-9]+)$/i.exec(p);
  return m ? m[1].toLowerCase() : '';
}

/** mm:ss.d formatter for time displays. */
export function fmtTime(sec) {
  if (!Number.isFinite(sec) || sec < 0) sec = 0;
  const m = Math.floor(sec / 60);
  const s = sec - m * 60;
  return `${m}:${s < 10 ? '0' : ''}${s.toFixed(1)}`;
}

export function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v));
}

let uid = 0;
export function newId(prefix) {
  return `${prefix}${++uid}_${Date.now().toString(36)}`;
}

/** Build a blob: URL from an ArrayBuffer (caller must revoke when done). */
export function blobUrl(arrayBuffer, type) {
  return URL.createObjectURL(new Blob([arrayBuffer], { type }));
}

export function el(tag, attrs = {}, ...children) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') n.className = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else if (v === false || v == null) continue;
    else if (k === 'text') n.textContent = v;
    else n.setAttribute(k, v === true ? '' : v);
  }
  n.append(...children.filter((c) => c != null));
  return n;
}

const toasts = document.getElementById('toasts');
export function toast(msg, kind = 'info', ms = 5000) {
  const t = el('div', { class: `toast ${kind}`, text: msg });
  toasts.append(t);
  setTimeout(() => t.remove(), ms);
}
