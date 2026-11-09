/**
 * ==============================================================================
 * PORTAIL NATIONAL DES RÉSULTATS D'EXAMENS DU BURKINA FASO
 * SERVICE DE DÉFI ARITHMÉTIQUE (services/captchaService.js)
 * ==============================================================================
 * 
 * Ce service génère et vérifie des défis arithmétiques légers pour la démonstration.
 * 
 * AVANTAGES CLÉS :
 * ----------------
 * 1. 100% Autonome : Aucun besoin de clé API externe (Google reCAPTCHA / Cloudflare Turnstile).
 *    Fonctionne parfaitement hors-ligne, en réseau local et sur serveur national souverain.
 * 2. Le contenu de validation est chiffré avec AES-256-GCM et expire après cinq minutes.
 * 3. Ce défi simple n'est pas une protection anti-bot suffisante pour une production.
 * 
 * VALIDATION DU CAPTCHA :
 * ----------------------
 * - Pour changer la difficulté, ajuster les bornes aléatoires dans `generateCaptcha()`.
 * - `verifyCaptcha(userAnswer, captchaToken, secret)` retourne un booléen (true/false).
 * ==============================================================================
 */

const crypto = require('crypto');
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

function getEncryptionKey(secret) {
  return crypto.createHash('sha256').update('exam-bf-captcha-v1\0').update(secret).digest();
}

/**
 * Génère un défi Captcha arithmétique et son jeton de validation signé
 * 
 * @param {string} secret - Clé secrète de signature (CSRF_SECRET de l'application)
 * @returns {{ question: string, token: string }}
 */
function generateCaptcha(secret) {
  const num1 = crypto.randomInt(1, 10);
  const num2 = crypto.randomInt(1, 10);
  const answer = String(num1 + num2);
  const expiresAt = Date.now() + 5 * 60 * 1000; // Valide 5 minutes

  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv('aes-256-gcm', getEncryptionKey(secret), iv);
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify({ answer, expiresAt }), 'utf8'),
    cipher.final()
  ]);
  const token = Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString('base64url');

  return {
    question: `${num1} + ${num2} = ?`,
    token
  };
}

/**
 * Vérifie la réponse fournie par l'utilisateur
 * 
 * @param {string} userAnswer - Réponse soumise par le formulaire
 * @param {string} token - Jeton base64 reçu du formulaire
 * @param {string} secret - Clé secrète de signature
 * @returns {boolean} - Vrai si la réponse est valide et non expirée
 */
function verifyCaptcha(userAnswer, token, secret) {
  if (!userAnswer || typeof token !== 'string' || token.length > 256 || !secret) return false;

  try {
    if (!/^[A-Za-z0-9_-]+$/.test(token)) return false;
    const encoded = Buffer.from(token, 'base64url');
    if (encoded.length <= IV_LENGTH + TAG_LENGTH) return false;

    const iv = encoded.subarray(0, IV_LENGTH);
    const authTag = encoded.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
    const ciphertext = encoded.subarray(IV_LENGTH + TAG_LENGTH);
    const decipher = crypto.createDecipheriv('aes-256-gcm', getEncryptionKey(secret), iv);
    decipher.setAuthTag(authTag);
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
    const payload = JSON.parse(plaintext);
    if (typeof payload.answer !== 'string' || !Number.isSafeInteger(payload.expiresAt)
      || Date.now() > payload.expiresAt) return false;

    const expected = Buffer.from(payload.answer);
    const submitted = Buffer.from(String(userAnswer).trim());
    return expected.length === submitted.length && crypto.timingSafeEqual(submitted, expected);
  } catch (err) {
    return false;
  }
}

module.exports = {
  generateCaptcha,
  verifyCaptcha
};
