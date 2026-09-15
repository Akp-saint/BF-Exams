/**
 * ==============================================================================
 * PORTAIL NATIONAL DES RÉSULTATS D'EXAMENS DU BURKINA FASO
 * SUITE DE TESTS AUTOMATISÉS (test/app.test.js)
 * ==============================================================================
 * 
 * Cette suite valide l'intégralité des briques fonctionnelles et de sécurité :
 * 1. Métier & Base PostgreSQL/fixtures : Recherche, Séries BAC, 2nd Tour, Code QR, Statistiques.
 * 2. Protection CIL : Refus systématique en cas de date de naissance erronée.
 * 3. Captcha Anti-Robot : Génération stateless et vérification HMAC-SHA256.
 * 4. Générateur PDF : Format binaire %PDF, QR Code, notes et mentions.
 * 5. Back-Office DGEC : Authentification bcrypt et import massif CSV.
 * 6. Intégration HTTP : Route `/health`, API REST `/api/v1/resultats` et Webhook SMS.
 * 
 * GUIDE POUR TOUTE IA OU DÉVELOPPEUR REPRENANT LE PROJET :
 * --------------------------------------------------------
 * Exécution : `npm test` ou `node --test test/app.test.js`
 * ==============================================================================
 */

process.env.NODE_ENV = 'test';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const http = require('http');

const app = require('../app');
const db = require('../db');
const { generateCaptcha, verifyCaptcha } = require('../services/captchaService');
const { generateCandidatePdf } = require('../services/pdfService');

let server;
let baseUrl;

before(async () => {
  return new Promise((resolve) => {
    server = http.createServer(app);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      baseUrl = `http://127.0.0.1:${address.port}`;
      resolve();
    });
  });
});

after(async () => {
  return new Promise((resolve) => {
    if (server) {
      server.close(() => resolve());
    } else {
      resolve();
    }
  });
});

// Helper pour effectuer des requêtes HTTP de test
function makeRequest(path, options = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, baseUrl);
    const req = http.request(url, options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body
        });
      });
    });
    req.on('error', reject);
    if (options.body) {
      req.write(options.body);
    }
    req.end();
  });
}

