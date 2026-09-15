/**
 * ==============================================================================
 * PORTAIL NATIONAL DES RÉSULTATS D'EXAMENS DU BURKINA FASO
 * MODULE DE GESTION ADMINISTRATIVE & BACK-OFFICE (routes/admin.js)
 * ==============================================================================
 * 
 * Ce contrôleur gère :
 * 1. L'authentification sécurisée des agents du Ministère / DGEC
 *    (Sessions Express cryptées, contrôle d'accès middleware `requireAdminAuth`).
 * 2. Le tableau de bord administratif (Indicateurs clés nationaux).
 * 3. La gestion et la proclamation officielle des Jurys (statut Brouillon <-> Proclamé).
 * 4. L'instruction et le traitement des réclamations déposées par les candidats.
 * 5. L'importation massive de résultats scolaires par fichier CSV / Excel
 *    (avec support des délimiteurs virgule et point-virgule et téléchargement d'un modèle).
 * 
 * GUIDE POUR TOUTE IA OU DÉVELOPPEUR REPRENANT LE PROJET :
 * --------------------------------------------------------
 * - Les comptes sont créés explicitement avec `npm run admin:create`.
 * - L'importateur CSV accepte les colonnes standards :
 *   exam;pv_number;first_name;last_name;birth_date;birth_place;gender;center;jury;series;round;status;mention;average
 * ==============================================================================
 */

const express = require('express');
const multer = require('multer');
const router = express.Router();
const {
  authenticateUser,
  getStatistics,
  getJuries,
  updateJuryStatus,
  getClaims,
  updateClaimStatus,
  importCandidatesBatch,
  getProclamations,
  logAudit,
  getCampaigns,
  updateCampaignStatus
} = require('../db');

// Configuration du téléversement en mémoire tampon avec Multer
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 } // Limite 5 Mo
});

/**
 * Middleware de protection des routes d'administration
 */
function requireAdminAuth(req, res, next) {
  if (req.session && req.session.user) {
    res.locals.currentUser = req.session.user;
    return next();
  }
  return res.redirect('/admin/login');
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.session || !req.session.user) return res.redirect('/admin/login');
    if (req.session.user.role === 'superadmin' || roles.includes(req.session.user.role)) return next();
    return res.status(403).render('error', {
      pageTitle: 'Accès refusé',
      message: 'Votre rôle ne permet pas d’accéder à cette fonctionnalité.'
    });
  };
}

/**
 * 1. Page de connexion administrative
 * GET /admin/login
 */
router.get('/login', (req, res) => {
  if (req.session && req.session.user) {
    return res.redirect('/admin');
  }
  res.render('admin/login', {
    pageTitle: 'Connexion DGEC',
    error: null,
    identifier: ''
  });
});

/**
 * 2. Traitement de la connexion
 * POST /admin/login
 */
router.post('/login', async (req, res) => {
  const { identifier, password } = req.body;

  try {
    const user = await authenticateUser(identifier, password);
    if (!user) {
      return res.status(401).render('admin/login', {
        pageTitle: 'Connexion DGEC',
        error: 'Identifiant ou mot de passe incorrect.',
        identifier
      });
    }

    // Création de la session utilisateur
    req.session.user = user;
    await logAudit({ user, action: 'login', resourceType: 'session', ipAddress: req.ip });
    return res.redirect('/admin');
  } catch (err) {
    console.error('Erreur login admin :', err);
    return res.status(500).render('admin/login', {
      pageTitle: 'Connexion DGEC',
      error: 'Erreur technique lors de la tentative de connexion.',
      identifier
    });
  }
});

/**
 * 3. Déconnexion
 * GET /admin/logout
 */
router.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/');
  });
});

/**
 * 4. Tableau de bord principal DGEC
 * GET /admin
 */
router.get('/', requireAdminAuth, async (req, res) => {
  try {
    const stats = await getStatistics();
    const juries = await getJuries();
    const pendingClaims = await getClaims('En attente');

    res.render('admin/dashboard', {
      pageTitle: 'Tableau de bord DGEC',
      stats,
      juries,
      pendingClaimsCount: pendingClaims.length
    });
  } catch (err) {
    console.error('Erreur dashboard admin :', err);
    res.status(500).render('error', { pageTitle: 'Erreur admin' });
  }
});

/**
 * 5. Gestion des jurys et proclamations
 * GET /admin/jurys
 */
