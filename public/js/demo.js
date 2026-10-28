// Demostración pública para GitHub Pages. El servidor real no se usa ahí:
// los datos de prueba viven en este navegador.

const KEY = 'agenda-demo-v1';
const MIME = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'image/heic': '.heic',
  'image/heif': '.heif',
  'application/pdf': '.pdf',
  'application/msword': '.doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
};
const EXT = Object.fromEntries(Object.entries(MIME).map(([mime, ext]) => [ext, mime]));
EXT['.jpeg'] = 'image/jpeg';

const fileUrls = new Map();
let state = null;
let filesDb = null;
let currentId = '';
const attempts = [];

export function demoEnabled() {
  return location.hostname.endsWith('github.io') || new URLSearchParams(location.search).has('demo');
}

export async function installDemo() {
  if (!demoEnabled()) return;
  if (location.hostname.endsWith('github.io') && !location.pathname.endsWith('/')) {
    location.replace(`${location.pathname}/${location.search}${location.hash}`);
    return new Promise(() => {});
  }
  document.documentElement.dataset.demo = '1';
  const native = window.fetch.bind(window);
  state = await loadState(native);
  filesDb = await openFiles();
  for (const item of state.items) {
    if (!item.archivo_path?.startsWith('local:')) continue;
    const blob = await idbGet(item.id);
    if (blob) fileUrls.set(item.id, URL.createObjectURL(blob));
  }
  currentId = sessionStorage.getItem('agenda-demo-uid') || '';
  window.fetch = (input, init = {}) => {
    const raw = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    let parsed;
    try {
      parsed = new URL(raw, location.href);
    } catch {
      return native(input, init);
    }
    const at = parsed.pathname.indexOf('/api/');
    if (at < 0) return native(input, init);
    const path = parsed.pathname.slice(at);
    return answer(path, parsed.searchParams, init, native);
  };
}

async function loadState(native) {
  const saved = localStorage.getItem(KEY);
  if (saved) {
    try {
      return JSON.parse(saved);
    } catch {
      localStorage.removeItem(KEY);
    }
  }
  const response = await native(new URL('demo/seed.json', location.href), { cache: 'no-store' });
  if (!response.ok) throw new Error('No se pudo cargar la demostración.');
  const seed = await response.json();
  const maria = seed.users.find((user) => String(user.username).toLowerCase() === 'maria');
  seed.passwords = maria ? { [maria.id]: 'demo' } : {};
  return seed;
}

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* La sesión sigue en memoria si el navegador no acepta más datos. */
  }
}

