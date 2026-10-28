import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import express from 'express';
import Busboy from 'busboy';
import { AREAS, ROLES, TURNO_ESTADOS, areaById, bucketById } from './areas.js';
import {
  branding,
  db,
  digits,
  ensureArea,
  fold,
  getSettings,
  hashPassword,
  id,
  logActivity,
  nowISO,
  removeFileIfOrphan,
  todayAR,
  touchClient,
  tx,
  uploadDir,
  verifyPassword,
} from './db.js';

const publicDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
const PORT = Number(process.env.PORT || 8787);
const SESSION_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_FILE = 20 * 1024 * 1024;

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

const EXT = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.heic': 'image/heic',
  '.heif': 'image/heif',
  '.pdf': 'application/pdf',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};

const attempts = new Map();
const DUMMY_HASH = hashPassword('agenda-reverter-placeholder');

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function str(value, max) {
  return String(value ?? '').trim().slice(0, max);
}

function required(value, label, max) {
  const clean = str(value, max);
  if (!clean) throw httpError(400, `Falta ${label}.`);
  return clean;
}

function cleanEmail(value) {
  const email = str(value, 160);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw httpError(400, 'El email no parece válido.');
  }
  return email;
}

function cleanHora(value) {
  const match = /^(\d{2}):(\d{2})/.exec(String(value || ''));
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return `${match[1]}:${match[2]}`;
}

function cleanFecha(value, label) {
  const fecha = str(value, 10);
  if (!fecha) return '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) throw httpError(400, `${label} no es válida.`);
  return fecha;
}

function like(value) {
  return `%${String(value).replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
}

function readCookie(req, name) {
  const raw = req.headers.cookie || '';
  for (const part of raw.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return decodeURIComponent(rest.join('='));
  }
  return '';
}

function clientIp(req) {
  const forwarded = req.headers['cf-connecting-ip'];
  if (typeof forwarded === 'string' && forwarded) return forwarded;
  return req.socket.remoteAddress || 'local';
}

function publicUser(row) {
  return {
    id: row.id,
    nombre: row.nombre,
    username: row.username,
    rol: row.rol,
    activo: Boolean(row.activo),
    createdAt: row.created_at,
  };
}

function loadUser(req) {
  const token = readCookie(req, 'sid');
  if (!token) return null;
  const session = db.prepare('SELECT * FROM sessions WHERE token = ?').get(token);
  if (!session || session.expires_at < Date.now()) {
    if (session) db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
    return null;
  }
  return db.prepare(
    'SELECT id, nombre, username, rol, activo, created_at FROM users WHERE id = ?',
  ).get(session.user_id);
}

function requireAuth(req, res, next) {
  const user = loadUser(req);
  if (!user || !user.activo) {
    res.status(401).json({ error: 'Tenés que ingresar.' });
    return;
  }
  req.user = user;
  next();
}

function requireSuper(req, res, next) {
  if (req.user.rol !== 'superadmin') {
    res.status(403).json({ error: 'Solo la administración puede hacer esto.' });
    return;
  }
  next();
}

function wrap(fn) {
  return (req, res, next) => {
    try {
      const result = fn(req, res, next);
      if (result && typeof result.catch === 'function') result.catch(next);
    } catch (error) {
      next(error);
    }
  };
}

function setSessionCookie(res, token) {
  res.setHeader(
    'Set-Cookie',
    `sid=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${Math.floor(SESSION_MS / 1000)}`,
  );
}

function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', 'sid=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0');
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

function getClient(clientId) {
  return db.prepare('SELECT * FROM clients WHERE id = ?').get(clientId);
}

function equipo() {
  return db.prepare(
    'SELECT id, nombre, rol FROM users WHERE activo = 1 ORDER BY nombre COLLATE NOCASE',
  ).all();
}

function saludo(date = new Date()) {
  const hour = Number(new Intl.DateTimeFormat('en-GB', {
    timeZone: 'America/Argentina/Buenos_Aires',
    hour: 'numeric',
    hourCycle: 'h23',
  }).format(date));
  if (hour < 12) return 'Buenos días';
  if (hour < 19) return 'Buenas tardes';
  return 'Buenas noches';
}

function primerNombre(nombre) {
  return String(nombre || '').trim().split(/\s+/)[0] || nombre;
}

function contarFaltantes() {
  return db.prepare("SELECT COUNT(*) AS n FROM items WHERE bucket = 'faltante'").get().n;
}

function parseMultipart(req) {
  return new Promise((resolve, reject) => {
    if (!req.headers['content-type']?.includes('multipart/form-data')) {
      reject(httpError(400, 'Falta el archivo.'));
      return;
    }
    const fields = {};
    const files = [];
    let limited = false;
    const parser = Busboy({
      headers: req.headers,
      limits: { fileSize: MAX_FILE, files: 1, fields: 24 },
    });
    parser.on('field', (name, value) => {
      fields[name] = value;
    });
    parser.on('file', (_name, stream, info) => {
      const chunks = [];
      stream.on('data', (chunk) => chunks.push(chunk));
      stream.on('limit', () => {
        limited = true;
      });
      stream.on('end', () => {
        if (limited) return;
        const buffer = Buffer.concat(chunks);
        if (!buffer.length) return;
        files.push({
          filename: info.filename || 'archivo',
          mime: info.mimeType || '',
          buffer,
        });
      });
    });
    parser.on('error', reject);
    parser.on('finish', () => {
      if (limited) reject(httpError(413, 'El archivo supera los 20 MB.'));
      else resolve({ fields, files });
    });
    req.pipe(parser);
  });
}

function detectFile(mime, filename) {
  if (MIME[mime]) return { mime, ext: MIME[mime] };
  const ext = path.extname(filename || '').toLowerCase();
  if (EXT[ext]) return { mime: EXT[ext], ext: ext === '.jpeg' ? '.jpg' : ext };
  return null;
}

function saveUpload(file) {
  const detected = detectFile(file?.mime, file?.filename);
  if (!detected) throw httpError(415, 'Formato no permitido. Usá una foto, PDF o Word.');
  const stored = `${id()}${detected.ext}`;
  fs.writeFileSync(path.join(uploadDir, stored), file.buffer);
  const original = path.basename(file.filename || `archivo${detected.ext}`).slice(0, 180);
  return {
    archivo_nombre: original || `archivo${detected.ext}`,
    archivo_mime: detected.mime,
    archivo_path: stored,
    archivo_tamano: file.buffer.length,
  };
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

function guardarCliente(data, clientId, userId) {
  const now = nowISO();
  db.prepare(`
    UPDATE clients
    SET nombre = ?, nombre_busqueda = ?, dni = ?, dni_busqueda = ?, telefono = ?, telefono_busqueda = ?,
        email = ?, domicilio = ?, notas = ?, updated_at = ?
    WHERE id = ?
  `).run(
    data.nombre,
    fold(data.nombre),
    data.dni,
    digits(data.dni),
    data.telefono,
    digits(data.telefono),
    data.email,
    data.domicilio,
    data.notas,
    now,
    clientId,
  );
  return getClient(clientId);
}

function crearCliente(data, userId) {
  const clientId = id();
  const now = nowISO();
  tx(() => {
    db.prepare(`
      INSERT INTO clients (
        id, nombre, nombre_busqueda, dni, dni_busqueda, telefono, telefono_busqueda,
        email, domicilio, notas, created_at, updated_at, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      clientId,
      data.nombre,
      fold(data.nombre),
      data.dni,
      digits(data.dni),
      data.telefono,
      digits(data.telefono),
      data.email,
      data.domicilio,
      data.notas,
      now,
      now,
      userId,
    );
    logActivity(userId, 'cliente', `cargó el cliente ${data.nombre}`, clientId);
  });
  return getClient(clientId);
}