router.get('/jurys', requireRole('jury_president'), async (req, res) => {
  try {
    const juries = await getJuries();
    res.render('admin/jurys', {
      pageTitle: 'Gestion des Jurys',
      juries,
      successMessage: req.query.success || null
    });
  } catch (err) {
    res.status(500).render('error', { pageTitle: 'Erreur jurys' });
  }
});

/**
 * 6. Changement de statut d'un jury (Brouillon <-> Proclamé)
 * POST /admin/jurys/:id/status
 */
router.post('/jurys/:id/status', requireRole('jury_president'), async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  try {
    await updateJuryStatus(id, status);
    await logAudit({ user: req.session.user, action: 'jury.status.update', resourceType: 'jury', resourceId: id, metadata: { status }, ipAddress: req.ip });
    res.redirect('/admin/jurys?success=Statut+du+jury+mis+à+jour+avec+succès');
  } catch (err) {
    console.error('Erreur update jury :', err);
    res.redirect('/admin/jurys?error=Erreur+mise+a+jour');
  }
});

/**
 * 7. Gestion des réclamations
 * GET /admin/reclamations
 */
router.get('/reclamations', requireRole('dgec_agent'), async (req, res) => {
  const filter = req.query.status || '';
  try {
    const claims = await getClaims(filter);
    res.render('admin/reclamations', {
      pageTitle: 'Gestion des Réclamations',
      claims,
      currentFilter: filter,
      successMessage: req.query.success || null
    });
  } catch (err) {
    res.status(500).render('error', { pageTitle: 'Erreur réclamations' });
  }
});

/**
 * 8. Traitement d'une réclamation
 * POST /admin/reclamations/:id
 */
router.post('/reclamations/:id', requireRole('dgec_agent'), async (req, res) => {
  const { id } = req.params;
  const { status, admin_notes } = req.body;

  try {
    await updateClaimStatus(id, status, admin_notes);
    await logAudit({ user: req.session.user, action: 'claim.status.update', resourceType: 'claim', resourceId: id, metadata: { status }, ipAddress: req.ip });
    res.redirect('/admin/reclamations?success=Dossier+de+réclamation+mis+à+jour');
  } catch (err) {
    console.error('Erreur update reclamation :', err);
    res.redirect('/admin/reclamations?error=Erreur');
  }
});

/**
 * 9. Page d'importation CSV
 * GET /admin/import
 */
router.get('/import', requireRole('dgec_agent'), (req, res) => {
  res.render('admin/import', {
    pageTitle: 'Import Massif des Résultats',
    error: null,
    report: null
  });
});

router.get('/campagnes', requireRole('dgec_agent'), async (req, res) => {
  try {
    res.render('admin/campaigns', { pageTitle: 'Campagnes d’inscription', campaigns: await getCampaigns(), error: null });
  } catch (error) {
    res.status(500).render('error', { pageTitle: 'Erreur campagnes', message: error.message });
  }
});

router.post('/campagnes/:id/statut', requireRole('dgec_agent'), async (req, res) => {
  const allowedStatuses = ['Brouillon', 'Ouverte', 'Suspendue', 'Clôturée'];
  if (!allowedStatuses.includes(req.body.status)) return res.status(400).render('error', { pageTitle: 'Statut invalide', message: 'Le statut de campagne est invalide.' });
  try {
    await updateCampaignStatus(req.params.id, req.body.status);
    await logAudit({ user: req.session.user, action: 'campaign.status.update', resourceType: 'campaign', resourceId: req.params.id, metadata: { status: req.body.status }, ipAddress: req.ip });
    res.redirect('/admin/campagnes');
  } catch (error) {
    res.status(500).render('error', { pageTitle: 'Erreur campagne', message: error.message });
  }
});

/**
 * 10. Traitement du fichier CSV importé
 * POST /admin/import
 */
