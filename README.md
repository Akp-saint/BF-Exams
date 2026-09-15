# Portail National des Résultats d'Examens — Burkina Faso

Plateforme officielle de consultation, de certification et de proclamation des résultats aux examens nationaux du Burkina Faso (CEP, BEPC, Baccalauréat), opérée sous l'égide du Ministère de l'Éducation Nationale, de l'Alphabétisation et de la Promotion des Langues Nationales (MENAPLN) et de la Direction Générale des Examens et Concours (DGEC).

---

## 🌟 Fonctionnalités Majeures Implémentées

1. **Consultation Sécurisée (Normes CIL Burkina Faso)** :
   - Recherche protégée par **Numéro de PV + Date de naissance** (garantie de confidentialité des notes).
   - Défi **Captcha anti-robot** local stateless (fonctionne sans clé externe ni connexion Internet).

2. **Métier et Spécificités Burkinabè Réelles** :
   - Prise en compte des **Séries du BAC** (Séries D, A4, C, G2...).
   - Gestion des **Tours de délibération** : *Admis d'office (1er tour)*, *Admissible (2nd tour oral/écrit)*, *Refusé/Ajourné*.
   - Découpage territorial officiel (Régions, Provinces, Centres, Jurys).

3. **Relevé Officiel en PDF Vectoriel & QR Code Certifié** :
   - Génération dynamique de l'attestation/relevé de notes officiel (A4) avec armoiries et devise nationale.
   - **QR Code scannable** haute résolution menant vers l'URL officielle de vérification.
   - Route de vérification publique `/verifier/:code` permettant aux universités et employeurs d'attester l'authenticité d'un document en temps réel.

4. **Espace d'Administration & Back-Office DGEC (`/admin`)** :
   - Authentification sécurisée par mot de passe haché (`bcrypt`) et session protégée.
   - Tableau de bord national avec indicateurs clés (candidats, taux de réussite, jurys proclamés).
   - **Importation massive par fichier CSV / Excel** avec calcul automatique des moyennes et génération des codes de vérification.
   - Proclamation et dépublication des jurys en un clic.
   - Instruction et traitement des réclamations candidats.

5. **Transparence & Proclamations Publiques** :
   - **Statistiques Nationales (`/statistiques`)** : Taux de réussite global, par examen, par série (BAC), par région et par genre (filles/garçons).
   - **Babillard Numérique des Jurys (`/proclamations`)** : Consultation des listes des admis par jury et centre d'examen.
   - **Module de Réclamations en Ligne (`/reclamation`)** : Dépôt de requêtes et suivi par numéro de dossier (`REC-2026-XXXX`).

6. **API REST & Passerelle SMS Télécoms** :
   - Endpoint REST JSON : `/api/v1/resultats?exam=BAC&pv=BAC-2026-0837&dob=22/09/2007`.
   - Webhook SMS : `/api/v1/sms-webhook` pour intégration avec les opérateurs (Orange, Moov, Telecel).
   - Endpoint de santé système pour Docker/Kubernetes : `GET /health`.

7. **Inscription candidat et paiement simulé** :
   - Création d'un compte candidat par téléphone et mot de passe.
   - Création et suivi d'un dossier CEP, BEPC ou BAC dans `/espace-candidat`.
   - Paiement de démonstration isolé par dossier, avec référence et historique technique.
   - Les opérateurs affichés sont Orange Money, Moov Money, Telecel Money et Guichet ; aucun débit réel n'est effectué.
   - Les pages publiques de proclamation n'affichent plus les noms, notes ou codes individuels.
   - Dépôt de pièces justificatives PDF/JPG/PNG limitées à 5 Mo depuis le dossier candidat.
   - Gestion DGEC des campagnes via `/admin/campagnes` : brouillon, ouverte, suspendue ou clôturée.
   - Confirmation imprimable disponible après paiement simulé ; la convocation officielle reste soumise à validation DGEC.

---

## 🚀 Démarrage Rapide

### Option A : Lancement local

```bash
# Installation des dépendances
npm install

# Exécution de la suite complète de tests automatisés (20 tests)
npm test

# Démarrage du serveur
npm start
# ou en mode développement avec rechargement automatique :
npm run dev
```