function leerTurno(body) {
  const clientId = required(body.clientId, 'el cliente', 80);
  const fecha = cleanFecha(body.fecha, 'La fecha');
  if (!fecha) throw httpError(400, 'Falta la fecha.');
  const hora = cleanHora(body.hora);
  if (!hora) throw httpError(400, 'La hora no es válida.');
  const motivo = required(body.motivo, 'el motivo', 200);
  const notas = str(body.notas, 2000);
  const estado = str(body.estado || 'pendiente', 20);
  if (!TURNO_ESTADOS.some((item) => item.id === estado)) throw httpError(400, 'El estado no es válido.');
  const asignadoA = str(body.asignadoA, 80) || null;
  if (!getClient(clientId)) throw httpError(404, 'No se encontró el cliente.');
  if (asignadoA && !db.prepare('SELECT id FROM users WHERE id = ? AND activo = 1').get(asignadoA)) {
    throw httpError(400, 'La persona asignada no está activa.');
  }
  return { clientId, fecha, hora, motivo, notas, estado, asignadoA };
}

function mapTurno(row) {
  return {
    id: row.id,
    clientId: row.client_id,
    clienteNombre: row.cliente_nombre || '',
    clienteTelefono: row.cliente_telefono || '',
    fecha: row.fecha,
    hora: row.hora,
    motivo: row.motivo,
    notas: row.notas || '',
    estado: row.estado,
    asignadoA: row.asignado_a || '',
    asignadoNombre: row.asignado_nombre || '',
    createdAt: row.created_at,
  };
}

const turnoSelect = `
  SELECT t.*, c.nombre AS cliente_nombre, c.telefono AS cliente_telefono, u.nombre AS asignado_nombre
  FROM turnos t
  JOIN clients c ON c.id = t.client_id
  LEFT JOIN users u ON u.id = t.asignado_a
`;

function carpetaDe(carpetaId) {
  return db.prepare(`
    SELECT k.*, c.nombre AS cliente_nombre
    FROM carpetas k
    JOIN clients c ON c.id = k.client_id
    WHERE k.id = ?
  `).get(carpetaId);
}

function leerCampos(body, bucket) {
  const titulo = required(body.titulo, 'el título', 200);
  const cuerpo = str(body.cuerpo, 5000);
  const fecha = cleanFecha(body.fecha, 'La fecha');
  let estado = str(body.estado, 40);
  if (bucket.estados?.length) {
    if (!estado) estado = bucket.estados[0].id;
    if (!bucket.estados.some((item) => item.id === estado)) throw httpError(400, 'El estado no es válido.');
  } else {
    estado = '';
  }
  return { titulo, cuerpo, fecha, estado };
}

