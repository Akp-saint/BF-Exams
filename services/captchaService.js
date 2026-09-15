/**
 * ==============================================================================
 * PORTAIL NATIONAL DES RÉSULTATS D'EXAMENS DU BURKINA FASO
 * SERVICE DE PROTECTION ANTI-ROBOT / CAPTCHA (services/captchaService.js)
 * ==============================================================================
 * 
 * Ce service génère et vérifie des défis Captcha arithmétiques légers et sécurisés.
 * 
 * AVANTAGES CLÉS :
 * ----------------
 * 1. 100% Autonome : Aucun besoin de clé API externe (Google reCAPTCHA / Cloudflare Turnstile).
 *    Fonctionne parfaitement hors-ligne, en réseau local et sur serveur national souverain.
 * 2. Sans état (Stateless) : La solution attendue est hachée par HMAC-SHA256 avec le
 *    secret de l'application (`CSRF_SECRET`) et un horodatage d'expiration (5 minutes).
 *    Aucune mémoire serveur n'est gaspillée, résistant aux fortes charges.
 * 3. Accessibilité : Simple pour un candidat humain (ex: "4 + 3 = ?"), bloquant pour les
 *    scripts de moissonnage automatisé (web scraping massif).
 * 
 * GUIDE POUR TOUTE IA OU DÉVELOPPEUR REPRENANT LE PROJET :
 * --------------------------------------------------------
 * - Pour changer la difficulté, ajuster les bornes aléatoires dans `generateCaptcha()`.
 * - `verifyCaptcha(userAnswer, captchaToken, secret)` retourne un booléen (true/false).
 * ==============================================================================
 */

const crypto = require('crypto');

/**
 * Génère un défi Captcha arithmétique et son jeton de validation signé
 * 
 * @param {string} secret - Clé secrète de signature (CSRF_SECRET de l'application)
 * @returns {{ question: string, token: string }}
 */
function generateCaptcha(secret) {
  const num1 = Math.floor(Math.random() * 9) + 1; // 1 à 9
  const num2 = Math.floor(Math.random() * 9) + 1; // 1 à 9
  const answer = String(num1 + num2);
  const expiresAt = Date.now() + 5 * 60 * 1000; // Valide 5 minutes

  // Construction de la signature HMAC : answer:expiresAt:signature
  const payload = `${answer}:${expiresAt}`;
  const signature = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  const token = Buffer.from(`${payload}:${signature}`).toString('base64');

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
  if (!userAnswer || !token || !secret) return false;

  try {
    const decoded = Buffer.from(token, 'base64').toString('utf8');
    const [expectedAnswer, expiresAtStr, signature] = decoded.split(':');

    if (!expectedAnswer || !expiresAtStr || !signature) return false;

    // Vérification de l'expiration
    const expiresAt = Number(expiresAtStr);
    if (Date.now() > expiresAt) {
      return false; // Captcha expiré
    }

    // Vérification de la signature cryptographique
    const payload = `${expectedAnswer}:${expiresAtStr}`;
    const expectedSignature = crypto.createHmac('sha256', secret).update(payload).digest('hex');

    if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) {
      return false; // Signature invalide (tentative de falsification)
    }

    // Vérification de la réponse
    const cleanUserAnswer = String(userAnswer).trim();
    return cleanUserAnswer === expectedAnswer;
  } catch (err) {
    return false;
  }
}

module.exports = {
  generateCaptcha,
  verifyCaptcha
};
