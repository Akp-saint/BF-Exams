const db = require('../db');

db.migrate()
  .then(() => {
    console.log('Migrations terminées.');
    if (db.pool && db.pool.end) return db.pool.end();
  })
  .catch((error) => {
    console.error('Échec des migrations:', error);
    process.exitCode = 1;
  });