function insertItem(carpetaId, bucketId, campos, archivo, userId, origenId = null) {
  const itemId = id();
  const now = nowISO();
  db.prepare(`
    INSERT INTO items (
      id, carpeta_id, bucket, tipo, titulo, cuerpo, estado, fecha,
      archivo_nombre, archivo_mime, archivo_path, archivo_tamano, origen_item_id,
      created_at, updated_at, created_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    itemId,
    carpetaId,
    bucketId,
    archivo ? 'archivo' : 'texto',
    campos.titulo,
    campos.cuerpo || '',
    campos.estado || '',
    campos.fecha || '',
    archivo?.archivo_nombre || null,
    archivo?.archivo_mime || null,
    archivo?.archivo_path || null,
    archivo?.archivo_tamano || null,
    origenId,
    now,
    now,
    userId,
  );
  return itemId;
}

function mapItem(row) {
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
    creadoPor: row.creado_por_nombre || '',
  };
}

function legajo(clientId) {
  const client = getClient(clientId);
  if (!client) return null;
  const carpetas = db.prepare(
    'SELECT * FROM carpetas WHERE client_id = ? ORDER BY created_at ASC',
  ).all(clientId);
  const items = db.prepare(`
    SELECT i.*, u.nombre AS creado_por_nombre
    FROM items i
    JOIN carpetas k ON k.id = i.carpeta_id
    LEFT JOIN users u ON u.id = i.created_by
    WHERE k.client_id = ?
    ORDER BY i.created_at ASC
  `).all(clientId);
  const byCarpeta = new Map(carpetas.map((carpeta) => [carpeta.id, []]));
  for (const item of items) byCarpeta.get(item.carpeta_id)?.push(mapItem(item));
  return {
    client: mapClient(client),
    totales: { faltantes: contarFaltantes() },
    areas: AREAS.map((area) => ({
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
          items: groupItems(byCarpeta.get(carpeta.id) || [], area.buckets),
        })),
    })).filter((area) => area.carpetas.length),
  };
}

function areasPorClientes(ids) {
  const map = new Map(ids.map((clientId) => [clientId, []]));
  if (!ids.length) return map;
  const rows = db.prepare(
    `SELECT DISTINCT client_id, area FROM carpetas WHERE client_id IN (${ids.map(() => '?').join(',')})`,
  ).all(...ids);
  for (const row of rows) {
    const area = areaById(row.area);
    const list = map.get(row.client_id);
    if (area && list) list.push({ id: area.id, nombre: area.nombre });
  }
  for (const list of map.values()) {
    list.sort((a, b) => AREAS.findIndex((area) => area.id === a.id) - AREAS.findIndex((area) => area.id === b.id));
  }
  return map;
}

function areaPayload(clientId, areaId) {
  const client = getClient(clientId);
  const area = areaById(areaId);
  if (!client || !area) return null;
  const carpetas = db.prepare(
    'SELECT * FROM carpetas WHERE client_id = ? AND area = ? ORDER BY created_at ASC',
  ).all(clientId, areaId);
  const items = carpetas.length
    ? db.prepare(`
      SELECT i.*, u.nombre AS creado_por_nombre
      FROM items i
      JOIN carpetas k ON k.id = i.carpeta_id
      LEFT JOIN users u ON u.id = i.created_by
      WHERE k.client_id = ? AND k.area = ?
      ORDER BY i.created_at ASC
    `).all(clientId, areaId)
    : [];
  const byCarpeta = new Map(carpetas.map((carpeta) => [carpeta.id, []]));
  for (const item of items) byCarpeta.get(item.carpeta_id)?.push(mapItem(item));
  return {
    client: { ...mapClient(client), areas: areasPorClientes([clientId]).get(clientId) || [] },
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
        items: groupItems(byCarpeta.get(carpeta.id) || [], area.buckets),
      })),
    },
  };
}

function groupItems(items, buckets) {
  const grouped = {};
  for (const bucket of buckets) grouped[bucket.id] = [];
  for (const item of items) {
    if (!grouped[item.bucket]) grouped[item.bucket] = [];
    grouped[item.bucket].push(item);
  }
  for (const bucket of buckets) {
    if (bucket.tipo === 'faltante') continue;
    grouped[bucket.id].reverse();
  }
  return grouped;
}

function contentDisposition(filename, download) {
  const clean = String(filename || 'archivo').replace(/["\r\n]/g, '');
  const star = encodeURIComponent(filename || 'archivo');
  return `${download ? 'attachment' : 'inline'}; filename="${clean}"; filename*=UTF-8''${star}`;
}

function activeAdmins(exceptId = '') {
  return db.prepare(
    "SELECT COUNT(*) AS n FROM users WHERE rol = 'superadmin' AND activo = 1 AND id != ?",
  ).get(exceptId).n;
}

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  next();
});

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

app.get('/api/branding', (_req, res) => {
  res.json(branding());
});

app.post('/api/login', wrap((req, res) => {
  const ip = clientIp(req);
  const now = Date.now();
  const recent = (attempts.get(ip) || []).filter((stamp) => now - stamp < 10 * 60 * 1000);
  if (recent.length >= 8) throw httpError(429, 'Demasiados intentos. Esperá unos minutos.');
  const username = str(req.body?.username, 40);
  const password = String(req.body?.password || '');
  const user = db.prepare('SELECT * FROM users WHERE username = ? COLLATE NOCASE').get(username);
  const valid = verifyPassword(password, user ? user.password_hash : DUMMY_HASH) && Boolean(user);
  if (!valid) {
    recent.push(now);
    attempts.set(ip, recent);
    throw httpError(401, 'Usuario o clave incorrectos.');
  }
  if (!user.activo) throw httpError(403, 'Esta cuenta está desactivada. Pedile a la administración que la habilite.');
  attempts.delete(ip);
  db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(now);
  const token = randomBytes(32).toString('hex');
  db.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)').run(token, user.id, now + SESSION_MS);
  setSessionCookie(res, token);
  res.json({ user: publicUser(user) });
}));

app.post('/api/logout', (req, res) => {
  const token = readCookie(req, 'sid');
  if (token) db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
  clearSessionCookie(res);
  res.json({ ok: true });
});

app.get('/api/me', wrap((req, res) => {
  const user = loadUser(req);
  if (!user?.activo) {
    res.json({ user: null });
    return;
  }
  res.json({
    user: publicUser(user),
    settings: getSettings(),
    areas: AREAS,
    roles: ROLES,
    turnoEstados: TURNO_ESTADOS,
    equipo: equipo(),
    faltantes: contarFaltantes(),
  });
}));

app.get('/api/dashboard', requireAuth, wrap((req, res) => {
  const hoy = todayAR();
  const turnosHoy = db.prepare(`${turnoSelect} WHERE t.fecha = ? ORDER BY t.hora`).all(hoy).map(mapTurno);
  const proximos = db.prepare(
    `${turnoSelect} WHERE t.fecha > ? AND t.estado != 'cancelado' ORDER BY t.fecha, t.hora LIMIT 8`,
  ).all(hoy).map(mapTurno);
  const faltanteRows = db.prepare(`
    SELECT c.id, c.nombre, c.dni, i.titulo, k.area
    FROM items i
    JOIN carpetas k ON k.id = i.carpeta_id
    JOIN clients c ON c.id = k.client_id
    WHERE i.bucket = 'faltante'
    ORDER BY c.nombre COLLATE NOCASE, i.created_at ASC
  `).all();
  const faltantes = [];
  for (const row of faltanteRows) {
    let group = faltantes.find((item) => item.id === row.id);
    if (!group) {
      group = { id: row.id, nombre: row.nombre, dni: row.dni || '', area: row.area, cantidad: 0, titulos: [] };
      faltantes.push(group);
    }
    group.cantidad += 1;
    if (group.titulos.length < 4) group.titulos.push(row.titulo);
  }
  const pizarra = db.prepare(`
    SELECT p.id, p.texto, p.created_at AS createdAt, u.nombre AS usuario, p.user_id AS userId
    FROM pizarra p
    LEFT JOIN users u ON u.id = p.user_id
    ORDER BY p.created_at DESC
    LIMIT 30
  `).all();
  const actividad = db.prepare(`
    SELECT a.id, a.accion, a.detalle, a.created_at AS createdAt, a.client_id AS clientId, u.nombre AS usuario
    FROM activity a
    LEFT JOIN users u ON u.id = a.user_id
    ORDER BY a.created_at DESC
    LIMIT 30
  `).all();
  res.json({
    saludo: saludo(),
    hoy,
    nombreCorto: primerNombre(req.user.nombre),
    turnosHoy,
    proximos,
    faltantes: faltantes.slice(0, 12),
    pizarra,
    actividad,
    conteos: {
      clientes: db.prepare('SELECT COUNT(*) AS n FROM clients').get().n,
      faltantes: contarFaltantes(),
      turnosHoy: turnosHoy.filter((turno) => turno.estado !== 'cancelado').length,
    },
  });
}));

app.get('/api/equipo', requireAuth, wrap((_req, res) => {
  res.json({ users: equipo() });
}));

app.get('/api/clients', requireAuth, wrap((req, res) => {
  const q = str(req.query.q, 120);
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  let rows;
  if (!q) {
    rows = db.prepare('SELECT * FROM clients ORDER BY updated_at DESC LIMIT ?').all(limit);
  } else {
    const folded = fold(q);
    const nums = digits(q);
    rows = db.prepare(`
      SELECT * FROM clients
      WHERE nombre_busqueda LIKE ? ESCAPE '\\'
         OR lower(email) LIKE ? ESCAPE '\\'
         OR (? != '' AND dni_busqueda LIKE ? ESCAPE '\\')
         OR (? != '' AND telefono_busqueda LIKE ? ESCAPE '\\')
      ORDER BY nombre COLLATE NOCASE
      LIMIT ?
    `).all(like(folded), like(q.toLowerCase()), nums, nums ? like(nums) : '', nums, nums ? like(nums) : '', limit);
  }
  const areas = areasPorClientes(rows.map((row) => row.id));
  res.json({ clients: rows.map((row) => ({ ...mapClient(row), areas: areas.get(row.id) || [] })) });
}));

app.post('/api/clients', requireAuth, wrap((req, res) => {
  const client = crearCliente(leerCliente(req.body || {}), req.user.id);
  res.status(201).json({ client: mapClient(client) });
}));

app.get('/api/clients/:id', requireAuth, wrap((req, res) => {
  const client = getClient(req.params.id);
  if (!client) throw httpError(404, 'No se encontró el cliente.');
  const hoy = todayAR();
  const turnos = db.prepare(
    `${turnoSelect} WHERE t.client_id = ? AND t.fecha >= ? ORDER BY t.fecha, t.hora LIMIT 8`,
  ).all(client.id, hoy).map(mapTurno);
  const comentarios = db.prepare(`
    SELECT m.id, m.texto, m.created_at AS createdAt, m.user_id AS userId, u.nombre AS usuario
    FROM comentarios m
    LEFT JOIN users u ON u.id = m.user_id
    WHERE m.client_id = ?
    ORDER BY m.created_at DESC
    LIMIT 80
  `).all(client.id).reverse();
  const counts = db.prepare(`
    SELECT k.area, i.bucket, COUNT(i.id) AS n
    FROM carpetas k
    LEFT JOIN items i ON i.carpeta_id = k.id
    WHERE k.client_id = ?
    GROUP BY k.area, i.bucket
  `).all(client.id);
  const resumen = AREAS.map((area) => {
    const rows = counts.filter((row) => row.area === area.id && row.bucket);
    const total = rows.reduce((sum, row) => sum + row.n, 0);
    const faltantes = rows.find((row) => row.bucket === 'faltante')?.n || 0;
    return { id: area.id, nombre: area.nombre, total, faltantes };
  });
  res.json({
    client: { ...mapClient(client), areas: areasPorClientes([client.id]).get(client.id) || [] },
    turnos,
    comentarios,
    resumen,
  });
}));

app.patch('/api/clients/:id', requireAuth, wrap((req, res) => {
  if (!getClient(req.params.id)) throw httpError(404, 'No se encontró el cliente.');
  const data = leerCliente(req.body || {});
  tx(() => {
    guardarCliente(data, req.params.id, req.user.id);
    logActivity(req.user.id, 'cliente', `actualizó la ficha de ${data.nombre}`, req.params.id);
  });
  res.json({ client: mapClient(getClient(req.params.id)) });
}));

app.delete('/api/clients/:id', requireAuth, requireSuper, wrap((req, res) => {
  const client = getClient(req.params.id);
  if (!client) throw httpError(404, 'No se encontró el cliente.');
  const files = db.prepare(`
    SELECT i.archivo_path FROM items i
    JOIN carpetas k ON k.id = i.carpeta_id
    WHERE k.client_id = ? AND i.archivo_path IS NOT NULL
  `).all(client.id);
  tx(() => {
    db.prepare('DELETE FROM clients WHERE id = ?').run(client.id);
    logActivity(req.user.id, 'cliente', `eliminó el cliente ${client.nombre}`, null);
  });
  for (const file of files) removeFileIfOrphan(file.archivo_path);
  res.json({ ok: true });
}));

app.get('/api/clients/:id/legales', requireAuth, wrap((req, res) => {
  const data = legajo(req.params.id);
  if (!data) throw httpError(404, 'No se encontró el cliente.');
  res.json(data);
}));

app.get('/api/legales/resumen', requireAuth, wrap((_req, res) => {
  const clientes = db.prepare('SELECT area, COUNT(DISTINCT client_id) AS n FROM carpetas GROUP BY area').all();
  const faltantes = db.prepare(`
    SELECT k.area, COUNT(*) AS n
    FROM items i
    JOIN carpetas k ON k.id = i.carpeta_id
    WHERE i.bucket = 'faltante'
    GROUP BY k.area
  `).all();
  res.json({
    areas: AREAS.map((area) => ({
      id: area.id,
      clientes: clientes.find((row) => row.area === area.id)?.n || 0,
      faltantes: faltantes.find((row) => row.area === area.id)?.n || 0,
    })),
  });
}));

app.get('/api/areas/:area/clientes', requireAuth, wrap((req, res) => {
  const area = areaById(req.params.area);
  if (!area) throw httpError(404, 'No existe esa área.');
  const q = str(req.query.q, 120);
  const limit = Math.min(Number(req.query.limit) || 80, 200);
  const folded = fold(q);
  const nums = digits(q);
  const search = q
    ? `AND (
        c.nombre_busqueda LIKE ? ESCAPE '\\'
        OR lower(c.email) LIKE ? ESCAPE '\\'
        OR (? != '' AND c.dni_busqueda LIKE ? ESCAPE '\\')
        OR (? != '' AND c.telefono_busqueda LIKE ? ESCAPE '\\')
      )`
    : '';
  const searchParams = q
    ? [like(folded), like(q.toLowerCase()), nums, nums ? like(nums) : '', nums, nums ? like(nums) : '']
    : [];
  const rows = db.prepare(`
    SELECT c.*,
      (SELECT COUNT(*) FROM items i JOIN carpetas k ON k.id = i.carpeta_id
        WHERE k.client_id = c.id AND k.area = ? AND i.bucket = 'faltante') AS faltantes,
      (SELECT COUNT(*) FROM items i JOIN carpetas k ON k.id = i.carpeta_id
        WHERE k.client_id = c.id AND k.area = ? AND i.bucket != 'faltante') AS piezas
    FROM clients c
    WHERE EXISTS (SELECT 1 FROM carpetas k WHERE k.client_id = c.id AND k.area = ?)
    ${search}
    ORDER BY c.nombre COLLATE NOCASE
    LIMIT ?
  `).all(area.id, area.id, area.id, ...searchParams, limit);
  const fuera = q
    ? db.prepare(`
      SELECT c.* FROM clients c
      WHERE NOT EXISTS (SELECT 1 FROM carpetas k WHERE k.client_id = c.id AND k.area = ?)
      ${search}
      ORDER BY c.nombre COLLATE NOCASE
      LIMIT 6
    `).all(area.id, ...searchParams).map(mapClient)
    : [];
  res.json({
    clients: rows.map((row) => ({ ...mapClient(row), faltantes: row.faltantes, piezas: row.piezas })),
    fuera,
  });
}));

app.get('/api/clients/:id/areas/:area', requireAuth, wrap((req, res) => {
  const data = areaPayload(req.params.id, req.params.area);
  if (!data) throw httpError(404, 'No se encontró el cliente o el área.');
  res.json(data);
}));

app.post('/api/clients/:id/areas/:area', requireAuth, wrap((req, res) => {
  const client = getClient(req.params.id);
  const area = areaById(req.params.area);
  if (!client) throw httpError(404, 'No se encontró el cliente.');
  if (!area) throw httpError(404, 'No existe esa área.');
  const already = db.prepare('SELECT 1 AS n FROM carpetas WHERE client_id = ? AND area = ?').get(client.id, area.id);
  tx(() => {
    ensureArea(client.id, area.id, req.user.id);
    touchClient(client.id);
    if (!already) logActivity(req.user.id, 'legajo', `sumó a ${client.nombre} en ${area.nombre}`, client.id);
  });
  res.status(201).json(areaPayload(client.id, area.id));
}));

app.delete('/api/clients/:id/areas/:area', requireAuth, wrap((req, res) => {
  const client = getClient(req.params.id);
  const area = areaById(req.params.area);
  if (!client) throw httpError(404, 'No se encontró el cliente.');
  if (!area) throw httpError(404, 'No existe esa área.');
  const files = db.prepare(`
    SELECT i.archivo_path FROM items i
    JOIN carpetas k ON k.id = i.carpeta_id
    WHERE k.client_id = ? AND k.area = ? AND i.archivo_path IS NOT NULL
  `).all(client.id, area.id);
  tx(() => {
    db.prepare('DELETE FROM carpetas WHERE client_id = ? AND area = ?').run(client.id, area.id);
    touchClient(client.id);
    logActivity(req.user.id, 'legajo', `quitó a ${client.nombre} de ${area.nombre}`, client.id);
  });
  for (const file of files) removeFileIfOrphan(file.archivo_path);
  res.json({ ok: true });
}));

app.post('/api/clients/:id/comentarios', requireAuth, wrap((req, res) => {
  if (!getClient(req.params.id)) throw httpError(404, 'No se encontró el cliente.');
  const texto = required(req.body?.texto, 'el mensaje', 800);
  const commentId = id();
  const now = nowISO();
  tx(() => {
    db.prepare(
      'INSERT INTO comentarios (id, client_id, user_id, texto, created_at) VALUES (?, ?, ?, ?, ?)',
    ).run(commentId, req.params.id, req.user.id, texto, now);
    touchClient(req.params.id);
  });
  res.status(201).json({
    comentario: { id: commentId, texto, createdAt: now, userId: req.user.id, usuario: req.user.nombre },
  });
}));

app.delete('/api/comentarios/:id', requireAuth, wrap((req, res) => {
  const row = db.prepare('SELECT * FROM comentarios WHERE id = ?').get(req.params.id);
  if (!row) throw httpError(404, 'No se encontró el mensaje.');
  if (row.user_id !== req.user.id && req.user.rol !== 'superadmin') {
    throw httpError(403, 'Solo quien lo escribió, o la administración, puede borrarlo.');
  }
  db.prepare('DELETE FROM comentarios WHERE id = ?').run(row.id);
  res.json({ ok: true });
}));

app.get('/api/turnos', requireAuth, wrap((req, res) => {
  const desde = cleanFecha(req.query.desde, 'La fecha');
  const hasta = cleanFecha(req.query.hasta, 'La fecha');
  if (!desde || !hasta) throw httpError(400, 'Falta el rango de fechas.');
  const turnos = db.prepare(
    `${turnoSelect} WHERE t.fecha >= ? AND t.fecha <= ? ORDER BY t.fecha, t.hora`,
  ).all(desde, hasta).map(mapTurno);
  res.json({ turnos });
}));

app.post('/api/turnos', requireAuth, wrap((req, res) => {
  const data = leerTurno(req.body || {});
  const turnoId = id();
  const client = getClient(data.clientId);
  tx(() => {
    db.prepare(`
      INSERT INTO turnos (id, client_id, fecha, hora, motivo, notas, estado, asignado_a, created_by, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(turnoId, data.clientId, data.fecha, data.hora, data.motivo, data.notas, data.estado, data.asignadoA, req.user.id, nowISO());
    touchClient(data.clientId);
    logActivity(
      req.user.id,
      'turno',
      `agendó a ${client.nombre} el ${data.fecha.split('-').reverse().join('/')} a las ${data.hora}`,
      data.clientId,
    );
  });
  res.status(201).json({ turno: mapTurno(db.prepare(`${turnoSelect} WHERE t.id = ?`).get(turnoId)) });
}));