function openFiles() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('agenda-demo-files', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('files');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function idbGet(key) {
  return new Promise((resolve, reject) => {
    const request = filesDb.transaction('files', 'readonly').objectStore('files').get(key);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}

function idbPut(key, value) {
  return new Promise((resolve, reject) => {
    const tx = filesDb.transaction('files', 'readwrite');
    tx.objectStore('files').put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function idbDel(key) {
  return new Promise((resolve, reject) => {
    const tx = filesDb.transaction('files', 'readwrite');
    tx.objectStore('files').delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function jsonResponse(status, data) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function fail(status, message) {
  const error = new Error(message);
  error.status = status;
  throw error;
}

function uid() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function nowISO() {
  return new Date().toISOString();
}

function todayAR() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date());
}

function fold(value) {
  return String(value || '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim();
}

function digits(value) {
  return String(value || '').replace(/\D/g, '');
}

function str(value, max) {
  return String(value ?? '').trim().slice(0, max);
}

function required(value, label, max) {
  const clean = str(value, max);
  if (!clean) fail(400, `Falta ${label}.`);
  return clean;
}

function cleanEmail(value) {
  const email = str(value, 160);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail(400, 'El email no parece válido.');
  return email;
}

function cleanFecha(value, label) {
  const fecha = str(value, 10);
  if (!fecha) return '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) fail(400, `${label} no es válida.`);
  return fecha;
}

function cleanHora(value) {
  const match = /^(\d{2}):(\d{2})/.exec(String(value || ''));
  if (!match) return '';
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return '';
  return `${match[1]}:${match[2]}`;
}

function saludo() {
  const hour = Number(new Intl.DateTimeFormat('en-GB', {
    timeZone: 'America/Argentina/Buenos_Aires',
    hour: 'numeric',
    hourCycle: 'h23',
  }).format(new Date()));
  if (hour < 12) return 'Buenos días';
  if (hour < 19) return 'Buenas tardes';
  return 'Buenas noches';
}

function userById(id) {
  return state.users.find((user) => user.id === id) || null;
}

function currentUser() {
  const user = userById(currentId);
  return user?.activo ? user : null;
}

function publicUser(user) {
  return {
    id: user.id,
    nombre: user.nombre,
    username: user.username,
    rol: user.rol,
    activo: Boolean(user.activo),
    createdAt: user.created_at,
  };
}

function requireUser() {
  const user = currentUser();
  if (!user) fail(401, 'Tenés que ingresar.');
  return user;
}

function requireSuper() {
  const user = requireUser();
  if (user.rol !== 'superadmin') fail(403, 'Solo la administración puede hacer esto.');
  return user;
}

function areaById(id) {
  return state.areas.find((area) => area.id === id) || null;
}

function bucketById(areaId, bucketId) {
  return areaById(areaId)?.buckets.find((bucket) => bucket.id === bucketId) || null;
}

function clientById(id) {
  return state.clients.find((client) => client.id === id) || null;
}

function carpetaById(id) {
  return state.carpetas.find((carpeta) => carpeta.id === id) || null;
}

function mapClient(row) {
  return {
    id: row.id,
    nombre: row.nombre,
    dni: row.dni || '',
    telefono: row.telefono || '',
    email: row.email || '',
    domicilio: row.domicilio || '',
    notas: row.notas || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function demoUrl(row) {
  if (!row?.archivo_path) return '';
  if (row.archivo_path.startsWith('seed:')) return `demo/files/${row.archivo_path.slice(5)}`;
  if (row.archivo_path.startsWith('local:')) return fileUrls.get(row.archivo_path.slice(6)) || '';
  return '';
}

function mapItem(row) {
  const author = userById(row.created_by);
  return {
    id: row.id,
    bucket: row.bucket,
    tipo: row.tipo,
    titulo: row.titulo,
    cuerpo: row.cuerpo || '',
    estado: row.estado || '',
    fecha: row.fecha || '',
    tieneArchivo: Boolean(row.archivo_path),
    archivoNombre: row.archivo_nombre || '',
    archivoMime: row.archivo_mime || '',
    archivoTamano: row.archivo_tamano || 0,
    origenItemId: row.origen_item_id || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    creadoPor: author?.nombre || '',
    demoUrl: demoUrl(row),
  };
}

function mapTurno(row) {
  const client = clientById(row.client_id);
  const assigned = userById(row.asignado_a);
  return {
    id: row.id,
    clientId: row.client_id,
    clienteNombre: client?.nombre || '',
    clienteTelefono: client?.telefono || '',
    fecha: row.fecha,
    hora: row.hora,
    motivo: row.motivo,
    notas: row.notas || '',
    estado: row.estado,
    asignadoA: row.asignado_a || '',
    asignadoNombre: assigned?.nombre || '',
    createdAt: row.created_at,
  };
}

function areasOf(clientId) {
  const ids = [...new Set(state.carpetas.filter((carpeta) => carpeta.client_id === clientId).map((carpeta) => carpeta.area))];
  return ids
    .map((id) => areaById(id))
    .filter(Boolean)
    .sort((a, b) => state.areas.findIndex((area) => area.id === a.id) - state.areas.findIndex((area) => area.id === b.id))
    .map((area) => ({ id: area.id, nombre: area.nombre }));
}

function withAreas(row) {
  return { ...mapClient(row), areas: areasOf(row.id) };
}

function groupItems(items, buckets) {
  const grouped = {};
  for (const bucket of buckets) grouped[bucket.id] = [];
  for (const item of items) {
    if (!grouped[item.bucket]) grouped[item.bucket] = [];
    grouped[item.bucket].push(mapItem(item));
  }
  for (const bucket of buckets) {
    if (bucket.tipo === 'faltante') continue;
    grouped[bucket.id].reverse();
  }
  return grouped;
}

function touch(clientId) {
  const client = clientById(clientId);
  if (client) client.updated_at = nowISO();
}

function log(userId, accion, detalle, clientId) {
  state.activity.unshift({
    id: uid(),
    user_id: userId,
    accion,
    detalle,
    client_id: clientId || null,
    created_at: nowISO(),
  });
  state.activity = state.activity.slice(0, 80);
}

function matchesClient(client, query) {
  if (!query) return true;
  const folded = fold(query);
  const nums = digits(query);
  return fold(client.nombre).includes(folded)
    || String(client.email || '').toLowerCase().includes(query.toLowerCase())
    || (nums && String(client.dni_busqueda || '').includes(nums))
    || (nums && String(client.telefono_busqueda || '').includes(nums));
}

function equipo() {
  return state.users
    .filter((user) => user.activo)
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
    .map((user) => ({ id: user.id, nombre: user.nombre, rol: user.rol }));
}

function contarFaltantes() {
  return state.items.filter((item) => item.bucket === 'faltante').length;
}

function activeAdmins(exceptId) {
  return state.users.filter((user) => user.id !== exceptId && user.rol === 'superadmin' && user.activo).length;
}

function rememberFile(itemId, file) {
  const detected = detectFile(file);
  if (!detected) fail(415, 'Formato no permitido. Usá una foto, PDF o Word.');
  if (file.size > 20 * 1024 * 1024) fail(413, 'El archivo supera los 20 MB.');
  return { detected, file };
}

function detectFile(file) {
  if (MIME[file.type]) return { mime: file.type, ext: MIME[file.type] };
  const ext = (/\.[a-z0-9]+$/i.exec(file.name || '') || [''])[0].toLowerCase();
  if (EXT[ext]) return { mime: EXT[ext], ext: ext === '.jpeg' ? '.jpg' : ext };
  return null;
}

async function storeFile(itemId, file, detected) {
  const blob = file.slice(0, file.size, detected.mime);
  await idbPut(itemId, blob);
  const previous = fileUrls.get(itemId);
  if (previous) URL.revokeObjectURL(previous);
  fileUrls.set(itemId, URL.createObjectURL(blob));
  return {
    archivo_nombre: (file.name || `archivo${detected.ext}`).slice(0, 180),
    archivo_mime: detected.mime,
    archivo_path: `local:${itemId}`,
    archivo_tamano: file.size,
  };
}

async function dropLocal(pathValue) {
  if (!pathValue?.startsWith('local:')) return;
  const key = pathValue.slice(6);
  const still = state.items.some((item) => item.archivo_path === pathValue);
  if (still) return;
  fileUrls.delete(key);
  await idbDel(key);
}

function insertItem(carpetaId, bucketId, campos, archivo, userId, origenId = null) {
  const now = nowISO();
  const item = {
    id: uid(),
    carpeta_id: carpetaId,
    bucket: bucketId,
    tipo: archivo ? 'archivo' : 'texto',
    titulo: campos.titulo,
    cuerpo: campos.cuerpo || '',
    estado: campos.estado || '',
    fecha: campos.fecha || '',
    archivo_nombre: archivo?.archivo_nombre || null,
    archivo_mime: archivo?.archivo_mime || null,
    archivo_path: archivo?.archivo_path || null,
    archivo_tamano: archivo?.archivo_tamano || null,
    origen_item_id: origenId,
    created_at: now,
    updated_at: now,
    created_by: userId,
  };
  state.items.push(item);
  return item;
}

function leerCampos(body, bucket) {
  const titulo = required(body.titulo, 'el título', 200);
  const cuerpo = str(body.cuerpo, 5000);
  const fecha = cleanFecha(body.fecha, 'La fecha');
  let estado = str(body.estado, 40);
  if (bucket.estados?.length) {
    if (!estado) estado = bucket.estados[0].id;
    if (!bucket.estados.some((item) => item.id === estado)) fail(400, 'El estado no es válido.');
  } else {
    estado = '';
  }
  return { titulo, cuerpo, fecha, estado };
}

function leerCliente(body) {
  return {
    nombre: required(body.nombre, 'el nombre', 160).replace(/\s+/g, ' '),
    dni: str(body.dni, 32),
    telefono: str(body.telefono, 40),
    email: cleanEmail(body.email),
    domicilio: str(body.domicilio, 200),
    notas: str(body.notas, 4000),
  };
}

function applyCliente(row, data) {
  row.nombre = data.nombre;
  row.nombre_busqueda = fold(data.nombre);
  row.dni = data.dni;
  row.dni_busqueda = digits(data.dni);
  row.telefono = data.telefono;
  row.telefono_busqueda = digits(data.telefono);
  row.email = data.email;
  row.domicilio = data.domicilio;
  row.notas = data.notas;
  row.updated_at = nowISO();
}

function ensureArea(clientId, areaId, userId) {
  const area = areaById(areaId);
  if (!area) return null;
  const existing = state.carpetas.find((carpeta) => carpeta.client_id === clientId && carpeta.area === areaId);
  if (existing) return existing.id;
  const carpeta = {
    id: uid(),
    client_id: clientId,
    area: areaId,
    titulo: 'General',
    notas: '',
    created_at: nowISO(),
    created_by: userId,
  };
  state.carpetas.push(carpeta);
  return carpeta.id;
}

function areaPayload(clientId, areaId) {
  const client = clientById(clientId);
  const area = areaById(areaId);
  if (!client || !area) return null;
  const carpetas = state.carpetas
    .filter((carpeta) => carpeta.client_id === clientId && carpeta.area === areaId)
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
  return {
    client: withAreas(client),
    enArea: carpetas.length > 0,
    area: {
      id: area.id,
      nombre: area.nombre,
      resumen: area.resumen,
      buckets: area.buckets,
      carpetas: carpetas.map((carpeta) => ({
        id: carpeta.id,
        titulo: carpeta.titulo,
        notas: carpeta.notas || '',
        items: groupItems(state.items.filter((item) => item.carpeta_id === carpeta.id), area.buckets),
      })),
    },
  };
}

function legajo(clientId) {
  const client = clientById(clientId);
  if (!client) return null;
  const carpetas = state.carpetas
    .filter((carpeta) => carpeta.client_id === clientId)
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
  return {
    client: mapClient(client),
    totales: { faltantes: contarFaltantes() },
    areas: state.areas.map((area) => ({
      id: area.id,
      nombre: area.nombre,
      resumen: area.resumen,
      buckets: area.buckets,
      carpetas: carpetas
        .filter((carpeta) => carpeta.area === area.id)
        .map((carpeta) => ({
          id: carpeta.id,
          titulo: carpeta.titulo,
          notas: carpeta.notas || '',
          items: groupItems(state.items.filter((item) => item.carpeta_id === carpeta.id), area.buckets),
        })),
    })).filter((area) => area.carpetas.length),
  };
}

function leerTurno(body) {
  const clientId = required(body.clientId, 'el cliente', 80);
  const fecha = cleanFecha(body.fecha, 'La fecha');
  if (!fecha) fail(400, 'Falta la fecha.');
  const hora = cleanHora(body.hora);
  if (!hora) fail(400, 'La hora no es válida.');
  const motivo = required(body.motivo, 'el motivo', 200);
  const notas = str(body.notas, 2000);
  const estado = str(body.estado || 'pendiente', 20);
  if (!state.turnoEstados.some((item) => item.id === estado)) fail(400, 'El estado no es válido.');
  const asignadoA = str(body.asignadoA, 80) || null;
  if (!clientById(clientId)) fail(404, 'No se encontró el cliente.');
  if (asignadoA && !state.users.some((user) => user.id === asignadoA && user.activo)) {
    fail(400, 'La persona asignada no está activa.');
  }
  return { clientId, fecha, hora, motivo, notas, estado, asignadoA };
}

async function answer(path, query, init, native) {
  const method = String(init.method || 'GET').toUpperCase();
  if (method === 'GET' && path.startsWith('/api/archivos/')) {
    return serveFile(decodeURIComponent(path.split('/')[3] || ''), native);
  }
  let body = {};
  let form = null;
  if (init.body instanceof FormData) form = init.body;
  else if (typeof init.body === 'string' && init.body) {
    try { body = JSON.parse(init.body); } catch { body = {}; }
  }
  try {
    const result = await route(method, path, query, body, form);
    save();
    return jsonResponse(result.status || 200, result.data);
  } catch (error) {
    return jsonResponse(error.status || 500, { error: error.message || 'No se pudo completar.' });
  }
}

async function serveFile(id, native) {
  const item = state.items.find((entry) => entry.id === id);
  const url = demoUrl(item);
  if (!item?.archivo_path || !url) return jsonResponse(404, { error: 'No se encontró el archivo.' });
  const response = await native(new URL(url, location.href));
  if (!response.ok) return jsonResponse(404, { error: 'No se encontró el archivo.' });
  const headers = new Headers(response.headers);
  if (item.archivo_mime) headers.set('content-type', item.archivo_mime);
  return new Response(await response.blob(), { status: 200, headers });
}

async function route(method, path, query, body, form) {
  if (method === 'GET' && path === '/api/health') return { data: { ok: true } };
  if (method === 'GET' && path === '/api/branding') {
    return { data: { estudioNombre: state.settings.estudioNombre, titular: state.settings.titular } };
  }
  if (method === 'POST' && path === '/api/login') return login(body);
  if (method === 'POST' && path === '/api/logout') {
    currentId = '';
    sessionStorage.removeItem('agenda-demo-uid');
    return { data: { ok: true } };
  }
  if (method === 'GET' && path === '/api/me') return me();

  const user = requireUser();
  if (method === 'GET' && path === '/api/dashboard') return { data: dashboard(user) };
  if (method === 'GET' && path === '/api/equipo') return { data: { users: equipo() } };
  if (method === 'GET' && path === '/api/clients') return { data: listClients(query) };
  if (method === 'POST' && path === '/api/clients') return createClient(body, user);
  if (method === 'GET' && path === '/api/legales/resumen') return { data: resumen() };
  if (method === 'GET' && path === '/api/turnos') return { data: listTurnos(query) };
  if (method === 'POST' && path === '/api/turnos') return createTurno(body, user);
  if (method === 'POST' && path === '/api/pizarra') return createNote(body, user);
  if (method === 'GET' && path === '/api/users') {
    requireSuper();
    return { data: { users: state.users.map(publicUser) } };
  }
  if (method === 'POST' && path === '/api/users') return createUser(body, user);
  if (method === 'POST' && path === '/api/cuenta/clave') return changePassword(body, user);
  if (method === 'PATCH' && path === '/api/settings') return saveSettings(body);

  let match = path.match(/^\/api\/clients\/([^/]+)$/);
  if (match && method === 'GET') return clientDetail(decodeURIComponent(match[1]));
  if (match && method === 'PATCH') return updateClient(decodeURIComponent(match[1]), body, user);
  if (match && method === 'DELETE') return deleteClient(decodeURIComponent(match[1]), user);

  match = path.match(/^\/api\/clients\/([^/]+)\/legales$/);
  if (match && method === 'GET') {
    const data = legajo(decodeURIComponent(match[1]));
    if (!data) fail(404, 'No se encontró el cliente.');
    return { data };
  }

  match = path.match(/^\/api\/clients\/([^/]+)\/areas\/([^/]+)$/);
  if (match && method === 'GET') return areaOf(decodeURIComponent(match[1]), decodeURIComponent(match[2]));
  if (match && method === 'POST') return addArea(decodeURIComponent(match[1]), decodeURIComponent(match[2]), user);
  if (match && method === 'DELETE') return removeArea(decodeURIComponent(match[1]), decodeURIComponent(match[2]), user);

  match = path.match(/^\/api\/clients\/([^/]+)\/comentarios$/);
  if (match && method === 'POST') return addComment(decodeURIComponent(match[1]), body, user);

  match = path.match(/^\/api\/clients\/([^/]+)\/carpetas$/);
  if (match && method === 'POST') return addCarpeta(decodeURIComponent(match[1]), body, user);

  match = path.match(/^\/api\/areas\/([^/]+)\/clientes$/);
  if (match && method === 'GET') return areaClients(decodeURIComponent(match[1]), query);

  match = path.match(/^\/api\/turnos\/([^/]+)$/);
  if (match && method === 'PATCH') return updateTurno(decodeURIComponent(match[1]), body, user);
  if (match && method === 'DELETE') return deleteTurno(decodeURIComponent(match[1]), user);

  match = path.match(/^\/api\/carpetas\/([^/]+)$/);
  if (match && method === 'PATCH') return patchCarpeta(decodeURIComponent(match[1]), body);
  if (match && method === 'DELETE') return deleteCarpeta(decodeURIComponent(match[1]), user);

  match = path.match(/^\/api\/carpetas\/([^/]+)\/items$/);
  if (match && method === 'POST') return addItems(decodeURIComponent(match[1]), body, user);

  match = path.match(/^\/api\/carpetas\/([^/]+)\/archivos$/);
  if (match && method === 'POST') return addArchivo(decodeURIComponent(match[1]), form, user);

  match = path.match(/^\/api\/items\/([^/]+)$/);
  if (match && method === 'PATCH') return patchItem(decodeURIComponent(match[1]), body);
  if (match && method === 'DELETE') return deleteItem(decodeURIComponent(match[1]));

  match = path.match(/^\/api\/items\/([^/]+)\/completar$/);
  if (match && method === 'POST') return completar(decodeURIComponent(match[1]), form, user);

  match = path.match(/^\/api\/items\/([^/]+)\/presentar$/);
  if (match && method === 'POST') return presentar(decodeURIComponent(match[1]), body, user);

  match = path.match(/^\/api\/items\/([^/]+)\/archivo$/);
  if (match && method === 'POST') return attach(decodeURIComponent(match[1]), form);

  match = path.match(/^\/api\/comentarios\/([^/]+)$/);
  if (match && method === 'DELETE') return deleteComment(decodeURIComponent(match[1]), user);

  match = path.match(/^\/api\/pizarra\/([^/]+)$/);
  if (match && method === 'DELETE') return deleteNote(decodeURIComponent(match[1]), user);

  match = path.match(/^\/api\/users\/([^/]+)$/);
  if (match && method === 'PATCH') return patchUser(decodeURIComponent(match[1]), body, user);
  if (match && method === 'DELETE') return deleteUser(decodeURIComponent(match[1]), user);

  fail(404, 'No existe ese recurso.');
}

function login(body) {
  const now = Date.now();
  while (attempts.length && now - attempts[0] > 10 * 60 * 1000) attempts.shift();
  if (attempts.length >= 8) fail(429, 'Demasiados intentos. Esperá unos minutos.');
  const username = str(body.username, 40).toLowerCase();
  const password = String(body.password || '');
  const user = state.users.find((item) => String(item.username).toLowerCase() === username);
  const valid = Boolean(user) && state.passwords?.[user.id] === password;
  if (!valid) {
    attempts.push(now);
    fail(401, 'Usuario o clave incorrectos.');
  }
  if (!user.activo) fail(403, 'Esta cuenta está desactivada. Pedile a la administración que la habilite.');
  attempts.length = 0;
  currentId = user.id;
  sessionStorage.setItem('agenda-demo-uid', user.id);
  return { data: { user: publicUser(user) } };
}

function me() {
  const user = currentUser();
  if (!user) return { data: { user: null } };
  return {
    data: {
      user: publicUser(user),
      settings: state.settings,
      areas: state.areas,
      roles: state.roles,
      turnoEstados: state.turnoEstados,
      equipo: equipo(),
      faltantes: contarFaltantes(),
    },
  };
}

function dashboard(user) {
  const hoy = todayAR();
  const turnosHoy = state.turnos.filter((turno) => turno.fecha === hoy).sort((a, b) => a.hora.localeCompare(b.hora)).map(mapTurno);
  const proximos = state.turnos
    .filter((turno) => turno.fecha > hoy && turno.estado !== 'cancelado')
    .sort((a, b) => a.fecha.localeCompare(b.fecha) || a.hora.localeCompare(b.hora))
    .slice(0, 8)
    .map(mapTurno);
  const faltantes = [];
  const rows = state.items
    .filter((item) => item.bucket === 'faltante')
    .map((item) => ({ item, carpeta: carpetaById(item.carpeta_id) }))
    .filter((entry) => entry.carpeta)
    .sort((a, b) => {
      const left = clientById(a.carpeta.client_id)?.nombre || '';
      const right = clientById(b.carpeta.client_id)?.nombre || '';
      return left.localeCompare(right, 'es') || a.item.created_at.localeCompare(b.item.created_at);
    });
  for (const entry of rows) {
    const client = clientById(entry.carpeta.client_id);
    if (!client) continue;
    let group = faltantes.find((item) => item.id === client.id);
    if (!group) {
      group = { id: client.id, nombre: client.nombre, dni: client.dni || '', area: entry.carpeta.area, cantidad: 0, titulos: [] };
      faltantes.push(group);
    }
    group.cantidad += 1;
    if (group.titulos.length < 4) group.titulos.push(entry.item.titulo);
  }
  return {
    saludo: saludo(),
    hoy,
    nombreCorto: String(user.nombre || '').trim().split(/\s+/)[0] || user.nombre,
    turnosHoy,
    proximos,
    faltantes: faltantes.slice(0, 12),
    pizarra: [...state.pizarra].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 30).map((nota) => ({
      id: nota.id,
      texto: nota.texto,
      createdAt: nota.created_at,
      usuario: userById(nota.user_id)?.nombre || '',
      userId: nota.user_id,
    })),
    actividad: [...state.activity].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 30).map((row) => ({
      id: row.id,
      accion: row.accion,
      detalle: row.detalle,
      createdAt: row.created_at,
      clientId: row.client_id,
      usuario: userById(row.user_id)?.nombre || '',
    })),
    conteos: {
      clientes: state.clients.length,
      faltantes: contarFaltantes(),
      turnosHoy: turnosHoy.filter((turno) => turno.estado !== 'cancelado').length,
    },
  };
}

function listClients(query) {
  const q = str(query.get('q'), 120);
  const limit = Math.min(Number(query.get('limit')) || 50, 200);
  let rows = state.clients.filter((client) => matchesClient(client, q));
  rows = q
    ? rows.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
    : rows.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  return { clients: rows.slice(0, limit).map(withAreas) };
}

function createClient(body, user) {
  const data = leerCliente(body);
  const now = nowISO();
  const client = {
    id: uid(),
    nombre: data.nombre,
    nombre_busqueda: fold(data.nombre),
    dni: data.dni,
    dni_busqueda: digits(data.dni),
    telefono: data.telefono,
    telefono_busqueda: digits(data.telefono),
    email: data.email,
    domicilio: data.domicilio,
    notas: data.notas,
    created_at: now,
    updated_at: now,
    created_by: user.id,
  };
  state.clients.push(client);
  log(user.id, 'cliente', `cargó el cliente ${data.nombre}`, client.id);
  return { status: 201, data: { client: mapClient(client) } };
}

function clientDetail(id) {
  const client = clientById(id);
  if (!client) fail(404, 'No se encontró el cliente.');
  const hoy = todayAR();
  const turnos = state.turnos
    .filter((turno) => turno.client_id === id && turno.fecha >= hoy)
    .sort((a, b) => a.fecha.localeCompare(b.fecha) || a.hora.localeCompare(b.hora))
    .slice(0, 8)
    .map(mapTurno);
  const comentarios = state.comentarios
    .filter((item) => item.client_id === id)
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, 80)
    .reverse()
    .map((item) => ({
      id: item.id,
      texto: item.texto,
      createdAt: item.created_at,
      userId: item.user_id,
      usuario: userById(item.user_id)?.nombre || '',
    }));
  const resumenAreas = state.areas.map((area) => {
    const carpetas = state.carpetas.filter((carpeta) => carpeta.client_id === id && carpeta.area === area.id);
    const ids = new Set(carpetas.map((carpeta) => carpeta.id));
    const items = state.items.filter((item) => ids.has(item.carpeta_id));
    return {
      id: area.id,
      nombre: area.nombre,
      total: items.length,
      faltantes: items.filter((item) => item.bucket === 'faltante').length,
    };
  });
  return { data: { client: withAreas(client), turnos, comentarios, resumen: resumenAreas } };
}

function updateClient(id, body, user) {
  const client = clientById(id);
  if (!client) fail(404, 'No se encontró el cliente.');
  const data = leerCliente(body);
  applyCliente(client, data);
  log(user.id, 'cliente', `actualizó la ficha de ${data.nombre}`, id);
  return { data: { client: mapClient(client) } };
}

async function deleteClient(id, user) {
  requireSuper();
  const client = clientById(id);
  if (!client) fail(404, 'No se encontró el cliente.');
  const carpetaIds = new Set(state.carpetas.filter((carpeta) => carpeta.client_id === id).map((carpeta) => carpeta.id));
  const paths = state.items.filter((item) => carpetaIds.has(item.carpeta_id)).map((item) => item.archivo_path);
  state.items = state.items.filter((item) => !carpetaIds.has(item.carpeta_id));
  state.carpetas = state.carpetas.filter((carpeta) => carpeta.client_id !== id);
  state.turnos = state.turnos.filter((turno) => turno.client_id !== id);
  state.comentarios = state.comentarios.filter((item) => item.client_id !== id);
  state.clients = state.clients.filter((item) => item.id !== id);
  log(user.id, 'cliente', `eliminó el cliente ${client.nombre}`, null);
  for (const pathValue of paths) await dropLocal(pathValue);
  return { data: { ok: true } };
}

function resumen() {
  return {
    areas: state.areas.map((area) => ({
      id: area.id,
      clientes: new Set(state.carpetas.filter((carpeta) => carpeta.area === area.id).map((carpeta) => carpeta.client_id)).size,
      faltantes: state.items.filter((item) => item.bucket === 'faltante' && carpetaById(item.carpeta_id)?.area === area.id).length,
    })),
  };
}

function areaClients(areaId, query) {
  const area = areaById(areaId);
  if (!area) fail(404, 'No existe esa área.');
  const q = str(query.get('q'), 120);
  const limit = Math.min(Number(query.get('limit')) || 80, 200);
  const memberIds = new Set(state.carpetas.filter((carpeta) => carpeta.area === areaId).map((carpeta) => carpeta.client_id));
  const clients = state.clients
    .filter((client) => memberIds.has(client.id) && matchesClient(client, q))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
    .slice(0, limit)
    .map((client) => {
      const carpetas = state.carpetas.filter((carpeta) => carpeta.client_id === client.id && carpeta.area === areaId);
      const ids = new Set(carpetas.map((carpeta) => carpeta.id));
      const items = state.items.filter((item) => ids.has(item.carpeta_id));
      return {
        ...mapClient(client),
        faltantes: items.filter((item) => item.bucket === 'faltante').length,
        piezas: items.filter((item) => item.bucket !== 'faltante').length,
      };
    });
  const fuera = q
    ? state.clients
      .filter((client) => !memberIds.has(client.id) && matchesClient(client, q))
      .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
      .slice(0, 6)
      .map(mapClient)
    : [];
  return { data: { clients, fuera } };
}

function areaOf(clientId, areaId) {
  const data = areaPayload(clientId, areaId);
  if (!data) fail(404, 'No se encontró el cliente o el área.');
  return { data };
}

function addArea(clientId, areaId, user) {
  const client = clientById(clientId);
  const area = areaById(areaId);
  if (!client) fail(404, 'No se encontró el cliente.');
  if (!area) fail(404, 'No existe esa área.');
  const already = state.carpetas.some((carpeta) => carpeta.client_id === clientId && carpeta.area === areaId);
  ensureArea(clientId, areaId, user.id);
  touch(clientId);
  if (!already) log(user.id, 'legajo', `sumó a ${client.nombre} en ${area.nombre}`, clientId);
  return { status: 201, data: areaPayload(clientId, areaId) };
}

async function removeArea(clientId, areaId, user) {
  const client = clientById(clientId);
  const area = areaById(areaId);
  if (!client) fail(404, 'No se encontró el cliente.');
  if (!area) fail(404, 'No existe esa área.');
  const ids = new Set(state.carpetas.filter((carpeta) => carpeta.client_id === clientId && carpeta.area === areaId).map((carpeta) => carpeta.id));
  const paths = state.items.filter((item) => ids.has(item.carpeta_id)).map((item) => item.archivo_path);
  state.items = state.items.filter((item) => !ids.has(item.carpeta_id));
  state.carpetas = state.carpetas.filter((carpeta) => !ids.has(carpeta.id));
  touch(clientId);
  log(user.id, 'legajo', `quitó a ${client.nombre} de ${area.nombre}`, clientId);
  for (const pathValue of paths) await dropLocal(pathValue);
  return { data: { ok: true } };
}

function addComment(clientId, body, user) {
  if (!clientById(clientId)) fail(404, 'No se encontró el cliente.');
  const texto = required(body.texto, 'el mensaje', 800);
  const now = nowISO();
  state.comentarios.push({ id: uid(), client_id: clientId, user_id: user.id, texto, created_at: now });
  touch(clientId);
  return { status: 201, data: { comentario: { id: state.comentarios.at(-1).id, texto, createdAt: now, userId: user.id, usuario: user.nombre } } };
}

function deleteComment(id, user) {
  const row = state.comentarios.find((item) => item.id === id);
  if (!row) fail(404, 'No se encontró el mensaje.');
  if (row.user_id !== user.id && user.rol !== 'superadmin') fail(403, 'Solo quien lo escribió, o la administración, puede borrarlo.');
  state.comentarios = state.comentarios.filter((item) => item.id !== id);
  return { data: { ok: true } };
}

function listTurnos(query) {
  const desde = cleanFecha(query.get('desde'), 'La fecha');
  const hasta = cleanFecha(query.get('hasta'), 'La fecha');
  if (!desde || !hasta) fail(400, 'Falta el rango de fechas.');
  const turnos = state.turnos
    .filter((turno) => turno.fecha >= desde && turno.fecha <= hasta)
    .sort((a, b) => a.fecha.localeCompare(b.fecha) || a.hora.localeCompare(b.hora))
    .map(mapTurno);
  return { turnos };
}

function createTurno(body, user) {
  const data = leerTurno(body);
  const client = clientById(data.clientId);
  const turno = {
    id: uid(),
    client_id: data.clientId,
    fecha: data.fecha,
    hora: data.hora,
    motivo: data.motivo,
    notas: data.notas,
    estado: data.estado,
    asignado_a: data.asignadoA,
    created_by: user.id,
    created_at: nowISO(),
  };
  state.turnos.push(turno);
  touch(data.clientId);
  log(user.id, 'turno', `agendó a ${client.nombre} el ${data.fecha.split('-').reverse().join('/')} a las ${data.hora}`, data.clientId);
  return { status: 201, data: { turno: mapTurno(turno) } };
}

function updateTurno(id, body, user) {
  const current = state.turnos.find((turno) => turno.id === id);
  if (!current) fail(404, 'No se encontró el turno.');
  const before = current.estado;
  const data = leerTurno({
    clientId: body.clientId ?? current.client_id,
    fecha: body.fecha ?? current.fecha,
    hora: body.hora ?? current.hora,
    motivo: body.motivo ?? current.motivo,
    notas: body.notas ?? current.notas,
    estado: body.estado ?? current.estado,
    asignadoA: body.asignadoA ?? current.asignado_a ?? '',
  });
  const client = clientById(data.clientId);
  Object.assign(current, {
    client_id: data.clientId,
    fecha: data.fecha,
    hora: data.hora,
    motivo: data.motivo,
    notas: data.notas,
    estado: data.estado,
    asignado_a: data.asignadoA,
  });
  touch(data.clientId);
  if (data.estado !== before) {
    const nombre = state.turnoEstados.find((item) => item.id === data.estado)?.nombre || data.estado;
    log(user.id, 'turno', `marcó como ${nombre.toLowerCase()} el turno de ${client.nombre}`, data.clientId);
  }
  return { data: { turno: mapTurno(current) } };
}

function deleteTurno(id, user) {
  const turno = state.turnos.find((item) => item.id === id);
  if (!turno) fail(404, 'No se encontró el turno.');
  state.turnos = state.turnos.filter((item) => item.id !== id);
  const client = clientById(turno.client_id);
  log(user.id, 'turno', `canceló la reserva del turno de ${client?.nombre || 'un cliente'} (${turno.fecha} ${turno.hora})`, turno.client_id);
  return { data: { ok: true } };
}

function addCarpeta(clientId, body, user) {
  const client = clientById(clientId);
  if (!client) fail(404, 'No se encontró el cliente.');
  const area = areaById(str(body.area, 40));
  if (!area) fail(400, 'Esa área no existe.');
  const titulo = required(body.titulo, 'el nombre de la carpeta', 120);
  const carpeta = {
    id: uid(),
    client_id: clientId,
    area: area.id,
    titulo,
    notas: '',
    created_at: nowISO(),
    created_by: user.id,
  };
  state.carpetas.push(carpeta);
  return { status: 201, data: { id: carpeta.id, titulo, notas: '' } };
}

function patchCarpeta(id, body) {
  const carpeta = carpetaById(id);
  if (!carpeta) fail(404, 'No se encontró la carpeta.');
  const titulo = body.titulo != null ? required(body.titulo, 'el nombre de la carpeta', 120) : carpeta.titulo;
  const notas = body.notas != null ? str(body.notas, 500) : carpeta.notas;
  carpeta.titulo = titulo;
  carpeta.notas = notas;
  return { data: { id, titulo, notas } };
}

async function deleteCarpeta(id, user) {
  const carpeta = carpetaById(id);
  if (!carpeta) fail(404, 'No se encontró la carpeta.');
  const sisters = state.carpetas.filter((item) => item.client_id === carpeta.client_id && item.area === carpeta.area).length;
  if (sisters <= 1) fail(400, 'Tiene que quedar al menos una carpeta en esta área.');
  const paths = state.items.filter((item) => item.carpeta_id === id).map((item) => item.archivo_path);
  state.items = state.items.filter((item) => item.carpeta_id !== id);
  state.carpetas = state.carpetas.filter((item) => item.id !== id);
  const client = clientById(carpeta.client_id);
  log(user.id, 'documento', `eliminó la carpeta «${carpeta.titulo}» de ${client?.nombre || ''}`.trim(), carpeta.client_id);
  for (const pathValue of paths) await dropLocal(pathValue);
  return { data: { ok: true } };
}

function addItems(carpetaId, body, user) {
  const carpeta = carpetaById(carpetaId);
  if (!carpeta) fail(404, 'No se encontró la carpeta.');
  const bucket = bucketById(carpeta.area, str(body.bucket, 40));
  if (!bucket) fail(400, 'Esa sección no existe en esta área.');
  if (bucket.tipo === 'archivo') fail(400, 'En Documentos se sube un archivo.');
  const client = clientById(carpeta.client_id);
  if (bucket.tipo === 'faltante') {
    const lineas = String(body.texto ?? body.titulo ?? '').split(/\r?\n/).map((line) => line.trim().slice(0, 200)).filter(Boolean).slice(0, 40);
    if (!lineas.length) fail(400, 'Escribí al menos un faltante.');
    for (const titulo of lineas) insertItem(carpeta.id, bucket.id, { titulo, cuerpo: '', estado: '', fecha: '' }, null, user.id);
    touch(carpeta.client_id);
    const detalle = lineas.length === 1
      ? `anotó el faltante «${lineas[0]}» en Familia de ${client?.nombre || ''}`
      : `anotó ${lineas.length} faltantes en Familia de ${client?.nombre || ''}`;
    log(user.id, 'faltante', detalle.trim(), carpeta.client_id);
    return { status: 201, data: { ok: true, cantidad: lineas.length } };
  }
  const campos = leerCampos(body, bucket);
  const item = insertItem(carpeta.id, bucket.id, campos, null, user.id);
  touch(carpeta.client_id);
  const area = areaById(carpeta.area);
  log(user.id, 'documento', `cargó «${campos.titulo}» en ${area?.nombre || ''} de ${client?.nombre || ''}`.trim(), carpeta.client_id);
  return { status: 201, data: { id: item.id } };
}

async function addArchivo(carpetaId, form, user) {
  const carpeta = carpetaById(carpetaId);
  if (!carpeta) fail(404, 'No se encontró la carpeta.');
  const bucket = bucketById(carpeta.area, str(form?.get('bucket'), 40));
  if (!bucket || bucket.tipo !== 'archivo') fail(400, 'Esa sección no recibe archivos.');
  const file = form?.get('archivo');
  if (!file || typeof file === 'string') fail(400, 'Elegí un archivo o sacá una foto.');
  const prepared = rememberFile(uid(), file);
  const itemId = uid();
  const saved = await storeFile(itemId, file, prepared.detected);
  const titulo = str(form.get('titulo'), 200) || saved.archivo_nombre.replace(/\.[^.]+$/, '') || 'Documento';
  const item = insertItem(carpeta.id, bucket.id, { titulo, cuerpo: '', estado: '', fecha: '' }, null, user.id);
  Object.assign(item, saved, { id: itemId, tipo: 'archivo' });
  touch(carpeta.client_id);
  const area = areaById(carpeta.area);
  const client = clientById(carpeta.client_id);
  log(user.id, 'documento', `subió «${titulo}» a ${area?.nombre || ''} de ${client?.nombre || ''}`.trim(), carpeta.client_id);
  return { status: 201, data: { ok: true } };
}

function patchItem(id, body) {
  const item = state.items.find((entry) => entry.id === id);
  if (!item) fail(404, 'No se encontró.');
  const carpeta = carpetaById(item.carpeta_id);
  const bucket = bucketById(carpeta?.area, item.bucket);
  const titulo = body.titulo != null ? required(body.titulo, 'el título', 200) : item.titulo;
  const cuerpo = body.cuerpo != null ? str(body.cuerpo, 5000) : item.cuerpo;
  const fecha = body.fecha != null ? cleanFecha(body.fecha, 'La fecha') : item.fecha;
  let estado = body.estado != null ? str(body.estado, 40) : item.estado;
  if (bucket?.estados?.length) {
    if (!estado) estado = bucket.estados[0].id;
    if (!bucket.estados.some((entry) => entry.id === estado)) fail(400, 'El estado no es válido.');
  }
  Object.assign(item, { titulo, cuerpo: cuerpo || '', estado: estado || '', fecha: fecha || '', updated_at: nowISO() });
  return { data: { ok: true } };
}

async function deleteItem(id) {
  const item = state.items.find((entry) => entry.id === id);
  if (!item) fail(404, 'No se encontró.');
  const pathValue = item.archivo_path;
  const carpeta = carpetaById(item.carpeta_id);
  state.items = state.items.filter((entry) => entry.id !== id);
  if (carpeta) touch(carpeta.client_id);
  await dropLocal(pathValue);
  return { data: { ok: true } };
}

async function completar(id, form, user) {
  const file = form?.get('archivo');
  if (!file || typeof file === 'string') fail(400, 'Sacá la foto o elegí un archivo.');
  const item = state.items.find((entry) => entry.id === id);
  if (!item || item.bucket !== 'faltante') fail(404, 'Ese faltante ya no está en la lista.');
  const carpeta = carpetaById(item.carpeta_id);
  if (!bucketById(carpeta?.area, 'documentos')) fail(400, 'Esta área no tiene documentos.');
  const prepared = rememberFile(uid(), file);
  const itemId = uid();
  const saved = await storeFile(itemId, file, prepared.detected);
  const created = insertItem(item.carpeta_id, 'documentos', { titulo: item.titulo, cuerpo: '', estado: '', fecha: '' }, null, user.id, item.id);
  Object.assign(created, saved, { id: itemId, tipo: 'archivo' });
  const still = state.items.find((entry) => entry.id === id && entry.bucket === 'faltante');
  if (!still) fail(409, 'Ese faltante ya se cargó.');
  state.items = state.items.filter((entry) => entry.id !== id);
  touch(carpeta.client_id);
  const client = clientById(carpeta.client_id);
  log(user.id, 'faltante', `pasó «${item.titulo}» de Faltante a Documentos de ${client?.nombre || ''}`.trim(), carpeta.client_id);
  return { data: { ok: true } };
}

function presentar(id, body, user) {
  const item = state.items.find((entry) => entry.id === id);
  const carpeta = item ? carpetaById(item.carpeta_id) : null;
  if (!item || item.bucket !== 'documentos' || carpeta?.area !== 'familia') {
    fail(400, 'Solo un documento de Familia se puede pasar a Presentado.');
  }
  if (state.items.some((entry) => entry.origen_item_id === item.id && entry.bucket === 'presentado')) {
    fail(409, 'Ese documento ya está en Presentado.');
  }
  const bucket = bucketById('familia', 'presentado');
  const campos = leerCampos({
    titulo: item.titulo,
    cuerpo: body.cuerpo || '',
    fecha: body.fecha || todayAR(),
    estado: body.estado || 'presentado',
  }, bucket);
  const archivo = item.archivo_path ? {
    archivo_nombre: item.archivo_nombre,
    archivo_mime: item.archivo_mime,
    archivo_path: item.archivo_path,
    archivo_tamano: item.archivo_tamano,
  } : null;
  insertItem(item.carpeta_id, 'presentado', campos, archivo, user.id, item.id);
  touch(carpeta.client_id);
  const client = clientById(carpeta.client_id);
  log(user.id, 'documento', `registró «${item.titulo}» como presentado de ${client?.nombre || ''}`.trim(), carpeta.client_id);
  return { status: 201, data: { ok: true } };
}

async function attach(id, form) {
  const item = state.items.find((entry) => entry.id === id);
  if (!item) fail(404, 'No se encontró.');
  const file = form?.get('archivo');
  if (!file || typeof file === 'string') fail(400, 'Elegí un archivo.');
  const prepared = rememberFile(id, file);
  const previous = item.archivo_path;
  const saved = await storeFile(id, file, prepared.detected);
  Object.assign(item, saved, { tipo: 'archivo', updated_at: nowISO() });
  if (previous && previous !== saved.archivo_path) await dropLocal(previous);
  return { data: { ok: true } };
}

function createNote(body, user) {
  const texto = required(body.texto, 'el mensaje', 800);
  const now = nowISO();
  const nota = { id: uid(), user_id: user.id, texto, created_at: now };
  state.pizarra.unshift(nota);
  return { status: 201, data: { nota: { id: nota.id, texto, createdAt: now, userId: user.id, usuario: user.nombre } } };
}

function deleteNote(id, user) {
  const row = state.pizarra.find((item) => item.id === id);
  if (!row) fail(404, 'No se encontró la nota.');
  if (row.user_id !== user.id && user.rol !== 'superadmin') fail(403, 'Solo quien la escribió, o la administración, puede borrarla.');
  state.pizarra = state.pizarra.filter((item) => item.id !== id);
  return { data: { ok: true } };
}

function createUser(body, actor) {
  requireSuper();
  const nombre = required(body.nombre, 'el nombre', 120).replace(/\s+/g, ' ');
  const username = required(body.username, 'el usuario', 40).replace(/\s+/g, '');
  const password = String(body.password || '');
  if (password.length < 6) fail(400, 'La clave necesita al menos 6 caracteres.');
  const rol = str(body.rol || 'operador', 20);
  if (!state.roles.some((item) => item.id === rol)) fail(400, 'El rol no es válido.');
  if (state.users.some((user) => user.username.toLowerCase() === username.toLowerCase())) fail(409, 'Ese usuario ya existe.');
  const user = {
    id: uid(),
    nombre,
    username,
    rol,
    activo: 1,
    created_at: nowISO(),
  };
  state.users.push(user);
  state.passwords[user.id] = password;
  log(actor.id, 'equipo', `creó la cuenta de ${nombre}`, null);
  return { status: 201, data: { user: publicUser(user) } };
}

function patchUser(id, body, actor) {
  requireSuper();
  const user = userById(id);
  if (!user) fail(404, 'No se encontró la cuenta.');
  const nombre = body.nombre != null ? required(body.nombre, 'el nombre', 120).replace(/\s+/g, ' ') : user.nombre;
  const rol = body.rol != null ? str(body.rol, 20) : user.rol;
  if (!state.roles.some((item) => item.id === rol)) fail(400, 'El rol no es válido.');
  const activo = body.activo != null ? (body.activo ? 1 : 0) : user.activo;
  if (user.id === actor.id && !activo) fail(400, 'No podés desactivar tu propia cuenta.');
  const leavesAdmin = user.rol === 'superadmin' && user.activo && (rol !== 'superadmin' || !activo);
  if (leavesAdmin && activeAdmins(user.id) === 0) fail(400, 'Tiene que quedar al menos una administración activa.');
  const password = String(body.password || '');
  if (body.password && password.length < 6) fail(400, 'La clave necesita al menos 6 caracteres.');
  Object.assign(user, { nombre, rol, activo });
  if (password) state.passwords[user.id] = password;
  if (user.id === actor.id) currentId = user.activo ? user.id : '';
  return { data: { user: publicUser(user) } };
}

function deleteUser(id, actor) {
  requireSuper();
  const user = userById(id);
  if (!user) fail(404, 'No se encontró la cuenta.');
  if (user.id === actor.id) fail(400, 'No podés eliminar tu propia cuenta.');
  if (user.rol === 'superadmin' && user.activo && activeAdmins(user.id) === 0) {
    fail(400, 'Tiene que quedar al menos una administración activa.');
  }
  state.users = state.users.filter((item) => item.id !== id);
  delete state.passwords[id];
  log(actor.id, 'equipo', `eliminó la cuenta de ${user.nombre}`, null);
  return { data: { ok: true } };
}

function changePassword(body, user) {
  const actual = String(body.actual || '');
  const nueva = String(body.nueva || '');
  if (nueva.length < 6) fail(400, 'La clave nueva necesita al menos 6 caracteres.');
  if (state.passwords[user.id] !== actual) fail(400, 'La clave actual no coincide.');
  state.passwords[user.id] = nueva;
  return { data: { ok: true } };
}

function saveSettings(body) {
  requireSuper();
  state.settings = {
    estudioNombre: required(body.estudioNombre, 'el nombre del estudio', 120),
    titular: required(body.titular, 'el nombre de la titular', 120),
    matricula: str(body.matricula, 60),
    colegio: str(body.colegio, 120),
    telefono: str(body.telefono, 40),
    email: cleanEmail(body.email),
    cuit: str(body.cuit, 20),
    direccion: str(body.direccion, 200),
    localidad: str(body.localidad, 80),
    pie: str(body.pie, 240),
  };
  return { data: { settings: state.settings } };
}
