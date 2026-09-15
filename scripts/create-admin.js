const db = require('../db');

const required = ['ADMIN_USERNAME', 'ADMIN_EMAIL', 'ADMIN_PASSWORD', 'ADMIN_FULL_NAME'];
const missing = required.filter((key) => !process.env[key]);
if (missing.length) {
  console.error(`Variables manquantes: ${missing.join(', ')}`);
  process.exit(1);
}

db.createAdminUser({
  username: process.env.ADMIN_USERNAME,
  email: process.env.ADMIN_EMAIL,
  password: process.env.ADMIN_PASSWORD,
  full_name: process.env.ADMIN_FULL_NAME,
  role: process.env.ADMIN_ROLE || 'superadmin'
}).then((user) => {
  console.log(`Compte ${user.username} (${user.role}) créé ou mis à jour.`);
  if (db.pool && db.pool.end) return db.pool.end();
}).catch((error) => {
  console.error('Impossible de créer le compte:', error.message);
  process.exitCode = 1;
});