app.patch('/api/turnos/:id', requireAuth, wrap((req, res) => {
  const current = db.prepare('SELECT * FROM turnos WHERE id = ?').get(req.params.id);
  if (!current) throw httpError(404, 'No se encontró el turno.');
  const data = leerTurno({ ...currentToBody(current), ...req.body });
  const client = getClient(data.clientId);
  tx(() => {
    db.prepare(`
      UPDATE turnos
      SET client_id = ?, fecha = ?, hora = ?, motivo = ?, notas = ?, estado = ?, asignado_a = ?
      WHERE id = ?
    `).run(data.clientId, data.fecha, data.hora, data.motivo, data.notas, data.estado, data.asignadoA, current.id);
    touchClient(data.clientId);
    if (data.estado !== current.estado) {
      const nombre = TURNO_ESTADOS.find((item) => item.id === data.estado)?.nombre || data.estado;
      logActivity(req.user.id, 'turno', `marcó como ${nombre.toLowerCase()} el turno de ${client.nombre}`, data.clientId);
    }
  });
  res.json({ turno: mapTurno(db.prepare(`${turnoSelect} WHERE t.id = ?`).get(current.id)) });
}));

function currentToBody(row) {
  return {
    clientId: row.client_id,
    fecha: row.fecha,
    hora: row.hora,
    motivo: row.motivo,
    notas: row.notas,
    estado: row.estado,
    asignadoA: row.asignado_a || '',
  };
}

