# Examens BF — projet de démonstration

Projet indépendant illustrant un portail de consultation et d'inscription aux examens. Il n'est ni un service officiel, ni affilié ou approuvé par le MENAPLN, la DGEC ou une autre administration. Les candidats, dates de naissance, notes, codes et résultats présents dans les exemples sont fictifs ; n'ajoutez jamais de données personnelles réelles.

Les relevés, vérifications et paiements de cette application sont simulés et n'ont aucune valeur officielle ou administrative. Ne les utilisez pas comme justificatifs.

---

## 🌟 Fonctionnalités Majeures Implémentées

1. **Consultation de démonstration** :
   - Recherche d'exemples fictifs par numéro de PV et date de naissance.
   - Défi arithmétique simple ; ce n'est pas une protection anti-bot suffisante pour une production.

2. **Contexte d'exemple burkinabè** :
   - Prise en compte des **Séries du BAC** (Séries D, A4, C, G2...).
   - Gestion des **Tours de délibération** : *Admis d'office (1er tour)*, *Admissible (2nd tour oral/écrit)*, *Refusé/Ajourné*.
   - Références géographiques d'exemple (Régions, Provinces, Centres, Jurys).

3. **Relevé PDF de démonstration & code opaque** :
   - Génération d'un exemple PDF A4 et d'un QR code de démonstration.
   - Route `/verifier/:code` pour tester la vérification d'un exemple fictif.

4. **Espace d'administration de démonstration (`/admin`)** :
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
   - Gestion des campagnes d'exemple via `/admin/campagnes`.
   - Confirmation imprimable uniquement pour le parcours simulé.

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

Ce parcours ne traite aucun paiement réel et ne doit pas être utilisé en production.

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

| Examen | Numéro de PV fictif | Date fictive | Série / Option | Résultat fictif |
| :--- | :--- | :--- | :--- | :--- |
| **BAC** | `BAC-2026-0837` | `22/09/2007` | D (Scientifique) | **Admis** (Mention Bien, 14,63/20) |
| **BAC** | `BAC-2026-0412` | `14/04/2007` | A4 (Littéraire) | **Admissible (2nd tour)** (10,45/20) |
| **BAC** | `BAC-2026-0055` | `03/01/2007` | C (Sciences exactes) | **Admis** (Mention Très Bien, 16,85/20) |
| **BAC** | `BAC-2026-0789` | `19/08/2006` | G2 (Gestion/Compta) | **Admis** (Mention Assez Bien, 12,80/20) |
| **BAC** | `BAC-2026-0915` | `15/01/2008` | D (Scientifique) | **Refusé / Ajourné** (08,74/20) |
| **BEPC** | `BEPC-2026-0142` | `07/11/2010` | Enseignement Général | **Admis** (Mention Bien, 14,08/20) |
| **BEPC** | `BEPC-2026-0388` | `25/06/2010` | Enseignement Général | **Admissible (2nd tour)** (10,15/20) |
| **CEP** | `CEP-2026-0001` | `18/03/2014` | Certificat Primaire | **Admis** (15,25/20) |

> Test fonctionnel : la recherche de `BAC-2026-0837` avec une date incorrecte (ex. `01/01/2000`) est refusée.

### 2. Administration de démonstration (`/admin`)

* **URL d'accès** : [http://localhost:3000/admin](http://localhost:3000/admin)
Le projet ne crée plus de compte administrateur par défaut. Créez explicitement le
premier compte depuis des variables d'environnement (dans un terminal non partagé) :

```bash
docker compose exec -e ADMIN_USERNAME=admin \
  -e ADMIN_EMAIL=admin@example.gov.bf \
  -e ADMIN_PASSWORD='un-mot-de-passe-de-12-caracteres-minimum' \
  -e ADMIN_FULL_NAME='Administrateur démo' \
  -e ADMIN_ROLE=superadmin app npm run admin:create
```

Les rôles sont `superadmin` (toutes les fonctions), `dgec_agent` (tableau de bord,
réclamations et import) et `jury_president` (consultation et gestion des jurys).
Les mutations administratives et les ouvertures de session sont conservées dans
`audit_logs` PostgreSQL.

---

## 📄 Format d'import CSV de démonstration

Pour tester l'import d'exemples via l'administration de démonstration (`/admin/import`), préparez un petit fichier CSV (délimiteur `;` ou `,`) avec les colonnes suivantes :

```csv
exam;pv_number;first_name;last_name;birth_date;birth_place;gender;center;jury;series;round;region;province;status;mention;average
BAC;BAC-2026-9901;Alassane;COMPAORÉ;12/05/2007;Ouagadougou;Masculin;Lycée Nelson Mandela;Jury 01 - Ouagadougou;D (Scientifique);1er tour;Centre;Kadiogo;Admis;Bien;14.25
```

Un modèle prêt à l'emploi est téléchargeable directement sur [http://localhost:3000/admin/modele-csv](http://localhost:3000/admin/modele-csv).

---

## 🔍 Vérification d'un exemple fictif

Chaque PDF de démonstration contient un code de vérification opaque et un QR Code. Exemple fictif :
* **URL** : [http://localhost:3000/verifier/TEST-00000000000000000000000000000001](http://localhost:3000/verifier/TEST-00000000000000000000000000000001)
* La page confirme uniquement la présence de l'exemple dans le jeu de données local ; elle ne certifie aucun document réel.

---

## 🧪 Tests Automatisés

La plateforme inclut une suite de tests unitaires et d'intégration native `node --test` :

```bash
npm test
```

Les tests automatisés couvrent :
1. Recherche et intégrité de la base PostgreSQL
2. Rejet si la date de naissance de l'exemple ne concorde pas
3. Gestion des admissibilités au second tour
4. Vérification des codes de démonstration
5. Calcul des statistiques consolidées et par série
6. Authentification administrative bcrypt
7. Moteur de captcha arithmétique stateless
8. Génération du PDF fictif A4
9. Endpoints API REST et Webhook SMS opérateurs
10. Health check `/health`

## Configuration locale (PostgreSQL + Redis + Nginx)

PostgreSQL est obligatoire pour l'application et les sessions Express sont
stockées dans Redis (`REDIS_URL`). Le schéma est créé par `npm run db:migrate`
(idempotent). En dehors des tests isolés, l'application refuse de démarrer si
`DATABASE_URL` n'est pas défini.

### Limites de sécurité

Cette application est une démonstration, pas un service prêt pour la production. N'y importez pas de données réelles ni de documents d'identité. Le défi arithmétique et la limitation de requêtes intégrée ne remplacent pas une protection anti-abus adaptée à une vraie plateforme.

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

La migration des codes opaques invalide les anciens liens de démonstration et numéros de réclamation. Ces certificats sont réservés au développement. Une vraie plateforme nécessiterait une revue indépendante, une infrastructure TLS appropriée et des secrets gérés hors du dépôt.

Un test de charge sans dépendance est disponible avec `npm run load:test`; il cible
`/health` et accepte `LOAD_TEST_URL`, `LOAD_TEST_REQUESTS` et
`LOAD_TEST_CONCURRENCY`.