router.post('/import', requireRole('dgec_agent'), upload.single('csv_file'), async (req, res) => {
  if (!req.file) {
    return res.render('admin/import', {
      pageTitle: 'Import Massif des Résultats',
      error: 'Veuillez sélectionner un fichier CSV à téléverser.',
      report: null
    });
  }

  try {
    const content = req.file.buffer.toString('utf8');
    const lines = content.split(/\r?\n/).filter(line => line.trim().length > 0);

    if (lines.length < 2) {
      return res.render('admin/import', {
        pageTitle: 'Import Massif des Résultats',
        error: 'Le fichier CSV est vide ou ne contient aucune ligne de données.',
        report: null
      });
    }

    // Détection du délimiteur (point-virgule ou virgule)
    const headerLine = lines[0];
    const delimiter = headerLine.includes(';') ? ';' : ',';
    const headers = headerLine.split(delimiter).map(h => h.trim().toLowerCase());

    const candidatesToInsert = [];

    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(delimiter).map(c => c.trim());
      if (cols.length < 5) continue;

      const row = {};
      headers.forEach((h, idx) => {
        row[h] = cols[idx] || '';
      });

      // Normalisation des colonnes obligatoires
      const exam = (row.exam || 'BAC').toUpperCase();
      const pv_number = (row.pv_number || row.pv || '').toUpperCase();
      const first_name = row.first_name || row.prenoms || '';
      const last_name = (row.last_name || row.nom || '').toUpperCase();
      const birth_date = row.birth_date || row.date_naissance || '01/01/2000';
      const birth_place = row.birth_place || row.lieu_naissance || 'Burkina Faso';
      const gender = (row.gender || row.genre || 'Masculin').toLowerCase().startsWith('f') ? 'Féminin' : 'Masculin';
      const center = row.center || row.centre || 'Lycée Nelson Mandela';
      const jury = row.jury || 'Jury 01 - Ouagadougou';
      const series = row.series || row.serie || 'Général';
      const round = row.round || row.tour || '1er tour';
      const region = row.region || 'Centre';
      const province = row.province || 'Kadiogo';
      const status = row.status || row.statut || 'Admis';
      const mention = row.mention || 'Passable';
      const average = parseFloat((row.average || row.moyenne || '10').replace(',', '.')) || 10.0;

      if (pv_number && first_name && last_name) {
        candidatesToInsert.push({
          exam,
          pv_number,
          first_name,
          last_name,
          birth_date,
          birth_place,
          gender,
          center,
          jury,
          series,
          session_year: 2026,
          round,
          region,
          province,
          status,
          mention,
          average
        });
      }
    }

    if (candidatesToInsert.length === 0) {
      return res.render('admin/import', {
        pageTitle: 'Import Massif des Résultats',
        error: 'Aucune ligne valide trouvée. Vérifiez le format de votre fichier CSV.',
        report: null
      });
    }

    // Exécution de l'import par lot dans PostgreSQL
    const report = await importCandidatesBatch(candidatesToInsert);
    await logAudit({ user: req.session.user, action: 'candidate.import', resourceType: 'candidate', metadata: { total: candidatesToInsert.length, inserted: report.inserted }, ipAddress: req.ip });

    return res.render('admin/import', {
      pageTitle: 'Import Massif des Résultats',
      error: null,
      report: {
        total: candidatesToInsert.length,
        inserted: report.inserted,
        errors: report.errors
      }
    });

  } catch (err) {
    console.error('Erreur import CSV :', err);
    return res.render('admin/import', {
      pageTitle: 'Import Massif des Résultats',
      error: `Erreur technique lors de l'import : ${err.message}`,
      report: null
    });
  }
});

/**
 * 11. Téléchargement d'un modèle CSV prêt à l'emploi
 * GET /admin/modele-csv
 */
router.get('/modele-csv', requireRole('dgec_agent'), (req, res) => {
  const csvContent = "exam;pv_number;first_name;last_name;birth_date;birth_place;gender;center;jury;series;round;region;province;status;mention;average\n" +
    "BAC;BAC-2026-9901;Alassane;COMPAORÉ;12/05/2007;Ouagadougou;Masculin;Lycée Nelson Mandela;Jury 01 - Ouagadougou;D (Scientifique);1er tour;Centre;Kadiogo;Admis;Bien;14.25\n" +
    "BAC;BAC-2026-9902;Bintou;KOUANDA;20/11/2007;Koudougou;Féminin;Lycée Provincial de Koudougou;Jury B - Koudougou;A4 (Littéraire);1er tour;Centre-Ouest;Boulkiemdé;Admissible;Passable;10.50\n" +
    "BEPC;BEPC-2026-9903;Souleymane;BAMBARA;03/09/2010;Bobo-Dioulasso;Masculin;Lycée Ouezzin Coulibaly;Jury 14 - Bobo-Dioulasso;Général;1er tour;Hauts-Bassins;Houet;Admis;Assez Bien;12.80\n";

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="modele_import_resultats_burkina.csv"');
  res.send(csvContent);
});

module.exports = router;