app.delete('/api/turnos/:id', requireAuth, wrap((req, res) => {
  const turno = db.prepare(`${turnoSelect} WHERE t.id = ?`).get(req.params.id);
  if (!turno) throw httpError(404, 'No se encontró el turno.');
  tx(() => {
    db.prepare('DELETE FROM turnos WHERE id = ?').run(turno.id);
    logActivity(req.user.id, 'turno', `canceló la reserva del turno de ${turno.cliente_nombre} (${turno.fecha} ${turno.hora})`, turno.client_id);
  });
  res.json({ ok: true });
}));

app.post('/api/clients/:id/carpetas', requireAuth, wrap((req, res) => {
  const client = getClient(req.params.id);
  if (!client) throw httpError(404, 'No se encontró el cliente.');
  const area = areaById(str(req.body?.area, 40));
  if (!area) throw httpError(400, 'Esa área no existe.');
  const titulo = required(req.body?.titulo, 'el nombre de la carpeta', 120);
  const carpetaId = id();
  db.prepare(
    'INSERT INTO carpetas (id, client_id, area, titulo, notas, created_at, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)',
  ).run(carpetaId, client.id, area.id, titulo, '', nowISO(), req.user.id);
  res.status(201).json({ id: carpetaId, titulo, notas: '' });
}));

