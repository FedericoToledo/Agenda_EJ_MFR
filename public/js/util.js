let onUnauthorized = () => {};

export function setUnauthorized(fn) {
  onUnauthorized = fn;
}

export async function api(path, opts = {}) {
  const headers = { ...(opts.headers || {}) };
  let body;
  if (opts.body instanceof FormData) {
    body = opts.body;
  } else if (opts.body != null) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(opts.body);
  }
  let response;
  try {
    response = await fetch(path, {
      method: opts.method || 'GET',
      headers,
      body,
      credentials: 'same-origin',
      cache: 'no-store',
    });
  } catch {
    const error = new Error('No hay conexión con la agenda.');
    error.status = 0;
    throw error;
  }
  const type = response.headers.get('content-type') || '';
  const data = type.includes('json') ? await response.json().catch(() => ({})) : null;
  if (!response.ok) {
    const error = new Error(data?.error || 'No se pudo completar.');
    error.status = response.status;
    if (response.status === 401 && !opts.allow401) onUnauthorized();
    throw error;
  }
  return data;
}

export function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[char]));
}

export function texto(value) {
  return esc(value).replace(/\n/g, '<br>');
}

export function recorte(value, max) {
  const clean = String(value || '').trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max - 1)}…`;
}

export function iniciales(nombre) {
  const parts = String(nombre || '').trim().split(/\s+/).slice(0, 2);
  const letters = parts.map((part) => part[0]?.toUpperCase() || '').join('');
  return letters || '?';
}

export function hoyAR() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires',
  }).format(new Date());
}

export function addDays(iso, amount) {
  const date = new Date(`${iso}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

export function startOfWeek(iso) {
  const date = new Date(`${iso}T12:00:00Z`);
  const day = date.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setUTCDate(date.getUTCDate() + diff);
  return date.toISOString().slice(0, 10);
}

export function formatFecha(iso) {
  if (!iso) return '';
  const [year, month, day] = iso.split('-');
  if (!year || !month || !day) return iso;
  return `${day}/${month}/${year}`;
}

