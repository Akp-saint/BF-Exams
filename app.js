/**
 * ==============================================================================
 * PORTAIL NATIONAL DES RÉSULTATS D'EXAMENS DU BURKINA FASO
 * SERVEUR PRINCIPAL & CONTRÔLEURS DE ROUTAGE (app.js)
 * ==============================================================================
 * 
 * Ce fichier est le point d'entrée central de l'application.
 * 
 * MODULES INTÉGRÉS :
 * ------------------
 * 1. Consultation des résultats : Recherche par Examen, Numéro de PV et Date de Naissance
 *    avec protection stricte de la confidentialité (Normes CIL Burkina Faso).
 * 2. Protection anti-robot : Captcha arithmétique local généré sans dépendance externe.
 * 3. Génération PDF certifié : Relevé de notes officiel imprimable avec QR Code dynamique.
 * 4. Vérification d'authenticité : Route `/verifier/:code` pour contrôle instantané anti-fraude.
 * 5. Portail de statistiques : Taux de réussite nationaux, par examen, série, région et genre.
 * 6. Proclamations par jury : Consultation des listes officielles d'admis par centre.
 * 7. Réclamations en ligne : Dépôt et suivi en temps réel des contestations.
 * 8. API REST & Webhook SMS : Intégration pour opérateurs mobiles (Orange, Moov, Telecel).
 * 9. Back-Office DGEC (/admin) : Authentification, gestion des jurys et importateur massif CSV.
 * 
 * DÉMARRAGE ET VALIDATION :
 * -------------------------
 * - Pour lancer en mode développement : `npm run dev`
 * - Pour exécuter la suite de tests automatisés : `npm test`
 * - Pour lancer avec Docker : `docker-compose up --build`
 * ==============================================================================
 */

const path = require('path');
const crypto = require('crypto');
const express = require('express');
const multer = require('multer');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const session = require('express-session');
const { RedisStore } = require('connect-redis');
const { createClient: createRedisClient } = require('redis');

// Services et modèles internes
const {
  findCandidate,
  findCandidateByPv,
  verifyCandidateByCode,
  getStatistics,
  getJuries,
  getProclamations,
  createClaim,
  getClaimByNumber,
  logAudit
} = require('./db');
const {
  createCandidateAccount,
  authenticateCandidate,
  createRegistration,
  listRegistrations,
  createSimulatedPayment
} = require('./db');
const { addRegistrationDocument, listRegistrationDocuments } = require('./db');
const { generateCandidatePdf } = require('./services/pdfService');
const { generateCaptcha, verifyCaptcha } = require('./services/captchaService');

// Routeurs spécialisés
const adminRoutes = require('./routes/admin');
const apiRoutes = require('./routes/api');

const app = express();
const port = Number(process.env.PORT) || 3000;
if (process.env.NODE_ENV === 'production' && (!process.env.CSRF_SECRET || process.env.CSRF_SECRET.length < 32)) {
  throw new Error('CSRF_SECRET doit être défini et comporter au moins 32 caractères en production');
}
const csrfSecret = process.env.CSRF_SECRET || crypto.randomBytes(32).toString('hex');
const requestLog = new Map();
const registrationUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, callback) => callback(null, ['application/pdf', 'image/jpeg', 'image/png'].includes(file.mimetype))
});

function hasAllowedFileSignature(file) {
  const header = file.buffer.subarray(0, 8);
  if (file.mimetype === 'application/pdf') return header.subarray(0, 5).toString('ascii') === '%PDF-';
  if (file.mimetype === 'image/jpeg') return header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff;
  if (file.mimetype === 'image/png') return header.equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  return false;
}
let sessionStore;

if (process.env.NODE_ENV === 'production' && !process.env.REDIS_URL) {
  throw new Error('REDIS_URL doit être défini en production pour partager les sessions');
}

if (process.env.REDIS_URL) {
  const redisClient = createRedisClient({ url: process.env.REDIS_URL });
  redisClient.on('error', (error) => console.error('Redis session store:', error.message));
  redisClient.connect().catch((error) => {
    console.error('Connexion Redis impossible:', error.message);
    if (process.env.NODE_ENV === 'production') process.exitCode = 1;
  });
  sessionStore = new RedisStore({ client: redisClient, prefix: 'resultats:sess:' });
}