app.patch('/api/carpetas/:id', requireAuth, wrap((req, res) => {
  const carpeta = carpetaDe(req.params.id);
  if (!carpeta) throw httpError(404, 'No se encontró la carpeta.');
  const titulo = req.body?.titulo != null ? required(req.body.titulo, 'el nombre de la carpeta', 120) : carpeta.titulo;
  const notas = req.body?.notas != null ? str(req.body.notas, 500) : carpeta.notas;
  db.prepare('UPDATE carpetas SET titulo = ?, notas = ? WHERE id = ?').run(titulo, notas, carpeta.id);
  res.json({ id: carpeta.id, titulo, notas });
}));

app.delete('/api/carpetas/:id', requireAuth, wrap((req, res) => {
  const carpeta = carpetaDe(req.params.id);
  if (!carpeta) throw httpError(404, 'No se encontró la carpeta.');
  const sisters = db.prepare(
    'SELECT COUNT(*) AS n FROM carpetas WHERE client_id = ? AND area = ?',
  ).get(carpeta.client_id, carpeta.area).n;
  if (sisters <= 1) throw httpError(400, 'Tiene que quedar al menos una carpeta en esta área.');
  const files = db.prepare(
    'SELECT archivo_path FROM items WHERE carpeta_id = ? AND archivo_path IS NOT NULL',
  ).all(carpeta.id);
  tx(() => {
    db.prepare('DELETE FROM carpetas WHERE id = ?').run(carpeta.id);
    logActivity(req.user.id, 'documento', `eliminó la carpeta «${carpeta.titulo}» de ${carpeta.cliente_nombre}`, carpeta.client_id);
  });
  for (const file of files) removeFileIfOrphan(file.archivo_path);
  res.json({ ok: true });
}));

app.post('/api/carpetas/:id/items', requireAuth, wrap((req, res) => {
  const carpeta = carpetaDe(req.params.id);
  if (!carpeta) throw httpError(404, 'No se encontró la carpeta.');
  const bucket = bucketById(carpeta.area, str(req.body?.bucket, 40));
  if (!bucket) throw httpError(400, 'Esa sección no existe en esta área.');
  if (bucket.tipo === 'archivo') throw httpError(400, 'En Documentos se sube un archivo.');
  if (bucket.tipo === 'faltante') {
    const lineas = String(req.body?.texto ?? req.body?.titulo ?? '')
      .split(/\r?\n/)
      .map((line) => line.trim().slice(0, 200))
      .filter(Boolean)
      .slice(0, 40);
    if (!lineas.length) throw httpError(400, 'Escribí al menos un faltante.');
    tx(() => {
      for (const titulo of lineas) {
        insertItem(carpeta.id, bucket.id, { titulo, cuerpo: '', estado: '', fecha: '' }, null, req.user.id);
      }
      touchClient(carpeta.client_id);
      const detalle = lineas.length === 1
        ? `anotó el faltante «${lineas[0]}» en Familia de ${carpeta.cliente_nombre}`
        : `anotó ${lineas.length} faltantes en Familia de ${carpeta.cliente_nombre}`;
      logActivity(req.user.id, 'faltante', detalle, carpeta.client_id);
    });
    res.status(201).json({ ok: true, cantidad: lineas.length });
    return;
  }
  const campos = leerCampos(req.body || {}, bucket);
  const itemId = tx(() => {
    const created = insertItem(carpeta.id, bucket.id, campos, null, req.user.id);
    touchClient(carpeta.client_id);
    logActivity(
      req.user.id,
      'documento',
      `cargó «${campos.titulo}» en ${areaById(carpeta.area).nombre} de ${carpeta.cliente_nombre}`,
      carpeta.client_id,
    );
    return created;
  });
  res.status(201).json({ id: itemId });
}));

app.post('/api/carpetas/:id/archivos', requireAuth, wrap(async (req, res) => {
  const carpeta = carpetaDe(req.params.id);
  if (!carpeta) throw httpError(404, 'No se encontró la carpeta.');
  const parsed = await parseMultipart(req);
  const bucket = bucketById(carpeta.area, str(parsed.fields.bucket, 40));
  if (!bucket || bucket.tipo !== 'archivo') throw httpError(400, 'Esa sección no recibe archivos.');
  const file = parsed.files[0];
  if (!file) throw httpError(400, 'Elegí un archivo o sacá una foto.');
  const saved = saveUpload(file);
  const titulo = str(parsed.fields.titulo, 200) || path.parse(saved.archivo_nombre).name || 'Documento';
  try {
    tx(() => {
      insertItem(carpeta.id, bucket.id, { titulo, cuerpo: '', estado: '', fecha: '' }, saved, req.user.id);
      touchClient(carpeta.client_id);
      logActivity(
        req.user.id,
        'documento',
        `subió «${titulo}» a ${areaById(carpeta.area).nombre} de ${carpeta.cliente_nombre}`,
        carpeta.client_id,
      );
    });
  } catch (error) {
    removeFileIfOrphan(saved.archivo_path);
    throw error;
  }
  res.status(201).json({ ok: true });
}));

app.patch('/api/items/:id', requireAuth, wrap((req, res) => {
  const item = db.prepare(`
    SELECT i.*, k.area, k.client_id, c.nombre AS cliente_nombre
    FROM items i
    JOIN carpetas k ON k.id = i.carpeta_id
    JOIN clients c ON c.id = k.client_id
    WHERE i.id = ?
  `).get(req.params.id);
  if (!item) throw httpError(404, 'No se encontró.');
  const bucket = bucketById(item.area, item.bucket);
  const titulo = required(req.body?.titulo ?? item.titulo, 'el título', 200);
  const cuerpo = req.body?.cuerpo != null ? str(req.body.cuerpo, 5000) : item.cuerpo;
  const fecha = req.body?.fecha != null ? cleanFecha(req.body.fecha, 'La fecha') : item.fecha;
  let estado = req.body?.estado != null ? str(req.body.estado, 40) : item.estado;
  if (bucket?.estados?.length) {
    if (!estado) estado = bucket.estados[0].id;
    if (!bucket.estados.some((entry) => entry.id === estado)) throw httpError(400, 'El estado no es válido.');
  }
  db.prepare(
    'UPDATE items SET titulo = ?, cuerpo = ?, estado = ?, fecha = ?, updated_at = ? WHERE id = ?',
  ).run(titulo, cuerpo || '', estado || '', fecha || '', nowISO(), item.id);
  res.json({ ok: true });
}));

