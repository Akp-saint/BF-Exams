/**
 * ==============================================================================
 * PORTAIL NATIONAL DES RÉSULTATS D'EXAMENS DU BURKINA FASO
 * ROUTES DE L'API REST & SIMULATEUR SMS (routes/api.js)
 * ==============================================================================
 * 
 * Ce module expose :
 * 1. Une API REST JSON (`GET /api/v1/resultats`) permettant aux systèmes partenaires
 *    (universités, ministères, portails régionaux) d'interroger les résultats.
 * 2. Une passerelle Webhook SMS/USSD (`POST /api/v1/sms-webhook`) conforme aux
 *    spécifications des opérateurs de téléphonie mobile au Burkina Faso
 *    (Orange Burkina, Moov Africa, Telecel Faso).
 * 3. Une page de simulation SMS (`GET /simulateur-sms` et `POST /simulateur-sms`)
 *    pour tester visuellement la consultation sans smartphone connecté à Internet.
 * 
 * API PUBLIQUE DU PORTAIL :
 * ------------------------
 * - Pour intégrer un opérateur réel, brancher le webhook sur son endpoint API SMS.
 * - Format de syntaxe SMS supporté : "BAC BAC-2026-0837 22/09/2007" ou "BAC-2026-0837".
 * ==============================================================================
 */

const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const { findCandidate, findCandidateByPv, getStatistics } = require('../db');

/**
 * 1. Endpoint REST JSON : Consultation de résultat
 * GET /api/v1/resultats?exam=BAC&pv=BAC-2026-0837&dob=22/09/2007
 */
router.get('/resultats', async (req, res) => {
  res.set('Cache-Control', 'no-store');
  const { exam, pv, dob } = req.query;

  if (!exam || !pv) {
    return res.status(400).json({
      success: false,
      error: 'Paramètres manquants : exam et pv sont requis.'
    });
  }
  if (!dob) {
    return res.status(400).json({
      success: false,
      error: 'La date de naissance est requise pour protéger les données du candidat.'
    });
  }

  try {
    const candidate = await findCandidate(exam, pv, dob || null);
    if (!candidate) {
      return res.status(404).json({
        success: false,
        error: 'Aucun candidat trouvé pour ces références.'
      });
    }

    return res.json({
      success: true,
      data: {
        exam: candidate.exam,
        pv_number: candidate.pv_number,
        name: `${candidate.last_name} ${candidate.first_name}`,
        birth_date: candidate.birth_date,
        series: candidate.series,
        session_year: candidate.session_year,
        round: candidate.round,
        center: candidate.center,
        jury: candidate.jury,
        status: candidate.status,
        mention: candidate.mention,
        average: candidate.average,
        verification_code: candidate.verification_code,
        grades: candidate.grades
      }
    });
  } catch (err) {
    if (err.code === 'DATE_MISMATCH') {
      return res.status(403).json({
        success: false,
        error: 'Date de naissance incorrecte pour ce numéro de PV.'
      });
    }
    console.error('Erreur API resultats :', err);
    return res.status(500).json({ success: false, error: 'Erreur interne du serveur' });
  }
});

/**
 * 2. Endpoint REST JSON : Statistiques globales
 * GET /api/v1/statistiques
 */
router.get('/statistiques', async (req, res) => {
  try {
    const stats = await getStatistics();
    return res.json({ success: true, data: stats });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * 3. Webhook Télécoms : Traitement des requêtes SMS
 * POST /api/v1/sms-webhook
 * Payload attendu : { sender: "+22670000000", message: "BAC BAC-2026-0837 22/09/2007" }
 */
router.post('/sms-webhook', async (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    const expected = String(process.env.SMS_WEBHOOK_SECRET || '');
    const received = String(req.get('x-webhook-secret') || '');
    const valid = expected.length >= 32 && received.length === expected.length
      && crypto.timingSafeEqual(Buffer.from(received), Buffer.from(expected));
    if (!valid) return res.status(401).json({ success: false, error: 'Webhook non authentifié.' });
  }
  const { sender, message } = req.body;
  const rawText = String(message || '').trim();

  // Parsing des mots-clés du message SMS
  const parts = rawText.split(/\s+/);
  let exam = '';
  let pv = '';
  let dob = '';

  if (parts.length >= 3) {
    exam = parts[0];
    pv = parts[1];
    dob = parts[2];
  } else if (parts.length === 2) {
    exam = parts[0];
    pv = parts[1];
  }

  if (!pv || !dob) {
    return res.json({
      sender,
      response_sms: "Examens BF (démo) : Format incorrect. Envoyez : EXAMEN NUMERO_PV DATE_NAISSANCE."
    });
  }

  try {
    const candidate = await findCandidate(exam, pv, dob || null);
    if (!candidate) {
      return res.json({
        sender,
        response_sms: `Examens BF (démo) : Aucun exemple trouvé pour le PV ${pv} (${exam}).`
      });
    }

    const publicBaseUrl = String(process.env.PUBLIC_BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
    const shortSms = `Examens BF (démo) : Exemple fictif ${candidate.exam} ${candidate.last_name} ${candidate.first_name} (PV:${candidate.pv_number}), statut ${candidate.status}. Aucun résultat réel n'est certifié. ${publicBaseUrl}/verifier/${candidate.verification_code}`;

    return res.json({
      sender,
      response_sms: shortSms
    });
  } catch (err) {
    if (err.code === 'DATE_MISMATCH') {
      return res.json({
        sender,
        response_sms: `Examens BF (démo) : Date incorrecte pour le PV ${pv}.`
      });
    }
    return res.json({
      sender,
      response_sms: "Examens BF (démo) : Service momentanément indisponible. Réessayez plus tard."
    });
  }
});

module.exports = router;
