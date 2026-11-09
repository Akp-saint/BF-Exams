/**
 * ==============================================================================
 * PROJET INDÉPENDANT DE DÉMONSTRATION
 * SERVICE DE GÉNÉRATION DE RELEVÉ FICTIF PDF (services/pdfService.js)
 * ==============================================================================
 * 
 * Ce service génère un exemple fictif de relevé au format PDF A4.
 * 
 * ÉLÉMENTS DE DÉMONSTRATION :
 * -----------------------------
 * 1. En-tête identifiant clairement le document comme une démonstration indépendante.
 * 3. Bloc état civil complet du candidat (Nom, Prénoms, Date & Lieu de naissance, PV).
 * 4. Détails de session : Examen, Série (BAC), Tour, Année, Jury et Centre d'examen.
 * 5. Relevé des notes avec matières, coefficients, points et calcul de la moyenne.
 * 6. Décision finale du Jury (Admis d'office, Admissible au 2nd tour, Ajourné) et Mention.
 * 7. BLOC D'AUTHENTICITÉ NUMÉRIQUE :
 *    - **QR Code scannable haute résolution** généré dynamiquement à la volée.
 *    - Le QR Code mène à la vérification d'un exemple fictif.
 * 
 * GÉNÉRATION DES RELEVÉS PDF :
 * ---------------------------
 * - Le moteur utilise `PDFKit` (sans dépendance Chromium/Puppeteer) pour une 
 *   génération ultra-rapide et légère en mémoire lors des pics d'affluence.
 * - Le QR Code est généré avec la bibliothèque `qrcode` en buffer PNG.
 * - `generateCandidatePdf(candidate, baseUrl)` retourne une Promise qui résout en `Buffer`.
 * ==============================================================================
 */

const PDFDocument = require('pdfkit');
const QRCode = require('qrcode');

/**
 * Formate un nombre au format français (ex: 14.50 -> "14,50")
 */
function formatNumber(num) {
  return Number(num || 0).toFixed(2).replace('.', ',');
}

/**
 * Génère un relevé fictif PDF avec QR Code de démonstration
 * 
 * @param {object} candidate - Objet candidat complet avec `grades`
 * @param {string} baseUrl - URL de base du site pour la cible du QR Code (ex: "http://localhost:3000")
 * @returns {Promise<Buffer>} - Buffer binaire du PDF généré
 */