app.delete('/api/items/:id', requireAuth, wrap((req, res) => {
  const row = db.prepare(`
    SELECT i.*, k.client_id, k.area, c.nombre AS cliente_nombre
    FROM items i
    JOIN carpetas k ON k.id = i.carpeta_id
    JOIN clients c ON c.id = k.client_id
    WHERE i.id = ?
  `).get(req.params.id);
  if (!row) throw httpError(404, 'No se encontró.');
  tx(() => {
    db.prepare('DELETE FROM items WHERE id = ?').run(row.id);
    touchClient(row.client_id);
  });
  removeFileIfOrphan(row.archivo_path);
  res.json({ ok: true });
}));

app.post('/api/items/:id/completar', requireAuth, wrap(async (req, res) => {
  const parsed = await parseMultipart(req);
  const file = parsed.files[0];
  if (!file) throw httpError(400, 'Sacá la foto o elegí un archivo.');
  const saved = saveUpload(file);
  try {
    tx(() => {
      const item = db.prepare(`
        SELECT i.*, k.area, k.client_id, k.id AS carpeta_id, c.nombre AS cliente_nombre
        FROM items i
        JOIN carpetas k ON k.id = i.carpeta_id
        JOIN clients c ON c.id = k.client_id
        WHERE i.id = ?
      `).get(req.params.id);
      if (!item || item.bucket !== 'faltante') throw httpError(404, 'Ese faltante ya no está en la lista.');
      const bucket = bucketById(item.area, 'documentos');
      if (!bucket) throw httpError(400, 'Esta área no tiene documentos.');
      insertItem(
        item.carpeta_id,
        'documentos',
        { titulo: item.titulo, cuerpo: '', estado: '', fecha: '' },
        saved,
        req.user.id,
        item.id,
      );
      const deleted = db.prepare("DELETE FROM items WHERE id = ? AND bucket = 'faltante'").run(item.id);
      if (!deleted.changes) throw httpError(409, 'Ese faltante ya se cargó.');
      touchClient(item.client_id);
      logActivity(
        req.user.id,
        'faltante',
        `pasó «${item.titulo}» de Faltante a Documentos de ${item.cliente_nombre}`,
        item.client_id,
      );
    });
  } catch (error) {
    removeFileIfOrphan(saved.archivo_path);
    throw error;
  }
  res.json({ ok: true });
}));

app.post('/api/items/:id/presentar', requireAuth, wrap((req, res) => {
  const item = db.prepare(`
    SELECT i.*, k.area, k.client_id, k.id AS carpeta_real, c.nombre AS cliente_nombre
    FROM items i
    JOIN carpetas k ON k.id = i.carpeta_id
    JOIN clients c ON c.id = k.client_id
    WHERE i.id = ?
  `).get(req.params.id);
  if (!item || item.bucket !== 'documentos' || item.area !== 'familia') {
    throw httpError(400, 'Solo un documento de Familia se puede pasar a Presentado.');
  }
  const ya = db.prepare(
    "SELECT id FROM items WHERE origen_item_id = ? AND bucket = 'presentado'",
  ).get(item.id);
  if (ya) throw httpError(409, 'Ese documento ya está en Presentado.');
  const bucket = bucketById('familia', 'presentado');
  const campos = leerCampos({
    titulo: item.titulo,
    cuerpo: req.body?.cuerpo || '',
    fecha: req.body?.fecha || todayAR(),
    estado: req.body?.estado || 'presentado',
  }, bucket);
  const archivo = item.archivo_path ? {
    archivo_nombre: item.archivo_nombre,
    archivo_mime: item.archivo_mime,
    archivo_path: item.archivo_path,
    archivo_tamano: item.archivo_tamano,
  } : null;
  tx(() => {
    insertItem(item.carpeta_id, 'presentado', campos, archivo, req.user.id, item.id);
    touchClient(item.client_id);
    logActivity(
      req.user.id,
      'documento',
      `registró «${item.titulo}» como presentado de ${item.cliente_nombre}`,
      item.client_id,
    );
  });
  res.status(201).json({ ok: true });
}));

app.post('/api/items/:id/archivo', requireAuth, wrap(async (req, res) => {
  const item = db.prepare('SELECT * FROM items WHERE id = ?').get(req.params.id);
  if (!item) throw httpError(404, 'No se encontró.');
  const parsed = await parseMultipart(req);
  const file = parsed.files[0];
  if (!file) throw httpError(400, 'Elegí un archivo.');
  const saved = saveUpload(file);
  const previous = item.archivo_path;
  try {
    db.prepare(`
      UPDATE items
      SET tipo = 'archivo', archivo_nombre = ?, archivo_mime = ?, archivo_path = ?, archivo_tamano = ?, updated_at = ?
      WHERE id = ?
    `).run(saved.archivo_nombre, saved.archivo_mime, saved.archivo_path, saved.archivo_tamano, nowISO(), item.id);
  } catch (error) {
    removeFileIfOrphan(saved.archivo_path);
    throw error;
  }
  removeFileIfOrphan(previous);
  res.json({ ok: true });
}));

app.get('/api/archivos/:id', requireAuth, wrap((req, res) => {
  const item = db.prepare('SELECT * FROM items WHERE id = ?').get(req.params.id);
  if (!item?.archivo_path) throw httpError(404, 'No se encontró el archivo.');
  const base = path.basename(item.archivo_path);
  const full = path.join(uploadDir, base);
  if (path.dirname(full) !== uploadDir || !fs.existsSync(full)) throw httpError(404, 'No se encontró el archivo.');
  res.setHeader('Content-Type', item.archivo_mime || 'application/octet-stream');
  res.setHeader('Content-Disposition', contentDisposition(item.archivo_nombre || base, req.query.descargar === '1'));
  res.setHeader('Cache-Control', 'private, max-age=86400');
  const stream = fs.createReadStream(full);
  stream.on('error', () => {
    if (!res.headersSent) res.status(404).end();
    else res.destroy();
  });
  stream.pipe(res);
}));

app.post('/api/pizarra', requireAuth, wrap((req, res) => {
  const texto = required(req.body?.texto, 'el mensaje', 800);
  const noteId = id();
  const now = nowISO();
  db.prepare('INSERT INTO pizarra (id, user_id, texto, created_at) VALUES (?, ?, ?, ?)').run(noteId, req.user.id, texto, now);
  res.status(201).json({
    nota: { id: noteId, texto, createdAt: now, userId: req.user.id, usuario: req.user.nombre },
  });
}));

