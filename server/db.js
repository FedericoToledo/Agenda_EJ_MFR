import fs from 'node:fs';
import path from 'node:path';
import { randomBytes, randomInt, scryptSync, timingSafeEqual } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { AREAS } from './areas.js';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const dataDir = path.join(rootDir, 'data');
export const uploadDir = path.join(dataDir, 'uploads');

fs.mkdirSync(uploadDir, { recursive: true });

export const db = new DatabaseSync(path.join(dataDir, 'agenda.db'));
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');
db.exec('PRAGMA busy_timeout = 4000');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  nombre TEXT NOT NULL,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  rol TEXT NOT NULL CHECK (rol IN ('superadmin', 'operador')),
  activo INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS clients (
  id TEXT PRIMARY KEY,
  nombre TEXT NOT NULL,
  nombre_busqueda TEXT NOT NULL,
  dni TEXT NOT NULL DEFAULT '',
  dni_busqueda TEXT NOT NULL DEFAULT '',
  telefono TEXT NOT NULL DEFAULT '',
  telefono_busqueda TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  domicilio TEXT NOT NULL DEFAULT '',
  notas TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS turnos (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  fecha TEXT NOT NULL,
  hora TEXT NOT NULL,
  motivo TEXT NOT NULL,
  notas TEXT NOT NULL DEFAULT '',
  estado TEXT NOT NULL CHECK (estado IN ('pendiente', 'confirmado', 'atendido', 'cancelado')),
  asignado_a TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS carpetas (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  area TEXT NOT NULL,
  titulo TEXT NOT NULL,
  notas TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS items (
  id TEXT PRIMARY KEY,
  carpeta_id TEXT NOT NULL REFERENCES carpetas(id) ON DELETE CASCADE,
  bucket TEXT NOT NULL,
  tipo TEXT NOT NULL,
  titulo TEXT NOT NULL,
  cuerpo TEXT NOT NULL DEFAULT '',
  estado TEXT NOT NULL DEFAULT '',
  fecha TEXT NOT NULL DEFAULT '',
  archivo_nombre TEXT,
  archivo_mime TEXT,
  archivo_path TEXT,
  archivo_tamano INTEGER,
  origen_item_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS comentarios (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  texto TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS pizarra (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  texto TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS activity (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  accion TEXT NOT NULL,
  detalle TEXT NOT NULL,
  client_id TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_clients_busca ON clients(nombre_busqueda);
CREATE INDEX IF NOT EXISTS idx_turnos_fecha ON turnos(fecha, hora);
CREATE INDEX IF NOT EXISTS idx_carpetas_client ON carpetas(client_id, area);
CREATE INDEX IF NOT EXISTS idx_items_carpeta ON items(carpeta_id, bucket);
CREATE INDEX IF NOT EXISTS idx_activity_fecha ON activity(created_at);
`);

export function id() {
  return cryptoRandom();
}

function cryptoRandom() {
  return randomBytes(16).toString('hex');
}

export function nowISO() {
  return new Date().toISOString();
}

export function todayAR(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires',
  }).format(date);
}

export function fold(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .trim();
}

export function digits(value) {
  return String(value || '').replace(/\D/g, '');
}

export function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 32).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password, stored) {
  const [salt, hash] = String(stored || '').split(':');
  if (!salt || !hash) return false;
  const expected = Buffer.from(hash, 'hex');
  const actual = scryptSync(password, salt, expected.length);
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}

export function logActivity(userId, accion, detalle, clientId = null) {
  db.prepare(
    'INSERT INTO activity (id, user_id, accion, detalle, client_id, created_at) VALUES (?, ?, ?, ?, ?, ?)',
  ).run(id(), userId || null, accion, detalle, clientId, nowISO());
}

export function touchClient(clientId) {
  db.prepare('UPDATE clients SET updated_at = ? WHERE id = ?').run(nowISO(), clientId);
}

export function tx(fn) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    try {
      db.exec('ROLLBACK');
    } catch {
      /* already closed */
    }
    throw error;
  }
}

function readablePassword() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let raw = '';
  for (let i = 0; i < 12; i += 1) raw += alphabet[randomInt(alphabet.length)];
  return `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}`;
}

function seed() {
  const defaults = {
    estudio_nombre: 'Estudio Jurídico Reverter',
    titular: 'María Florencia Reverter',
    matricula: '',
    colegio: '',
    telefono: '',
    email: '',
    cuit: '',
    direccion: '',
    localidad: '',
    pie: '',
  };
  const put = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
  for (const [key, value] of Object.entries(defaults)) put.run(key, value);

  const count = db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
  if (count > 0) return;

  const password = readablePassword();
  const userId = id();
  db.prepare(
    'INSERT INTO users (id, nombre, username, password_hash, rol, activo, created_at) VALUES (?, ?, ?, ?, ?, 1, ?)',
  ).run(
    userId,
    'María Florencia Reverter',
    'maria',
    hashPassword(password),
    'superadmin',
    nowISO(),
  );
  const note = [
    'Agenda del Estudio Jurídico Reverter',
    '',
    'Usuario: maria',
    `Clave: ${password}`,
    '',
    'Esta es la cuenta de administración de María Florencia Reverter.',
    'Conviene cambiar la clave desde Ajustes > Mi clave.',
    'El archivo queda solo en esta computadora.',
  ].join('\r\n');
  fs.writeFileSync(path.join(dataDir, 'CLAVE-INICIAL.txt'), note, 'utf8');
  console.log(`Cuenta inicial lista. Usuario: maria  Clave: ${password}`);
}

seed();

export function getSettings() {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const map = Object.fromEntries(rows.map((row) => [row.key, row.value]));
  return {
    estudioNombre: map.estudio_nombre || 'Estudio Jurídico Reverter',
    titular: map.titular || 'María Florencia Reverter',
    matricula: map.matricula || '',
    colegio: map.colegio || '',
    telefono: map.telefono || '',
    email: map.email || '',
    cuit: map.cuit || '',
    direccion: map.direccion || '',
    localidad: map.localidad || '',
    pie: map.pie || '',
  };
}

export function branding() {
  const settings = getSettings();
  return { estudioNombre: settings.estudioNombre, titular: settings.titular };
}

export function ensureArea(clientId, areaId, userId) {
  const area = AREAS.find((item) => item.id === areaId);
  if (!area) return null;
  const existing = db.prepare(
    'SELECT id FROM carpetas WHERE client_id = ? AND area = ? ORDER BY created_at ASC LIMIT 1',
  ).get(clientId, areaId);
  if (existing) return existing.id;
  const carpetaId = id();
  db.prepare(
    'INSERT INTO carpetas (id, client_id, area, titulo, notas, created_at, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)',
  ).run(carpetaId, clientId, areaId, 'General', '', nowISO(), userId);
  return carpetaId;
}

export function removeFileIfOrphan(storedName) {
  if (!storedName) return;
  const base = path.basename(storedName);
  const count = db.prepare('SELECT COUNT(*) AS n FROM items WHERE archivo_path = ?').get(base).n;
  if (count === 0) fs.rmSync(path.join(uploadDir, base), { force: true });
}