// Configuration du moteur de vues EJS
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.set('trust proxy', 1); // Indispensable pour la détection correcte d'IP derrière Nginx ou Docker
app.disable('x-powered-by');

// Sécurité des en-têtes HTTP
app.use(helmet({
  contentSecurityPolicy: false,
  referrerPolicy: { policy: 'same-origin' }
}));

// Parsers de requêtes
app.use(cookieParser(csrfSecret));
app.use(express.urlencoded({ extended: false, limit: '50kb' }));
app.use(express.json()); // Permet la réception des webhooks et payloads API
app.use(express.static(path.join(__dirname, 'public')));
app.use((req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

// Gestion des sessions utilisateur (pour le back-office /admin)
app.use(session({
  secret: csrfSecret,
  ...(sessionStore ? { store: sessionStore } : {}),
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 4 * 60 * 60 * 1000 // 4 heures de validité
  }
}));

// Protection CSRF pour formulaires Web
app.use((req, res, next) => {
  let token = req.signedCookies.csrfToken;
  if (!token) {
    token = crypto.randomBytes(32).toString('hex');
    res.cookie('csrfToken', token, {
      signed: true,
      httpOnly: true,
      sameSite: 'strict',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 2 * 60 * 60 * 1000
    });
  }
  res.locals.csrfToken = token;
  res.locals.currentUser = req.session ? req.session.user : null;
  next();
});

// Tous les formulaires HTML mutatifs doivent présenter le jeton CSRF.
// Les endpoints API utilisent leurs propres mécanismes d'authentification.
app.use((req, res, next) => {
  if (req.method !== 'POST' || req.path.startsWith('/api/')) return next();

  const submittedCsrf = String(req.body._csrf || '');
  const storedCsrf = req.signedCookies.csrfToken || '';
  const tokensMatch = submittedCsrf.length === storedCsrf.length && storedCsrf.length > 0
    && crypto.timingSafeEqual(Buffer.from(submittedCsrf), Buffer.from(storedCsrf));

  if (!tokensMatch) {
    return res.status(403).render('error', {
      pageTitle: 'Requête refusée',
      message: 'Votre session de formulaire a expiré. Rechargez la page et réessayez.'
    });
  }
  next();
});

// Limiteur de requêtes (Rate Limiter) contre les attaques par force brute
app.use((req, res, next) => {
  const sensitiveLookup = req.method === 'GET' && (
    req.path === '/api/v1/resultats'
    || req.path === '/verifier'
    || req.path.startsWith('/verifier/')
    || req.path === '/reclamation/suivi'
  );
  if (req.method !== 'POST' && !sensitiveLookup) return next();

  const now = Date.now();
  const address = req.ip || req.socket.remoteAddress || 'unknown';
  const recent = (requestLog.get(address) || []).filter((timestamp) => now - timestamp < 60_000);
  const limit = req.path === '/admin/login' || req.path === '/inscription/connexion'
    ? 10
    : sensitiveLookup ? 30 : 60;
  
  if (recent.length >= limit) {
    return res.status(429).render('error', {
      pageTitle: 'Trop de requêtes',
      message: 'Veuillez patienter une minute avant de réessayer pour éviter toute surcharge.'
    });
  }
  recent.push(now);
  requestLog.set(address, recent);
  if (requestLog.size > 2000) requestLog.delete(requestLog.keys().next().value);
  next();
});

// Fonctions utilitaires partagées avec les templates EJS
app.locals.formatScore = (score) => Number(score || 0).toFixed(2).replace('.', ',');
app.locals.currentYear = new Date().getFullYear();

// ==============================================================================
// ROUTES PUBLIQUES DU PORTAIL CANDIDAT
// ==============================================================================

/**
 * Page d'accueil : Formulaire de consultation individuelle
 */
app.get('/', (req, res) => {
  const captcha = generateCaptcha(csrfSecret);
  res.render('home', {
    pageTitle: 'Accueil',
    selectedExam: '',
    pvNumber: '',
    birthDate: '',
    captchaQuestion: captcha.question,
    captchaToken: captcha.token,
    error: null
  });
});

function requireCandidateAuth(req, res, next) {
  if (req.session && req.session.candidate) return next();
  return res.redirect('/inscription/connexion');
}

app.get('/inscription', (req, res) => res.render('registration', { pageTitle: 'Inscription aux examens', error: null, success: null }));
app.get('/inscription/creer-compte', (req, res) => res.render('candidate-account', { pageTitle: 'Créer un compte candidat', mode: 'create', error: null }));
app.post('/inscription/creer-compte', async (req, res) => {
  try {
    const account = await createCandidateAccount(req.body);
    req.session.candidate = account;
    return res.redirect('/espace-candidat');
  } catch (error) {
    return res.status(400).render('candidate-account', { pageTitle: 'Créer un compte candidat', mode: 'create', error: error.code === '23505' ? 'Ce numéro est déjà utilisé.' : error.message });
  }
});
app.get('/inscription/connexion', (req, res) => res.render('candidate-account', { pageTitle: 'Connexion candidat', mode: 'login', error: null }));
app.post('/inscription/connexion', async (req, res) => {
  const account = await authenticateCandidate(req.body.phone, req.body.password);
  if (!account) return res.status(401).render('candidate-account', { pageTitle: 'Connexion candidat', mode: 'login', error: 'Numéro ou mot de passe incorrect.' });
  req.session.candidate = account;
  return res.redirect('/espace-candidat');
});
app.get('/inscription/nouveau', requireCandidateAuth, (req, res) => res.render('registration', { pageTitle: 'Nouveau dossier', error: null, success: null }));
app.post('/inscription/nouveau', requireCandidateAuth, async (req, res) => {
  try {
    const registration = await createRegistration(req.session.candidate.id, { ...req.body, exam: String(req.body.exam || '').toUpperCase(), session_year: 2026 });
    return res.redirect(`/inscription/paiement/${registration.id}`);
  } catch (error) {
    return res.status(400).render('registration', { pageTitle: 'Nouveau dossier', error: error.message, success: null });
  }
});
app.get('/espace-candidat', requireCandidateAuth, async (req, res) => res.render('candidate-dashboard', { pageTitle: 'Espace candidat', registrations: await listRegistrations(req.session.candidate.id), candidate: req.session.candidate }));
app.get('/inscription/paiement/:id', requireCandidateAuth, async (req, res) => {
  const registrations = await listRegistrations(req.session.candidate.id);
  const registration = registrations.find(item => item.id === Number(req.params.id));
  if (!registration) return res.status(404).render('error', { pageTitle: 'Dossier introuvable', message: 'Ce dossier n’appartient pas à votre compte.' });
  return res.render('payment', { pageTitle: 'Paiement simulé', registration, error: null, payment: null });
});
app.get('/inscription/documents/:id', requireCandidateAuth, async (req, res) => {
  const registrations = await listRegistrations(req.session.candidate.id);
  const registration = registrations.find(item => item.id === Number(req.params.id));
  if (!registration) return res.status(404).render('error', { pageTitle: 'Dossier introuvable', message: 'Ce dossier n’appartient pas à votre compte.' });
  const documents = await listRegistrationDocuments(req.session.candidate.id, registration.id);
  return res.render('documents', { pageTitle: 'Pièces justificatives', registration, documents, error: null });
});
app.post('/inscription/documents/:id', requireCandidateAuth, registrationUpload.single('document'), async (req, res) => {
  try {
    if (!req.file || !hasAllowedFileSignature(req.file)) throw new Error('Fichier absent ou contenu refusé. Utilisez un PDF, JPG ou PNG valide de 5 Mo maximum.');
    const document = await addRegistrationDocument(req.session.candidate.id, Number(req.params.id), {
      document_type: String(req.body.document_type || 'Justificatif').slice(0, 80),
      original_name: req.file.originalname.slice(0, 180), mime_type: req.file.mimetype, content: req.file.buffer
    });
    return res.redirect(`/inscription/documents/${req.params.id}?uploaded=${document.id}`);
  } catch (error) {
    const registrations = await listRegistrations(req.session.candidate.id);
    const registration = registrations.find(item => item.id === Number(req.params.id));
    if (!registration) return res.status(404).render('error', { pageTitle: 'Dossier introuvable', message: 'Dossier introuvable.' });
    const documents = await listRegistrationDocuments(req.session.candidate.id, registration.id);
    return res.status(400).render('documents', { pageTitle: 'Pièces justificatives', registration, documents, error: error.message });
  }
});
app.get('/inscription/convocation/:id', requireCandidateAuth, async (req, res) => {
  const registrations = await listRegistrations(req.session.candidate.id);
  const registration = registrations.find(item => item.id === Number(req.params.id));
  if (!registration || registration.status !== 'Payé') return res.status(403).render('error', { pageTitle: 'Convocation indisponible', message: 'La convocation sera disponible après confirmation du paiement.' });
  return res.render('convocation', { pageTitle: 'Confirmation d’inscription', registration });
});
app.post('/inscription/paiement/:id', requireCandidateAuth, async (req, res) => {
  try {
    const payment = await createSimulatedPayment(req.session.candidate.id, Number(req.params.id), req.body.provider);
    const registrations = await listRegistrations(req.session.candidate.id);
    const registration = registrations.find(item => item.id === Number(req.params.id));
    return res.render('payment', { pageTitle: 'Paiement confirmé', registration, error: null, payment });
  } catch (error) {
    return res.status(400).render('payment', { pageTitle: 'Paiement simulé', registration: null, error: error.message, payment: null });
  }
});
app.get('/inscription/deconnexion', (req, res) => req.session.destroy(() => res.redirect('/')));

/**
 * Traitement de la recherche de résultat
 * Exige : Examen, Numéro de PV, Date de naissance (Normes CIL), et Captcha
 */
app.post('/resultats', async (req, res) => {
  res.set('Cache-Control', 'no-store');
  const selectedExam = String(req.body.exam || '').trim().toUpperCase();
  const pvNumber = String(req.body.pv || '').trim().toUpperCase();
  const birthDate = String(req.body.dob || '').trim();
  const captchaAnswer = String(req.body.captcha || '').trim();
  const captchaToken = String(req.body._captchaToken || '');

  const submittedCsrf = String(req.body._csrf || '');
  const storedCsrf = req.signedCookies.csrfToken || '';
  const tokensMatch = submittedCsrf.length === storedCsrf.length && storedCsrf.length > 0
    && crypto.timingSafeEqual(Buffer.from(submittedCsrf), Buffer.from(storedCsrf));

  // Régénération d'un Captcha frais en cas de réaffichage du formulaire
  const freshCaptcha = generateCaptcha(csrfSecret);

  // 1. Contrôle CSRF
  if (!tokensMatch) {
    return res.status(403).render('error', {
      pageTitle: 'Requête refusée',
      message: 'Votre session de formulaire a expiré. Rechargez la page et réessayez.'
    });
  }

  // 2. Contrôle du Captcha anti-robot
  const isCaptchaValid = verifyCaptcha(captchaAnswer, captchaToken, csrfSecret);
  if (!isCaptchaValid) {
    return res.status(400).render('home', {
      pageTitle: 'Code de sécurité incorrect',
      selectedExam,
      pvNumber,
      birthDate,
      captchaQuestion: freshCaptcha.question,
      captchaToken: freshCaptcha.token,
      error: 'La réponse au test de sécurité anti-robot est incorrecte ou a expiré. Veuillez réessayer.'
    });
  }

  // 3. Validation des formats d'entrée
  if (!['CEP', 'BEPC', 'BAC'].includes(selectedExam) || !/^[A-Z0-9]{2,10}(?:-[A-Z0-9]{1,12}){1,4}$/.test(pvNumber) || !birthDate) {
    return res.status(400).render('home', {
      pageTitle: 'Champs obligatoires manquants',
      selectedExam,
      pvNumber,
      birthDate,
      captchaQuestion: freshCaptcha.question,
      captchaToken: freshCaptcha.token,
      error: 'Veuillez sélectionner un examen, renseigner votre numéro de PV et votre date de naissance.'
    });
  }

  // 4. Recherche et contrôle d'accès dans la base
  try {
    const candidate = await findCandidate(selectedExam, pvNumber, birthDate);
    if (!candidate) {
      return res.status(404).render('home', {
        pageTitle: 'Résultat introuvable',
        selectedExam,
        pvNumber,
        birthDate,
        captchaQuestion: freshCaptcha.question,
        captchaToken: freshCaptcha.token,
        error: 'Aucun résultat ne correspond aux références saisies. Vérifiez l’examen et le numéro de PV.'
      });
    }

    // Succès : affichage du relevé officiel individuel
    req.session.resultAccess = {
      pv: candidate.pv_number,
      verifiedAt: Date.now()
    };
    return res.render('result', {
      pageTitle: `Résultat ${candidate.exam} - ${candidate.pv_number}`,
      candidate
    });
  } catch (error) {
    // Si la date de naissance ne correspond pas au numéro de PV (protection CIL)
    if (error.code === 'DATE_MISMATCH') {
      return res.status(403).render('home', {
        pageTitle: 'Date de naissance non concordante',
        selectedExam,
        pvNumber,
        birthDate,
        captchaQuestion: freshCaptcha.question,
        captchaToken: freshCaptcha.token,
        error: 'La date de naissance renseignée ne correspond pas au titulaire de ce numéro de PV. Par mesure de confidentialité, l’accès aux notes est refusé.'
      });
    }

    console.error('Erreur consultation candidat :', error);
    return res.status(500).render('error', { pageTitle: 'Erreur technique' });
  }
});

/**
 * Téléchargement du relevé officiel au format PDF avec QR Code certifié
 * GET /resultats/:pv/pdf
 */
app.get('/resultats/:pv/pdf', async (req, res) => {
  const pvNumber = String(req.params.pv || '').trim().toUpperCase();

  if (!req.session.resultAccess || req.session.resultAccess.pv !== pvNumber) {
    return res.status(403).render('error', {
      pageTitle: 'Accès refusé',
      message: 'Consultez d’abord votre résultat avec votre numéro de PV et votre date de naissance.'
    });
  }

  try {
    const candidate = await findCandidateByPv(pvNumber);
    if (!candidate) {
      return res.status(404).render('error', {
        pageTitle: 'Document introuvable',
        message: 'Le relevé demandé n’existe pas ou le numéro de PV est erroné.'
      });
    }

    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const pdfBuffer = await generateCandidatePdf(candidate, baseUrl);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="Releve_${candidate.exam}_${candidate.pv_number}.pdf"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    res.send(pdfBuffer);
  } catch (err) {
    console.error('Erreur génération PDF :', err);
    res.status(500).render('error', { pageTitle: 'Erreur de génération PDF' });
  }
});

/**
 * Vérification de l'authenticité d'un document officiel via son QR Code
 * GET /verifier/:code ou GET /verifier?code=...
 */
app.get(['/verifier', '/verifier/:code'], async (req, res) => {
  res.set('Cache-Control', 'no-store');
  const code = String(req.params.code || req.query.code || '').trim().toUpperCase();

  if (!code) {
    return res.render('verify', {
      pageTitle: 'Vérification d’authenticité',
      candidate: null,
      queryCode: ''
    });
  }

  try {
    const candidate = await verifyCandidateByCode(code);
    return res.render('verify', {
      pageTitle: candidate ? `Certifié Authentique - ${candidate.pv_number}` : 'Document Non Reconnu',
      candidate,
      queryCode: code
    });
  } catch (err) {
    console.error('Erreur vérification QR Code :', err);
    res.status(500).render('error', { pageTitle: 'Erreur technique' });
  }
});

/**
 * Tableau de bord des statistiques nationales publiques
 * GET /statistiques
 */
app.get('/statistiques', async (req, res) => {
  try {
    const stats = await getStatistics();
    res.render('stats', {
      pageTitle: 'Statistiques Nationales',
      stats
    });
  } catch (err) {
    console.error('Erreur statistiques :', err);
    res.status(500).render('error', { pageTitle: 'Erreur statistiques' });
  }
});

/**
 * Proclamations et listes par jury (Babillard numérique officiel)
 * GET /proclamations
 */
app.get('/proclamations', async (req, res) => {
  const selectedExam = String(req.query.exam || '').trim().toUpperCase();
  const selectedJury = String(req.query.jury || '').trim();

  try {
    const juries = await getJuries(selectedExam);
    const candidates = await getProclamations(selectedJury, selectedExam);

    res.render('proclamations', {
      pageTitle: 'Listes de Proclamation',
      selectedExam,
      selectedJury,
      juries,
      candidates
    });
  } catch (err) {
    console.error('Erreur proclamations :', err);
    res.status(500).render('error', { pageTitle: 'Erreur proclamations' });
  }
});

/**
 * Formulaire de réclamation candidat
 * GET /reclamation
 */
app.get('/reclamation', (req, res) => {
  res.render('claim', {
    pageTitle: 'Réclamations en Ligne',
    defaultExam: req.query.exam || 'BAC',
    defaultPv: req.query.pv || '',
    error: null,
    successMessage: null,
    newClaimNumber: null,
    trackedClaim: null,
    trackedNotFound: false,
    queryClaimNumber: ''
  });
});

/**
 * Dépôt d'une nouvelle réclamation
 * POST /reclamation
 */
app.post('/reclamation', async (req, res) => {
  const { exam, pv_number, candidate_name, claim_type, description, phone, email } = req.body;

  if (!pv_number || !candidate_name || !claim_type || !description || !phone) {
    return res.render('claim', {
      pageTitle: 'Réclamations en Ligne',
      defaultExam: exam || 'BAC',
      defaultPv: pv_number || '',
      error: 'Veuillez renseigner tous les champs obligatoires.',
      successMessage: null,
      newClaimNumber: null,
      trackedClaim: null,
      trackedNotFound: false,
      queryClaimNumber: ''
    });
  }

  try {
    const result = await createClaim({
      exam,
      pv_number,
      candidate_name,
      claim_type,
      description,
      phone,
      email
    });
    await logAudit({
      action: 'claim.create',
      resourceType: 'claim',
      resourceId: result.claimNumber,
      metadata: { exam, pv_number, claim_type },
      ipAddress: req.ip
    });

    return res.render('claim', {
      pageTitle: 'Réclamation Enregistrée',
      defaultExam: 'BAC',
      defaultPv: '',
      error: null,
      successMessage: 'Votre réclamation a bien été enregistrée et transmise à la commission des recours.',
      newClaimNumber: result.claimNumber,
      trackedClaim: null,
      trackedNotFound: false,
      queryClaimNumber: ''
    });
  } catch (err) {
    console.error('Erreur création réclamation :', err);
    res.status(500).render('error', { pageTitle: 'Erreur réclamation' });
  }
});

/**
 * Suivi d'une réclamation existante
 * GET /reclamation/suivi
 */
app.get('/reclamation/suivi', async (req, res) => {
  res.set('Cache-Control', 'no-store');
  const claimNumber = req.query.claim_number;

  try {
    const claim = await getClaimByNumber(claimNumber);
    res.render('claim', {
      pageTitle: 'Suivi de Réclamation',
      defaultExam: 'BAC',
      defaultPv: '',
      error: null,
      successMessage: null,
      newClaimNumber: null,
      trackedClaim: claim,
      trackedNotFound: !claim,
      queryClaimNumber: claimNumber
    });
  } catch (err) {
    res.status(500).render('error', { pageTitle: 'Erreur suivi' });
  }
});

/**
 * Surveillance de santé de l'application pour Docker / Kubernetes
 * GET /health
 */
app.get('/health', (req, res) => {
  res.json({
    status: 'UP',
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
    service: 'Examens BF (démo)',
    version: '2.0.0'
  });
});

// ==============================================================================
// BRANCHEMENT DES ROUTEURS SPÉCIALISÉS
// ==============================================================================
app.use('/admin', adminRoutes); // Back-Office DGEC
app.use('/api/v1', apiRoutes);  // API REST & Webhooks SMS

// Gestion des pages introuvables (404)
app.use((req, res) => res.status(404).render('error', {
  pageTitle: 'Page introuvable',
  notFound: true
}));

// Démarrage du serveur HTTP
if (process.env.NODE_ENV !== 'test') {
  app.listen(port, '0.0.0.0', () => {
    console.log(`Portail de résultats disponible sur le port ${port}`);
    console.log(`Administration démo : http://localhost:${port}/admin`);
  });
}

module.exports = app;
