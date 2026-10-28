import { db, hashPassword } from './db.js';

const password = process.argv[2] || '';
if (password.length < 6) {
  console.error('Uso: npm run clave -- NuevaClave');
  process.exit(1);
}

const user = db.prepare(
  "SELECT id, username, nombre FROM users WHERE rol = 'superadmin' ORDER BY created_at ASC LIMIT 1",
).get();
if (!user) {
  console.error('No hay una cuenta de administración.');
  process.exit(1);
}

db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(password), user.id);
db.prepare('DELETE FROM sessions WHERE user_id = ?').run(user.id);
console.log(`Clave actualizada para ${user.nombre} (usuario ${user.username}).`);
