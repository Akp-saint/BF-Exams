/* PostgreSQL is the only application database. Tests use isolated fixtures. */
if (process.env.NODE_ENV === 'test') {
  module.exports = require('./db-fixtures');
} else {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL est obligatoire : PostgreSQL est la seule base supportée.');
  }
  module.exports = require('./db-postgres');
}
