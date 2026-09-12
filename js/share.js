// Sharing and files, through the launcher where it mediates and locally
// where it does not. Every inbound payload goes through js/validate.js
// before anything touches a store.

const A = () => window.Arcade;

export function toast(message, kind = 'info', duration = 1800) {
  const a = A();
  if (a && a.ui && typeof a.ui.toast === 'function') a.ui.toast(message, { kind, duration });
  else console.log('[audio-tune]', message);
}

export async function confirm(message, okLabel = 'OK') {
  const a = A();
  if (a && a.ui && typeof a.ui.confirm === 'function') return a.ui.confirm(message, { okLabel });
  return window.confirm(message);
}

export async function copyText(text) {
  const a = A();
  let ok = false;
  if (a && a.ui && typeof a.ui.copy === 'function') { try { ok = await a.ui.copy(text); } catch (e) { ok = false; } }
  if (!ok && navigator.clipboard) { try { await navigator.clipboard.writeText(text); ok = true; } catch (e) { ok = false; } }
  return ok;
}

export function configsAvailable() {
  const a = A();
  return !!(a && a.configs && typeof a.configs.share === 'function');
}

/** Share a config as a code + deep link via the launcher (or a code standalone). */
export async function shareConfig(type, data) {
  if (!configsAvailable()) return { ok: false, reason: 'no configs' };
  try {
    const r = await A().configs.share(type, data);
    if (r && r.ok && r.code && !r.url) {
      const copied = await copyText(r.code);
      toast(copied ? 'Share code copied' : 'Share code ready', 'success');
    }
    return r || { ok: false };
  } catch (e) { return { ok: false, reason: e && e.message }; }
}

/** Push a config straight to a linked device (the launcher prompts both sides). */
export async function sendConfig(type, data) {
  if (!configsAvailable() || typeof A().configs.send !== 'function') return { ok: false, reason: 'no configs' };
  try { return await A().configs.send(type, data); } catch (e) { return { ok: false, reason: e && e.message }; }
}

/** A short local share code (Arcade.share) for small payloads like riffs. */
export function encodeCode(data, v = 1) {
  const a = A();
  if (a && a.share && typeof a.share.encode === 'function') return a.share.encode(data, { v });
  return 'v' + v + '.' + btoa(unescape(encodeURIComponent(JSON.stringify(data)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function decodeCode(text) {
  const a = A();
  if (a && a.share && typeof a.share.decode === 'function') return a.share.decode(String(text || '').trim());
  try {
    const m = /^v(\d+)\.([A-Za-z0-9_-]+)$/.exec(String(text || '').trim());
    if (!m) return null;
    return { v: Number(m[1]), data: JSON.parse(decodeURIComponent(escape(atob(m[2].replace(/-/g, '+').replace(/_/g, '/'))))) };
  } catch (e) { return null; }
}

/** Hand the viewer a JSON file. The launcher sandbox grants allow-downloads for exactly this. */
export function downloadJson(name, obj) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** Ask for a JSON file (consent-gated picker when framed). Resolves to the parsed object or null. */
export async function openJson() {
  const a = A();
  let file = null;
  if (a && a.ui && typeof a.ui.openFile === 'function') {
    try { file = await a.ui.openFile({ accept: 'application/json,.json' }); } catch (e) { file = null; }
  } else {
    file = await new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file'; input.accept = 'application/json,.json';
      input.onchange = () => resolve(input.files && input.files[0] ? input.files[0] : null);
      input.click();
    });
  }
  if (!file) return null;
  if (file.size > 512 * 1024) { toast('That file is too large to be one of ours', 'error'); return null; }
  try { return JSON.parse(await file.text()); } catch (e) { toast('Not a JSON file', 'error'); return null; }
}

export function byteLength(obj) { return new TextEncoder().encode(JSON.stringify(obj)).length; }