app.delete('/api/pizarra/:id', requireAuth, wrap((req, res) => {
  const row = db.prepare('SELECT * FROM pizarra WHERE id = ?').get(req.params.id);
  if (!row) throw httpError(404, 'No se encontró la nota.');
  if (row.user_id !== req.user.id && req.user.rol !== 'superadmin') {
    throw httpError(403, 'Solo quien la escribió, o la administración, puede borrarla.');
  }
  db.prepare('DELETE FROM pizarra WHERE id = ?').run(row.id);
  res.json({ ok: true });
}));

app.get('/api/users', requireAuth, requireSuper, wrap((_req, res) => {
  const users = db.prepare(
    'SELECT id, nombre, username, rol, activo, created_at FROM users ORDER BY created_at ASC',
  ).all().map(publicUser);
  res.json({ users });
}));

app.post('/api/users', requireAuth, requireSuper, wrap((req, res) => {
  const nombre = required(req.body?.nombre, 'el nombre', 120).replace(/\s+/g, ' ');
  const username = required(req.body?.username, 'el usuario', 40).replace(/\s+/g, '');
  const password = String(req.body?.password || '');
  if (password.length < 6) throw httpError(400, 'La clave necesita al menos 6 caracteres.');
  const rol = str(req.body?.rol || 'operador', 20);
  if (!ROLES.some((item) => item.id === rol)) throw httpError(400, 'El rol no es válido.');
  const userId = id();
  try {
    db.prepare(
      'INSERT INTO users (id, nombre, username, password_hash, rol, activo, created_at) VALUES (?, ?, ?, ?, ?, 1, ?)',
    ).run(userId, nombre, username, hashPassword(password), rol, nowISO());
  } catch (error) {
    if (String(error.message).includes('UNIQUE')) throw httpError(409, 'Ese usuario ya existe.');
    throw error;
  }
  logActivity(req.user.id, 'equipo', `creó la cuenta de ${nombre}`, null);
  const user = db.prepare('SELECT id, nombre, username, rol, activo, created_at FROM users WHERE id = ?').get(userId);
  res.status(201).json({ user: publicUser(user) });
}));

app.patch('/api/users/:id', requireAuth, requireSuper, wrap((req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!user) throw httpError(404, 'No se encontró la cuenta.');
  const nombre = req.body?.nombre != null ? required(req.body.nombre, 'el nombre', 120).replace(/\s+/g, ' ') : user.nombre;
  const rol = req.body?.rol != null ? str(req.body.rol, 20) : user.rol;
  if (!ROLES.some((item) => item.id === rol)) throw httpError(400, 'El rol no es válido.');
  const activo = req.body?.activo != null ? (req.body.activo ? 1 : 0) : user.activo;
  if (user.id === req.user.id && !activo) throw httpError(400, 'No podés desactivar tu propia cuenta.');
  const leavesAdmin = user.rol === 'superadmin' && user.activo && (rol !== 'superadmin' || !activo);
  if (leavesAdmin && activeAdmins(user.id) === 0) {
    throw httpError(400, 'Tiene que quedar al menos una administración activa.');
  }
  const password = String(req.body?.password || '');
  if (req.body?.password && password.length < 6) throw httpError(400, 'La clave necesita al menos 6 caracteres.');
  db.prepare('UPDATE users SET nombre = ?, rol = ?, activo = ? WHERE id = ?').run(nombre, rol, activo, user.id);
  if (password) db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(password), user.id);
  if (!activo || password) db.prepare('DELETE FROM sessions WHERE user_id = ? AND token != ?').run(user.id, readCookie(req, 'sid'));
  if (!activo) db.prepare('DELETE FROM sessions WHERE user_id = ?').run(user.id);
  const fresh = db.prepare('SELECT id, nombre, username, rol, activo, created_at FROM users WHERE id = ?').get(user.id);
  res.json({ user: publicUser(fresh) });
}));

app.delete('/api/users/:id', requireAuth, requireSuper, wrap((req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!user) throw httpError(404, 'No se encontró la cuenta.');
  if (user.id === req.user.id) throw httpError(400, 'No podés eliminar tu propia cuenta.');
  if (user.rol === 'superadmin' && user.activo && activeAdmins(user.id) === 0) {
    throw httpError(400, 'Tiene que quedar al menos una administración activa.');
  }
  db.prepare('DELETE FROM users WHERE id = ?').run(user.id);
  logActivity(req.user.id, 'equipo', `eliminó la cuenta de ${user.nombre}`, null);
  res.json({ ok: true });
}));

app.post('/api/cuenta/clave', requireAuth, wrap((req, res) => {
  const actual = String(req.body?.actual || '');
  const nueva = String(req.body?.nueva || '');
  if (nueva.length < 6) throw httpError(400, 'La clave nueva necesita al menos 6 caracteres.');
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!verifyPassword(actual, user.password_hash)) throw httpError(400, 'La clave actual no coincide.');
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(nueva), user.id);
  res.json({ ok: true });
}));

app.patch('/api/settings', requireAuth, requireSuper, wrap((req, res) => {
  const next = {
    estudio_nombre: required(req.body?.estudioNombre, 'el nombre del estudio', 120),
    titular: required(req.body?.titular, 'el nombre de la titular', 120),
    matricula: str(req.body?.matricula, 60),
    colegio: str(req.body?.colegio, 120),
    telefono: str(req.body?.telefono, 40),
    email: cleanEmail(req.body?.email),
    cuit: str(req.body?.cuit, 20),
    direccion: str(req.body?.direccion, 200),
    localidad: str(req.body?.localidad, 80),
    pie: str(req.body?.pie, 240),
  };
  const put = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
  tx(() => {
    for (const [key, value] of Object.entries(next)) put.run(key, value);
  });
  res.json({ settings: getSettings() });
}));

app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'No existe ese recurso.' });
});

app.use(express.static(publicDir, {
  etag: true,
  setHeaders(res, filePath) {
    if (/\.(html|js|css)$/.test(filePath)) res.setHeader('Cache-Control', 'no-cache');
  },
}));

app.use((error, _req, res, _next) => {
  const status = error.status || 500;
  if (status >= 500) console.error(error);
  if (res.headersSent) return;
  res.status(status).json({ error: status >= 500 ? 'Error interno. Probá de nuevo.' : error.message });
});

const server = app.listen(PORT, '127.0.0.1', () => {
  console.log(`Agenda escuchando en http://127.0.0.1:${PORT}`);
});

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`El puerto ${PORT} ya está en uso.`);
  } else {
    console.error(error);
  }
  process.exit(1);
});

