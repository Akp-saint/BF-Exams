const crypto = require('crypto');

function generateVerificationCode() {
  return `BF-${crypto.randomBytes(32).toString('hex').toUpperCase()}`;
}

module.exports = { generateVerificationCode };