describe('1. Tests Métier et Base de données (db.js)', () => {

  it('Recherche candidat BAC avec date de naissance exacte (Salimata TRAORÉ - Série D)', async () => {
    const candidate = await db.findCandidate('BAC', 'BAC-2026-0837', '22/09/2007');
    assert.ok(candidate, 'Le candidat doit être trouvé');
    assert.strictEqual(candidate.first_name, 'Salimata');
    assert.strictEqual(candidate.last_name, 'TRAORÉ');
    assert.strictEqual(candidate.series, 'D (Scientifique)');
    assert.strictEqual(candidate.status, 'Admis');
    assert.strictEqual(candidate.mention, 'Bien');
    assert.ok(Array.isArray(candidate.grades), 'Les notes doivent être chargées');
    assert.ok(candidate.grades.length >= 6, 'Doit comporter les matières du BAC D');
  });

  it('Sécurité CIL : Rejet si la date de naissance ne concorde pas', async () => {
    await assert.rejects(
      async () => {
        await db.findCandidate('BAC', 'BAC-2026-0837', '01/01/2000');
      },
      (err) => {
        assert.strictEqual(err.code, 'DATE_MISMATCH');
        return true;
      },
      'Doit lever une exception DATE_MISMATCH'
    );
  });

  it('Gestion des tours : Candidat admissible au 2nd tour (Ousmane SAWADOGO - Série A4)', async () => {
    const candidate = await db.findCandidate('BAC', 'BAC-2026-0412', '14/04/2007');
    assert.ok(candidate);
    assert.strictEqual(candidate.series, 'A4 (Littéraire)');
    assert.strictEqual(candidate.status, 'Admissible');
    assert.strictEqual(candidate.round, '1er tour');
  });

  it('Vérification d’authenticité par QR Code (verifyCandidateByCode)', async () => {
    const verified = await db.verifyCandidateByCode('BF-2026-BAC-0837-7D9A');
    assert.ok(verified, 'Le code officiel doit certifier le document');
    assert.strictEqual(verified.pv_number, 'BAC-2026-0837');
    assert.strictEqual(verified.verification_code, 'BF-2026-BAC-0837-7D9A');
  });

  it('Vérification code inexistant ou falsifié', async () => {
    const fake = await db.verifyCandidateByCode('CODE-FALSIFIE-9999');
    assert.strictEqual(fake, null, 'Un faux code ne doit rien retourner');
  });

  it('Calcul des statistiques globales et par série', async () => {
    const stats = await db.getStatistics();
    assert.ok(stats.global.total >= 8, 'Doit comptabiliser tous les candidats');
    assert.ok(stats.global.successRate > 0, 'Le taux de réussite doit être calculé');
    assert.ok(Array.isArray(stats.byExam), 'Stats par examen');
    assert.ok(Array.isArray(stats.bySeries), 'Stats par série BAC');
    assert.ok(stats.bySeries.some(s => s.series.includes('D')), 'Série D présente');
    assert.ok(stats.bySeries.some(s => s.series.includes('A4')), 'Série A4 présente');
  });

  it('Authentification administrateur DGEC avec bcrypt', async () => {
    await db.createAdminUser({
      username: 'test-admin',
      email: 'test-admin@example.test',
      password: 'mot-de-passe-test-2026',
      full_name: 'Administrateur de test',
      role: 'superadmin'
    });
    const user = await db.authenticateUser('test-admin@example.test', 'mot-de-passe-test-2026');
    assert.ok(user, 'Connexion valide pour l’administrateur');
    assert.strictEqual(user.role, 'superadmin');

    const wrongPass = await db.authenticateUser('test-admin@example.test', 'MauvaisMotDePasse');
    assert.strictEqual(wrongPass, null, 'Le mauvais mot de passe doit être refusé');
  });

  it('Création et suivi d’une réclamation', async () => {
    const claim = await db.createClaim({
      exam: 'BAC',
      pv_number: 'BAC-2026-0837',
      candidate_name: 'Salimata TRAORÉ',
      claim_type: 'Erreur état civil',
      description: 'Orthographe du nom à rectifier',
      phone: '+226 70 11 22 33',
      email: 'salimata@test.bf'
    });
    assert.ok(claim.claimNumber.startsWith('REC-2026-'), 'Numéro de dossier attribué');

    const fetched = await db.getClaimByNumber(claim.claimNumber);
    assert.ok(fetched, 'Dossier retrouvé');
    assert.strictEqual(fetched.status, 'En attente');
  });

  it('Import massif par lot (importCandidatesBatch)', async () => {
    const testBatch = [
      {
        exam: 'BAC',
        pv_number: 'BAC-2026-9001',
        first_name: 'Testeur',
        last_name: 'AUTOMATISÉ',
        birth_date: '01/01/2006',
        birth_place: 'Ouaga',
        gender: 'Masculin',
        center: 'Centre Test',
        jury: 'Jury Test',
        series: 'D (Scientifique)',
        round: '1er tour',
        status: 'Admis',
        mention: 'Assez Bien',
        average: 12.50,
        grades: [
          { subject: 'Français', score: 12, coefficient: 3 },
          { subject: 'Mathématiques', score: 13, coefficient: 5 }
        ]
      }
    ];

    const report = await db.importCandidatesBatch(testBatch);
    assert.strictEqual(report.inserted, 1);
    assert.strictEqual(report.errors.length, 0);

    const importedCand = await db.findCandidate('BAC', 'BAC-2026-9001', '01/01/2006');
    assert.ok(importedCand, 'Le candidat importé par lot doit être interrogeable');
    assert.strictEqual(importedCand.grades.length, 2);
  });

  it('Inscription candidat et paiement simulé isolés par compte', async () => {
    const account = await db.createCandidateAccount({ phone: '+22670009901', password: 'motdepasse-test', full_name: 'Candidat Test' });
    const otherAccount = await db.createCandidateAccount({ phone: '+22670009902', password: 'motdepasse-test', full_name: 'Autre Test' });
    assert.ok(await db.authenticateCandidate('+22670009901', 'motdepasse-test'));
    const registration = await db.createRegistration(account.id, {
      exam: 'BAC', session_year: 2026, first_name: 'Candidat', last_name: 'TEST',
      birth_date: '01/01/2007', birth_place: 'Ouagadougou', gender: 'Masculin',
      region: 'Centre', province: 'Kadiogo', center: 'Centre Test', series: 'D'
    });
    await assert.rejects(() => db.createSimulatedPayment(otherAccount.id, registration.id, 'Orange Money'), /Dossier introuvable/);
    const payment = await db.createSimulatedPayment(account.id, registration.id, 'Orange Money');
    assert.strictEqual(payment.status, 'Payé');
    assert.strictEqual((await db.listRegistrations(account.id))[0].status, 'Payé');
  });

  it('Pièce justificative rattachée uniquement au dossier propriétaire', async () => {
    const account = await db.createCandidateAccount({ phone: '+22670009903', password: 'motdepasse-test', full_name: 'Dossier Pièce' });
    const registration = await db.createRegistration(account.id, {
      exam: 'BEPC', session_year: 2026, first_name: 'Dossier', last_name: 'PIECE',
      birth_date: '02/02/2010', birth_place: 'Bobo', gender: 'Féminin',
      region: 'Hauts-Bassins', province: 'Houet', center: 'Centre Test'
    });
    const document = await db.addRegistrationDocument(account.id, registration.id, {
      document_type: 'Acte de naissance', original_name: 'acte.pdf', mime_type: 'application/pdf', content: Buffer.from('test')
    });
    assert.strictEqual(document.status, 'À vérifier');
    assert.strictEqual((await db.listRegistrationDocuments(account.id, registration.id)).length, 1);
  });
});