export function fechaLarga(iso) {
  const date = new Date(`${iso}T12:00:00`);
  const text = new Intl.DateTimeFormat('es-AR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(date);
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function diaCorto(iso) {
  const date = new Date(`${iso}T12:00:00Z`);
  return new Intl.DateTimeFormat('es-AR', { weekday: 'short', timeZone: 'UTC' })
    .format(date)
    .replace('.', '')
    .slice(0, 3);
}

export function formatCuando(iso) {
  if (!iso) return '';
  const date = new Date(iso);
  const minutes = Math.round((Date.now() - date.getTime()) / 60000);
  if (minutes < 1) return 'recién';
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  return new Intl.DateTimeFormat('es-AR', {
    timeZone: 'America/Argentina/Buenos_Aires',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export function cuenta(amount, one, many) {
  return `${amount} ${amount === 1 ? one : many}`;
}

export function peso(bytes) {
  if (!bytes) return '';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function isPreviewable(mime) {
  return ['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(mime);
}

export function archivoSrc(item, download = false) {
  if (item?.demoUrl) return item.demoUrl;
  const version = encodeURIComponent(item.updatedAt || item.createdAt || '');
  return `/api/archivos/${encodeURIComponent(item.id)}?v=${version}${download ? '&descargar=1' : ''}`;
}

export function waLink(telefono) {
  let digits = String(telefono || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.startsWith('0')) digits = digits.slice(1);
  if (!digits.startsWith('54')) digits = `54${digits}`;
  return `https://wa.me/${digits}`;
}

export function nombreEstado(lista, value) {
  return lista?.find((item) => item.id === value)?.nombre || value || '';
}

const ICONS = {
  home: '<path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1z"/>',
  calendar: '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M8 3v4M16 3v4M4 10h16"/>',
  users: '<path d="M16 20v-1.2A3.8 3.8 0 0 0 12.2 15H7.8A3.8 3.8 0 0 0 4 18.8V20"/><circle cx="10" cy="8" r="3"/><path d="M20 20v-1.2A3.5 3.5 0 0 0 17 15.4"/><path d="M15.5 5.2a3 3 0 0 1 0 5.6"/>',
  scale: '<path d="M12 4v16M8 20h8M12 7h7l-2.2 5.2a3 3 0 1 1-5.6 0zM12 7H5l2.2 5.2a3 3 0 1 0 5.6 0z"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M12 3.5v2.2M12 18.3v2.2M4.8 6.4l1.6 1.6M17.6 16l1.6 1.6M3.5 12h2.2M18.3 12h2.2M4.8 17.6l1.6-1.6M17.6 8l1.6-1.6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  search: '<circle cx="11" cy="11" r="6"/><path d="m16 16 4 4"/>',
  camera: '<path d="M4 8h3l1.5-2h7L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13" r="3.2"/>',
  file: '<path d="M7 3.5h7l5 5V20a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4.5a1 1 0 0 1 1-1z"/><path d="M14 3.5V9h5"/>',
  trash: '<path d="M5 7h14M9 7V5h6v2M8 7l1 12h6l1-12"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  chevron: '<path d="m6 9 6 6 6-6"/>',
  message: '<path d="M5 6h14v9H8l-3 3z"/>',
  alert: '<path d="M12 4 3.5 19h17z"/><path d="M12 9v5M12 16.5v.5"/>',
  edit: '<path d="M4 20h4L18 10l-4-4L4 16z"/>',
  download: '<path d="M12 4v11M8 11l4 4 4-4M5 20h14"/>',
  printer: '<path d="M7 9V4h10v5"/><path d="M6 17H4.5A1.5 1.5 0 0 1 3 15.5v-4A1.5 1.5 0 0 1 4.5 10h15a1.5 1.5 0 0 1 1.5 1.5v4a1.5 1.5 0 0 1-1.5 1.5H18"/><rect x="7" y="14" width="10" height="6" rx="1"/>',
  check: '<path d="m5 12 5 5L20 7"/>',
  done: '<circle cx="12" cy="12" r="8"/><path d="m8.5 12.2 2.4 2.4 4.6-5.2"/>',
  back: '<path d="M14 6 8 12l6 6"/>',
  send: '<path d="m4 12 16-7-6.5 16L11 13z"/>',
  folder: '<path d="M3 7.5h5.5L10 10h11v8.5a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z"/>',
  present: '<path d="M12 16V6M8 9.5 12 5.5l4 4M5 19h14"/>',
  whatsapp: '<path d="M6 18.5 7.1 15.6A6.5 6.5 0 1 1 9.2 17.8z"/><path d="M9.2 10.4c.4 1.8 2.4 3 3.8 3.2"/>',
  minus: '<path d="M6 12h12"/>',
  more: '<path d="M5 7h14M5 12h14M5 17h9"/>',
  key: '<circle cx="8" cy="14" r="3.2"/><path d="M11 14h9l-2 2M17 14v2"/>',
  userPlus: '<path d="M15 20v-1.1A3.4 3.4 0 0 0 11.6 15.5H7.4A3.4 3.4 0 0 0 4 18.9V20"/><circle cx="9.5" cy="8.2" r="2.7"/><path d="M18 8v6M15 11h6"/>',
  calPlus: '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M8 3.5v4M16 3.5v4M4 10h16M12 13v5M9.5 15.5h5"/>',
};

export function icon(name) {
  const body = ICONS[name] || ICONS.file;
  return `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
}

let toastTimer;
export function toast(message, kind = 'ok') {
  const el = document.getElementById('toast');
  if (!el) return;
  el.hidden = false;
  el.className = kind === 'error' ? 'toast error' : 'toast';
  el.textContent = message;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.hidden = true;
  }, 3400);
}