L'application est accessible à l'adresse : **[http://localhost:3000](http://localhost:3000)**.

### Parcours de démonstration candidat

1. Ouvrir [http://localhost:3000/inscription](http://localhost:3000/inscription).
2. Créer un compte avec un numéro de téléphone et un mot de passe d'au moins 8 caractères.
3. Créer un dossier, puis choisir un opérateur dans l'écran de paiement simulé.
4. Vérifier le statut `Payé` dans l'espace candidat.

En production, ce paiement doit être remplacé par un agrégateur ou les webhooks officiels des opérateurs. La confirmation ne doit jamais provenir du navigateur.

### Option B : Lancement avec Docker

```bash
copy .env.example .env
# Remplacer tous les secrets dans .env, puis :
docker compose up --build -d
docker compose exec app npm run db:migrate
```

---

## 👥 Données de Démonstration & Comptes de Test

### 1. Consultation des Candidats (Formulaire Public)

| Examen | Numéro de PV | Date de naissance | Série / Option | Résultat Officiel |
| :--- | :--- | :--- | :--- | :--- |
| **BAC** | `BAC-2026-0837` | `22/09/2007` | D (Scientifique) | **Admis** (Mention Bien, 14,63/20) |
| **BAC** | `BAC-2026-0412` | `14/04/2007` | A4 (Littéraire) | **Admissible (2nd tour)** (10,45/20) |
| **BAC** | `BAC-2026-0055` | `03/01/2007` | C (Sciences exactes) | **Admis** (Mention Très Bien, 16,85/20) |
| **BAC** | `BAC-2026-0789` | `19/08/2006` | G2 (Gestion/Compta) | **Admis** (Mention Assez Bien, 12,80/20) |
| **BAC** | `BAC-2026-0915` | `15/01/2008` | D (Scientifique) | **Refusé / Ajourné** (08,74/20) |
| **BEPC** | `BEPC-2026-0142` | `07/11/2010` | Enseignement Général | **Admis** (Mention Bien, 14,08/20) |
| **BEPC** | `BEPC-2026-0388` | `25/06/2010` | Enseignement Général | **Admissible (2nd tour)** (10,15/20) |
| **CEP** | `CEP-2026-0001` | `18/03/2014` | Certificat Primaire | **Admis** (15,25/20) |

> 🔒 **Test de sécurité CIL** : Tentez de rechercher `BAC-2026-0837` avec une mauvaise date (ex. `01/01/2000`) : le système refuse catégoriquement l'accès aux notes pour préserver la vie privée de l'élève.

### 2. Accès au Back-Office DGEC (`/admin`)

* **URL d'accès** : [http://localhost:3000/admin](http://localhost:3000/admin)
Le projet ne crée plus de compte administrateur par défaut. Créez explicitement le
premier compte depuis des variables d'environnement (dans un terminal non partagé) :

```bash
docker compose exec -e ADMIN_USERNAME=admin \
  -e ADMIN_EMAIL=admin@example.gov.bf \
  -e ADMIN_PASSWORD='un-mot-de-passe-de-12-caracteres-minimum' \
  -e ADMIN_FULL_NAME='Administrateur DGEC' \
  -e ADMIN_ROLE=superadmin app npm run admin:create
```

Les rôles sont `superadmin` (toutes les fonctions), `dgec_agent` (tableau de bord,
réclamations et import) et `jury_president` (consultation et gestion des jurys).
Les mutations administratives et les ouvertures de session sont conservées dans
`audit_logs` PostgreSQL.

---

## 📄 Format d'Importation Massif CSV

Pour importer des milliers de résultats simultanément via l'espace DGEC (`/admin/import`), préparez un fichier CSV (délimiteur `;` ou `,`) avec les colonnes suivantes :

```csv
exam;pv_number;first_name;last_name;birth_date;birth_place;gender;center;jury;series;round;region;province;status;mention;average
BAC;BAC-2026-9901;Alassane;COMPAORÉ;12/05/2007;Ouagadougou;Masculin;Lycée Nelson Mandela;Jury 01 - Ouagadougou;D (Scientifique);1er tour;Centre;Kadiogo;Admis;Bien;14.25
```

Un modèle prêt à l'emploi est téléchargeable directement sur [http://localhost:3000/admin/modele-csv](http://localhost:3000/admin/modele-csv).

---

## 🔍 Vérification d'Authenticité des Relevés (Anti-Fraude)

Chaque relevé PDF généré contient un code de vérification cryptographique unique et un QR Code.
Exemple de test :
* **URL** : [http://localhost:3000/verifier/BF-2026-BAC-0837-7D9A](http://localhost:3000/verifier/BF-2026-BAC-0837-7D9A)
* Affiche instantanément l'attestation d'authenticité de l'État burkinabè, les notes certifiées et la décision officielle.

---

## 🧪 Tests Automatisés

La plateforme inclut une suite de tests unitaires et d'intégration native `node --test` :

```bash
npm test
```

**20 tests automatisés** couvrent :
1. Recherche et intégrité de la base PostgreSQL
2. Protection de la confidentialité CIL (rejet si date non concordante)
3. Gestion des admissibilités au second tour
4. Certification QR Code et détection de faux documents
5. Calcul des statistiques consolidées et par série
6. Authentification administrative bcrypt
7. Moteur de captcha arithmétique stateless
8. Génération vectorielle du PDF officiel A4
9. Endpoints API REST et Webhook SMS opérateurs
10. Health check `/health`

## Migration de production (PostgreSQL + Redis + Nginx)

PostgreSQL est obligatoire pour l'application et les sessions Express sont
stockées dans Redis (`REDIS_URL`). Le schéma est créé par `npm run db:migrate`
(idempotent). En dehors des tests isolés, l'application refuse de démarrer si
`DATABASE_URL` n'est pas défini.

### Sécurité de production

`SMS_WEBHOOK_SECRET` doit être défini dans `.env` avec une valeur aléatoire d'au moins 32 caractères. Le webhook SMS refuse toute requête sans cet en-tête partagé en production. Les pièces justificatives sont limitées à 5 Mo et leur signature binaire est contrôlée côté serveur ; le type MIME déclaré par le navigateur n'est pas suffisant.

Sauvegarde/restauration :

```bash
$env:DATABASE_URL='postgresql://...'
./scripts/backup-postgres.sh
./scripts/restore-postgres.sh   # BACKUP_FILE=backups/resultats-....dump
# Windows : .\scripts\backup-postgres.ps1 puis .\scripts\restore-postgres.ps1 -BackupFile ...
```

Le reverse proxy Nginx expose le port 80. Pour du HTTPS local, générer un certificat
auto-signé non secret (`.\scripts\generate-dev-certs.ps1`), monter `nginx/certs`,
utiliser le fichier Compose HTTPS prévu et publier le port 443 :

```powershell
.\scripts\generate-dev-certs.ps1
docker compose -f docker-compose.yml -f docker-compose.https.yml up -d
```

Ces certificats sont réservés au développement : utiliser une AC approuvée
et des secrets gérés hors du dépôt en production.

Un test de charge sans dépendance est disponible avec `npm run load:test`; il cible
`/health` et accepte `LOAD_TEST_URL`, `LOAD_TEST_REQUESTS` et
`LOAD_TEST_CONCURRENCY`.