async function generateCandidatePdf(candidate, baseUrl = 'http://localhost:3000') {
  return new Promise(async (resolve, reject) => {
    try {
      // 1. Génération du QR Code de vérification
      const verificationUrl = `${baseUrl.replace(/\/$/, '')}/verifier/${encodeURIComponent(candidate.verification_code)}`;
      const qrCodeBuffer = await QRCode.toBuffer(verificationUrl, {
        errorCorrectionLevel: 'M',
        margin: 1,
        width: 140,
        color: {
          dark: '#004c2c', // Vert institutionnel du Burkina Faso
          light: '#ffffff'
        }
      });

      // 2. Initialisation du document PDFKit (Format A4 standard avec marges réduites)
      const doc = new PDFDocument({
        size: 'A4',
        margins: { top: 30, bottom: 30, left: 35, right: 35 },
        info: {
          Title: `Releve_Notes_${candidate.exam}_${candidate.pv_number}`,
          Author: 'Projet indépendant de démonstration',
          Subject: `Exemple fictif de résultats pour ${candidate.exam}`,
          Keywords: 'Démonstration, données fictives, relevé de notes'
        }
      });

      const chunks = [];
      doc.on('data', chunk => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', err => reject(err));

      const pageWidth = doc.page.width;
      const leftMargin = 35;
      const rightMargin = pageWidth - 35;
      const usableWidth = rightMargin - leftMargin;

      // ============================================================================
      // HAUT DE PAGE : BANDE TRICOLORE (ROUGE / VERT / JAUNE)
      // ============================================================================
      const bandHeight = 4;
      const bandY = 20;
      doc.rect(leftMargin, bandY, usableWidth / 2, bandHeight).fill('#b32025'); // Rouge drapeau BF
      doc.rect(leftMargin + usableWidth / 2, bandY, usableWidth / 2, bandHeight).fill('#006b3f'); // Vert drapeau BF

      // ============================================================================
      // IDENTIFICATION DU PROJET
      // ============================================================================
      let currentY = 32;

      // Avertissement de démonstration
      doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#1b2924')
        .text("PROJET INDÉPENDANT DE DÉMONSTRATION", leftMargin, currentY);
      doc.font('Helvetica-Oblique').fontSize(7.5).fillColor('#6c7873')
        .text("Sans affiliation avec le MENAPLN ou la DGEC", leftMargin, currentY + 11);
      doc.font('Helvetica').fontSize(7.5).fillColor('#2c3934')
        .text("DONNÉES ET RÉSULTATS ENTIÈREMENT FICTIFS", leftMargin, currentY + 22);

      // Références de l'exemple
      const rightAlignX = leftMargin + usableWidth - 210;
      doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#1b2924')
        .text("SESSION NORMALE 2026", rightAlignX, currentY, { width: 210, align: 'right' });
      doc.font('Helvetica').fontSize(8).fillColor('#6c7873')
        .text(`Région : ${candidate.region || 'Centre'}`, rightAlignX, currentY + 12, { width: 210, align: 'right' })
        .text(`Province : ${candidate.province || 'Kadiogo'}`, rightAlignX, currentY + 23, { width: 210, align: 'right' })
        .text(`Date d'édition : ${new Date().toLocaleDateString('fr-FR')}`, rightAlignX, currentY + 34, { width: 210, align: 'right' });

      // ============================================================================
      // TITRE PRINCIPAL DU DOCUMENT
      // ============================================================================
      currentY += 66;

      // Boîte d'en-tête du titre
      doc.rect(leftMargin, currentY, usableWidth, 34).fillAndStroke('#f3f8f5', '#c8ded2');
      doc.font('Helvetica-Bold').fontSize(13).fillColor('#004c2c')
        .text(
          `RELEVÉ FICTIF DE DÉMONSTRATION — ${candidate.exam}`,
          leftMargin,
          currentY + 6,
          { width: usableWidth, align: 'center' }
        );
      
      const subInfo = candidate.exam === 'BAC' 
        ? `SÉRIE : ${candidate.series.toUpperCase()}  |  TOUR : ${candidate.round.toUpperCase()}`
        : `TOUR : ${candidate.round.toUpperCase()}  |  OPTION : ${candidate.series || 'Enseignement Général'}`;
      doc.font('Helvetica').fontSize(8.5).fillColor('#2c3934')
        .text(subInfo, leftMargin, currentY + 21, { width: usableWidth, align: 'center' });

      currentY += 42;

      // ============================================================================
      // SECTION 1 : ÉTAT CIVIL & IDENTIFICATION DU CANDIDAT
      // ============================================================================
      doc.rect(leftMargin, currentY, usableWidth, 68).fillAndStroke('#ffffff', '#e3eae5');
      
      // Bandeau titre section
      doc.rect(leftMargin, currentY, usableWidth, 16).fill('#edf4f0');
      doc.font('Helvetica-Bold').fontSize(8).fillColor('#006b3f')
        .text("1. IDENTIFICATION ET ÉTAT CIVIL DU CANDIDAT", leftMargin + 8, currentY + 4);

      const idY = currentY + 22;
      const col1X = leftMargin + 10;
      const col2X = leftMargin + 190;
      const col3X = leftMargin + 360;

      // Ligne 1
      doc.font('Helvetica').fontSize(7.5).fillColor('#6c7873').text("Nom et prénoms :", col1X, idY);
      doc.font('Helvetica-Bold').fontSize(9).fillColor('#1b2924').text(`${candidate.last_name} ${candidate.first_name}`, col1X, idY + 9);

      doc.font('Helvetica').fontSize(7.5).fillColor('#6c7873').text("Numéro de PV :", col2X, idY);
      doc.font('Helvetica-Bold').fontSize(9).fillColor('#004c2c').text(candidate.pv_number, col2X, idY + 9);

      doc.font('Helvetica').fontSize(7.5).fillColor('#6c7873').text("Genre :", col3X, idY);
      doc.font('Helvetica-Bold').fontSize(9).fillColor('#1b2924').text(candidate.gender, col3X, idY + 9);

      // Ligne 2
      const idY2 = idY + 23;
      doc.font('Helvetica').fontSize(7.5).fillColor('#6c7873').text("Né(e) le et à :", col1X, idY2);
      doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#1b2924').text(`${candidate.birth_date} à ${candidate.birth_place}`, col1X, idY2 + 9);

      doc.font('Helvetica').fontSize(7.5).fillColor('#6c7873').text("Centre de composition :", col2X, idY2);
      doc.font('Helvetica-Bold').fontSize(8).fillColor('#1b2924').text(candidate.center, col2X, idY2 + 9, { width: 160 });

      doc.font('Helvetica').fontSize(7.5).fillColor('#6c7873').text("Jury :", col3X, idY2);
      doc.font('Helvetica-Bold').fontSize(8).fillColor('#1b2924').text(candidate.jury, col3X, idY2 + 9, { width: 155 });

      currentY += 76;

      // ============================================================================
      // SECTION 2 : TABLEAU DÉTAILLÉ DES NOTES ET COEFFICIENTS
      // ============================================================================
      doc.rect(leftMargin, currentY, usableWidth, 16).fill('#edf4f0');
      doc.font('Helvetica-Bold').fontSize(8).fillColor('#006b3f')
        .text("2. RÉSULTATS DÉTAILLÉS PAR ÉPREUVE", leftMargin + 8, currentY + 4);

      currentY += 18;

      // En-têtes du tableau
      const thY = currentY;
      const colSubjectX = leftMargin;
      const colScoreX = leftMargin + 260;
      const colCoeffX = leftMargin + 350;
      const colPointsX = leftMargin + 430;
      const tableW = usableWidth;

      doc.rect(colSubjectX, thY, tableW, 16).fill('#f7faf8');
      doc.font('Helvetica-Bold').fontSize(8).fillColor('#2c3934');
      doc.text("MATIÈRE / ÉPREUVE", colSubjectX + 10, thY + 4);
      doc.text("NOTE / 20", colScoreX, thY + 4, { width: 70, align: 'right' });
      doc.text("COEFFICIENT", colCoeffX, thY + 4, { width: 60, align: 'right' });
      doc.text("POINTS", colPointsX, thY + 4, { width: 85, align: 'right' });

      currentY += 16;

      let totalPoints = 0;
      let totalCoeffs = 0;

      const gradesList = candidate.grades || [];
      gradesList.forEach((grade, idx) => {
        const rowBg = idx % 2 === 0 ? '#ffffff' : '#fafcfb';
        const rowH = 17;
        const pts = Number(grade.score) * Number(grade.coefficient);
        totalPoints += pts;
        totalCoeffs += Number(grade.coefficient);

        doc.rect(leftMargin, currentY, tableW, rowH).fill(rowBg);
        doc.font('Helvetica').fontSize(8).fillColor('#1b2924')
          .text(grade.subject, colSubjectX + 10, currentY + 4);
        doc.font('Helvetica-Bold').fontSize(8).fillColor('#1b2924')
          .text(formatNumber(grade.score), colScoreX, currentY + 4, { width: 70, align: 'right' });
        doc.font('Helvetica').fontSize(8).fillColor('#6c7873')
          .text(String(grade.coefficient), colCoeffX, currentY + 4, { width: 60, align: 'right' });
        doc.font('Helvetica-Bold').fontSize(8).fillColor('#2c3934')
          .text(formatNumber(pts), colPointsX, currentY + 4, { width: 85, align: 'right' });

        // Ligne séparatrice fine
        doc.moveTo(leftMargin, currentY + rowH).lineTo(rightMargin, currentY + rowH).strokeColor('#eef2f0').stroke();
        currentY += rowH;
      });

      // Ligne Totaux
      const totH = 20;
      doc.rect(leftMargin, currentY, tableW, totH).fill('#edf4f0');
      doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#004c2c')
        .text("TOTAL DES POINTS ET COEFFICIENTS", colSubjectX + 10, currentY + 5);
      doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#004c2c')
        .text(String(totalCoeffs), colCoeffX, currentY + 5, { width: 60, align: 'right' });
      doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#004c2c')
        .text(formatNumber(totalPoints), colPointsX, currentY + 5, { width: 85, align: 'right' });

      currentY += totH + 12;

      // ============================================================================
      // SECTION 3 : DÉCISION DU JURY & MOYENNE GÉNÉRALE
      // ============================================================================
      const decisionH = 58;
      const isSuccess = candidate.status === 'Admis';
      const isEligible = candidate.status === 'Admissible';
      const statusBg = isSuccess ? '#e5f4eb' : (isEligible ? '#fff8e6' : '#fde8e8');
      const statusColor = isSuccess ? '#006b3f' : (isEligible ? '#a7670e' : '#b32025');

      doc.rect(leftMargin, currentY, usableWidth, decisionH).fillAndStroke('#ffffff', '#dbe5df');

      // Bloc Moyenne
      doc.rect(leftMargin, currentY, 160, decisionH).fill('#f5f8f6');
      doc.font('Helvetica').fontSize(7.5).fillColor('#6c7873')
        .text("MOYENNE GÉNÉRALE :", leftMargin + 15, currentY + 10);
      doc.font('Helvetica-Bold').fontSize(22).fillColor('#004c2c')
        .text(`${formatNumber(candidate.average)} / 20`, leftMargin + 15, currentY + 23);

      // Bloc résultat simulé
      const decX = leftMargin + 175;
      doc.font('Helvetica').fontSize(7.5).fillColor('#6c7873')
        .text("RÉSULTAT DE DÉMONSTRATION :", decX, currentY + 10);
      
      const statusLabel = candidate.status.toUpperCase() === 'ADMIS' 
        ? 'DÉCLARÉ(E) ADMIS(E)' 
        : (candidate.status.toUpperCase() === 'ADMISSIBLE' ? 'DÉCLARÉ(E) ADMISSIBLE (2ND TOUR)' : 'AJOURNÉ(E) / REFUSÉ(E)');
      
      doc.font('Helvetica-Bold').fontSize(14).fillColor(statusColor)
        .text(statusLabel, decX, currentY + 22);

      // Mention
      if (candidate.mention && candidate.mention !== '—') {
        doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#2c3934')
          .text(`MENTION : ${candidate.mention.toUpperCase()}`, decX, currentY + 41);
      }

      currentY += decisionH + 16;

      // ============================================================================
      // SECTION 4 : VÉRIFICATION DE L'EXEMPLE
      // ============================================================================
      const authBoxH = 82;
      doc.rect(leftMargin, currentY, usableWidth, authBoxH).fillAndStroke('#fafcfb', '#006b3f');

      // Insertion de l'image QR Code
      doc.image(qrCodeBuffer, leftMargin + 10, currentY + 8, { width: 66, height: 66 });

      const authTextX = leftMargin + 85;
      doc.font('Helvetica-Bold').fontSize(9).fillColor('#004c2c')
        .text("VÉRIFICATION DE L'EXEMPLE FICTIF", authTextX, currentY + 10);

      doc.font('Helvetica').fontSize(7.5).fillColor('#2c3934')
        .text(
          "Ce document est un exemple généré avec des données fictives. Il n'a aucune valeur officielle, " +
          "ne certifie aucun résultat réel et ne peut pas servir de justificatif.",
          authTextX,
          currentY + 23,
          { width: usableWidth - 95, lineGap: 1 }
        );

      doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#1b2924')
        .text(`CODE DE DÉMONSTRATION : `, authTextX, currentY + 57, { continued: true });
      doc.font('Helvetica-Bold').fontSize(9).fillColor('#006b3f')
        .text(candidate.verification_code);

      doc.font('Helvetica-Oblique').fontSize(7).fillColor('#6c7873')
        .text(`Lien direct : ${verificationUrl}`, authTextX, currentY + 69, { width: usableWidth - 95 });

      // ============================================================================
      // AVERTISSEMENT DE FIN DE PAGE
      // ============================================================================
      const footY = doc.page.height - 50;

      doc.moveTo(leftMargin, footY).lineTo(rightMargin, footY).strokeColor('#c8ded2').stroke();

      doc.font('Helvetica').fontSize(7).fillColor('#6c7873')
        .text(
          "Projet indépendant · Données fictives · Document sans valeur officielle.",
          leftMargin,
          footY + 6,
          { align: 'center', width: usableWidth }
        );
      // Finalisation du document
      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

module.exports = {
  generateCandidatePdf
};