describe('2. Tests Sécurité Anti-Robot (services/captchaService.js)', () => {
  const testSecret = 'secret-test-dgec-burkina';

  it('Génération d’un défi arithmétique et son jeton HMAC', () => {
    const captcha = generateCaptcha(testSecret);
    assert.ok(captcha.question.includes('+'), 'Doit être une addition arithmétique');
    assert.ok(captcha.token.length > 20, 'Jeton base64 signé présent');
  });

  it('Validation de la bonne réponse', () => {
    const captcha = generateCaptcha(testSecret);
    const [n1, , n2] = captcha.question.split(' ');
    const expected = String(Number(n1) + Number(n2));
    assert.strictEqual(verifyCaptcha(expected, captcha.token, testSecret), true);
  });

  it('Rejet d’une mauvaise réponse', () => {
    const captcha = generateCaptcha(testSecret);
    assert.strictEqual(verifyCaptcha('999', captcha.token, testSecret), false);
  });

  it('Rejet d’un jeton falsifié', () => {
    const captcha = generateCaptcha(testSecret);
    assert.strictEqual(verifyCaptcha('5', 'jeton-falsifie', testSecret), false);
  });
});

describe('3. Tests Génération Relevé Officiel PDF & QR Code (services/pdfService.js)', () => {

  it('Génération du relevé PDF vectoriel avec QR Code', async () => {
    const candidate = await db.findCandidate('BAC', 'BAC-2026-0837', '22/09/2007');
    const pdfBuffer = await generateCandidatePdf(candidate, 'http://localhost:3000');

    assert.ok(Buffer.isBuffer(pdfBuffer), 'Le résultat doit être un Buffer binaire');
    assert.ok(pdfBuffer.length > 3000, 'Le PDF doit contenir les données et le QR code');
    // En-tête standard de tout document PDF valide : "%PDF-"
    const magicNumber = pdfBuffer.slice(0, 5).toString('ascii');
    assert.strictEqual(magicNumber, '%PDF-', 'Signature binaire PDF valide');
  });
});

describe('4. Tests d’Intégration HTTP et API', () => {

  it('GET /health retourne le statut UP et les métriques', async () => {
    const res = await makeRequest('/health');
    assert.strictEqual(res.statusCode, 200);
    const json = JSON.parse(res.body);
    assert.strictEqual(json.status, 'UP');
    assert.strictEqual(json.service, 'Portail Résultats Burkina Faso');
  });

  it('GET /statistiques renvoie la page des statistiques (200)', async () => {
    const res = await makeRequest('/statistiques');
    assert.strictEqual(res.statusCode, 200);
    assert.ok(res.body.includes('Statistiques Nationales'));
  });

  it('GET /proclamations renvoie la liste par jury (200)', async () => {
    const res = await makeRequest('/proclamations');
    assert.strictEqual(res.statusCode, 200);
    assert.ok(res.body.includes('Listes de Proclamation'));
    assert.ok(!res.body.includes('Salimata'), 'Les résultats nominatifs ne doivent pas être publics');
  });

  it('GET /verifier/:code certifie un résultat officiel (200)', async () => {
    const res = await makeRequest('/verifier/BF-2026-BAC-0837-7D9A');
    assert.strictEqual(res.statusCode, 200);
    assert.ok(res.body.includes('Document Officiel Authentique Certifié'));
    assert.ok(res.body.includes('Salimata'));
  });

  it('GET /api/v1/resultats retourne le résultat au format JSON pour partenaires', async () => {
    const res = await makeRequest('/api/v1/resultats?exam=BAC&pv=BAC-2026-0837&dob=22/09/2007');
    assert.strictEqual(res.statusCode, 200);
    const json = JSON.parse(res.body);
    assert.strictEqual(json.success, true);
    assert.strictEqual(json.data.pv_number, 'BAC-2026-0837');
    assert.strictEqual(json.data.status, 'Admis');
  });

  it('POST /api/v1/sms-webhook traite une demande SMS opérateur', async () => {
    const payload = JSON.stringify({
      sender: '+22670001122',
      message: 'BAC BAC-2026-0837 22/09/2007'
    });
    const res = await makeRequest('/api/v1/sms-webhook', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      },
      body: payload
    });
    assert.strictEqual(res.statusCode, 200);
    const json = JSON.parse(res.body);
    assert.ok(json.response_sms.includes('ADMIS'));
    assert.ok(json.response_sms.includes('MENAPLN/DGEC'));
  });
});
