const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');
const { generateVerificationCode } = require('./services/verificationCode');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: Number(process.env.DB_POOL_MAX || 20),
  ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: true } : undefined
});

const schemaSql = fs.readFileSync(path.join(__dirname, 'migrations', '001_initial.sql'), 'utf8');
const verificationCodeMigrationSql = fs.readFileSync(
  path.join(__dirname, 'migrations', '002_opaque_verification_codes.sql'),
  'utf8'
);

let ready;
async function applyVerificationCodeMigration() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const migration = await client.query(
      `INSERT INTO schema_migrations(version) VALUES ('002_opaque_verification_codes')
       ON CONFLICT (version) DO NOTHING RETURNING version`
    );
    if (migration.rowCount > 0) await client.query(verificationCodeMigrationSql);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function migrate() {
  if (!ready) {
    ready = (async () => {
      await pool.query(schemaSql);
      await pool.query(
        `INSERT INTO schema_migrations(version) VALUES ('001_initial')
         ON CONFLICT (version) DO NOTHING`
      );
      await applyVerificationCodeMigration();
    })();
  }
  await ready;
}

function normalizeDate(input) {
  if (!input) return '';
  const value = String(input).trim();
  if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(value)) {
    const [year, month, day] = value.split('-');
    return `${day.padStart(2, '0')}/${month.padStart(2, '0')}/${year}`;
  }
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(value)) {
    const [day, month, year] = value.split('/');
    return `${day.padStart(2, '0')}/${month.padStart(2, '0')}/${year}`;
  }
  return value;
}

function normalizeCandidateMention(candidate) {
  if (!candidate || candidate.status !== 'Admis') return candidate;
  const average = Number(candidate.average);
  const mention = average >= 16 ? 'Très Bien' : average >= 14 ? 'Bien' : average >= 12 ? 'Assez Bien' : 'Passable';
  return { ...candidate, average, mention };
}

async function withCandidate(row) {
  if (!row) return null;
  const grades = await pool.query(
    'SELECT subject, score, coefficient FROM grades WHERE candidate_id = $1 ORDER BY id', [row.id]
  );
  return normalizeCandidateMention({
    ...row,
    average: Number(row.average),
    grades: grades.rows.map(g => ({ ...g, score: Number(g.score) }))
  });
}

async function findCandidate(exam, pvNumber, birthDate = null) {
  await migrate();
  const result = await pool.query('SELECT * FROM candidates WHERE exam = $1 AND pv_number = $2', [
    String(exam || '').trim().toUpperCase(), String(pvNumber || '').trim().toUpperCase()
  ]);
  if (!result.rows[0]) return null;
  if (birthDate && normalizeDate(birthDate) !== normalizeDate(result.rows[0].birth_date)) {
    const error = new Error('DATE_MISMATCH');
    error.code = 'DATE_MISMATCH';
    throw error;
  }
  return withCandidate(result.rows[0]);
}

async function findCandidateByPv(pvNumber) {
  await migrate();
  const result = await pool.query('SELECT * FROM candidates WHERE pv_number = $1', [
    String(pvNumber || '').trim().toUpperCase()
  ]);
  return withCandidate(result.rows[0]);
}

async function verifyCandidateByCode(code) {
  await migrate();
  const result = await pool.query('SELECT * FROM candidates WHERE verification_code = $1', [
    String(code || '').trim().toUpperCase()
  ]);
  return withCandidate(result.rows[0]);
}

function addRate(row) {
  return { ...row, total: Number(row.total), admitted: Number(row.admitted), eligible: Number(row.eligible), failed: Number(row.failed), rate: row.total ? Number((row.admitted / row.total * 100).toFixed(1)) : 0 };
}
async function getStatistics() {
  await migrate();
  const [global, byExam, bySeries, byRegion, byGender] = await Promise.all([
    pool.query(`SELECT COUNT(*)::int total, COALESCE(SUM((status='Admis')::int),0)::int admitted,
      COALESCE(SUM((status='Admissible')::int),0)::int eligible,
      COALESCE(SUM((status IN ('Refusé','Ajourné'))::int),0)::int failed,
      ROUND(COALESCE(AVG(average),0),2)::float general_avg FROM candidates`),
    pool.query(`SELECT exam, COUNT(*)::int total, SUM((status='Admis')::int)::int admitted,
      SUM((status='Admissible')::int)::int eligible, SUM((status IN ('Refusé','Ajourné'))::int)::int failed,
      ROUND(AVG(average),2)::float average_score FROM candidates GROUP BY exam`),
    pool.query(`SELECT series, COUNT(*)::int total, SUM((status='Admis')::int)::int admitted,
      SUM((status='Admissible')::int)::int eligible, SUM((status IN ('Refusé','Ajourné'))::int)::int failed,
      ROUND(AVG(average),2)::float avg_score FROM candidates WHERE exam='BAC' GROUP BY series`),
    pool.query(`SELECT region, COUNT(*)::int total, SUM((status='Admis')::int)::int admitted,
      ROUND(AVG(average),2)::float avg_score FROM candidates GROUP BY region`),
    pool.query(`SELECT gender, COUNT(*)::int total, SUM((status='Admis')::int)::int admitted,
      ROUND(AVG(average),2)::float avg_score FROM candidates GROUP BY gender`)
  ]);
  const g = global.rows[0];
  return {
    global: { ...g, successRate: g.total ? Number((g.admitted / g.total * 100).toFixed(1)) : 0 },
    byExam: byExam.rows.map(addRate), bySeries: bySeries.rows.map(addRate),
    byRegion: byRegion.rows.map(addRate), byGender: byGender.rows.map(addRate)
  };
}

async function getJuries(exam = '') {
  await migrate();
  const params = exam ? [String(exam).toUpperCase()] : [];
  const result = await pool.query(`SELECT j.*,
    (SELECT COUNT(*)::int FROM candidates c WHERE c.jury=j.name) candidate_count,
    (SELECT COUNT(*)::int FROM candidates c WHERE c.jury=j.name AND c.status='Admis') admitted_count
    FROM juries j ${exam ? 'WHERE j.exam=$1' : ''} ORDER BY j.exam,j.name`, params);
  return result.rows;
}

async function getProclamations(juryName = '', exam = '') {
  await migrate();
  const params = []; const clauses = ["j.status='Proclamé'"];
  if (exam) { params.push(String(exam).toUpperCase()); clauses.push(`c.exam=$${params.length}`); }
  if (juryName) { params.push(juryName); clauses.push(`c.jury=$${params.length}`); }
  const result = await pool.query(`SELECT c.* FROM candidates c INNER JOIN juries j ON j.name=c.jury AND j.exam=c.exam
    WHERE ${clauses.join(' AND ')} ORDER BY c.status,c.last_name,c.first_name`, params);
  return result.rows.map(row => ({ ...row, average: Number(row.average) }));
}

async function authenticateUser(identifier, password) {
  await migrate();
  const result = await pool.query('SELECT * FROM users WHERE username=$1 OR email=$1', [String(identifier || '').trim()]);
  const user = result.rows[0];
  if (!user || !(await bcrypt.compare(String(password || ''), user.password_hash))) return null;
  const { password_hash, ...safeUser } = user;
  return safeUser;
}

async function createAdminUser({ username, email, password, full_name, role = 'superadmin' }) {
  await migrate();
  if (!username || !email || !password || !full_name) throw new Error('username, email, password et full_name sont requis');
  if (String(password).length < 12) throw new Error('Le mot de passe doit comporter au moins 12 caractères');
  if (!['superadmin', 'dgec_agent', 'jury_president'].includes(role)) throw new Error('Rôle administrateur invalide');
  const hash = await bcrypt.hash(password, 12);
  const result = await pool.query(`INSERT INTO users(username,email,password_hash,full_name,role)
    VALUES($1,$2,$3,$4,$5) ON CONFLICT(username) DO UPDATE SET email=EXCLUDED.email,
    password_hash=EXCLUDED.password_hash,full_name=EXCLUDED.full_name,role=EXCLUDED.role RETURNING id,username,email,role`,
    [username.trim(), email.trim().toLowerCase(), hash, full_name.trim(), role]);
  return result.rows[0];
}

async function logAudit({ user, action, resourceType = null, resourceId = null, metadata = {}, ipAddress = null }) {
  await migrate();
  const result = await pool.query(`INSERT INTO audit_logs(user_id,username,action,resource_type,resource_id,metadata,ip_address)
    VALUES($1,$2,$3,$4,$5,$6::jsonb,$7) RETURNING id`, [
    user && user.id ? user.id : null, user && (user.username || user.email) || null,
    action, resourceType, resourceId, JSON.stringify(metadata), ipAddress || null
  ]);
  return result.rows[0].id;
}

async function createClaim(data) {
  await migrate();
  const claimNumber = `REC-${new Date().getFullYear()}-${crypto.randomUUID().replace(/-/g, '').toUpperCase()}`;
  const result = await pool.query(`INSERT INTO claims(claim_number,pv_number,candidate_name,exam,claim_type,description,phone,email)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`, [
    claimNumber, String(data.pv_number).toUpperCase().trim(), String(data.candidate_name).trim(),
    String(data.exam).toUpperCase().trim(), data.claim_type, String(data.description).trim(),
    String(data.phone).trim(), data.email ? String(data.email).trim() : null
  ]);
  return { id: result.rows[0].id, claimNumber };
}
async function getClaimByNumber(number) {
  await migrate();
  const result = await pool.query('SELECT * FROM claims WHERE claim_number=$1', [String(number || '').trim().toUpperCase()]);
  return result.rows[0] || null;
}
async function getClaims(status = '') {
  await migrate();
  const result = await pool.query(`SELECT * FROM claims ${status ? 'WHERE status=$1' : ''} ORDER BY id DESC`, status ? [status] : []);
  return result.rows;
}
async function updateClaimStatus(id, status, notes = '') {
  await migrate();
  const result = await pool.query('UPDATE claims SET status=$1,admin_notes=$2 WHERE id=$3', [status, notes, id]);
  return result.rowCount > 0;
}
async function updateJuryStatus(id, status) {
  await migrate();
  const result = await pool.query('UPDATE juries SET status=$1,proclaimed_at=CASE WHEN $1=\'Proclamé\' THEN now() ELSE proclaimed_at END WHERE id=$2', [status, id]);
  return result.rowCount > 0;
}

async function createCandidateAccount({ phone, email, password, full_name }) {
  await migrate();
  if (!/^\+?[0-9 ]{8,20}$/.test(String(phone || '').trim()) || String(password || '').length < 8) throw new Error('Téléphone ou mot de passe invalide');
  const hash = await bcrypt.hash(String(password), 12);
  const result = await pool.query(`INSERT INTO candidate_accounts(phone,email,password_hash,full_name)
    VALUES($1,$2,$3,$4) RETURNING id,phone,email,full_name`, [String(phone).trim(), email ? String(email).trim().toLowerCase() : null, hash, String(full_name || '').trim()]);
  return result.rows[0];
}

async function authenticateCandidate(phone, password) {
  await migrate();
  const result = await pool.query('SELECT * FROM candidate_accounts WHERE phone=$1', [String(phone || '').trim()]);
  const account = result.rows[0];
  if (!account || !(await bcrypt.compare(String(password || ''), account.password_hash))) return null;
  const { password_hash, ...safeAccount } = account;
  return safeAccount;
}

async function createRegistration(accountId, data) {
  await migrate();
  const campaign = await pool.query(`SELECT * FROM exam_campaigns WHERE exam=$1 AND session_year=$2 AND status='Ouverte'`, [data.exam, data.session_year]);
  if (!campaign.rows[0]) throw new Error('Aucune campagne ouverte pour cet examen');
  const registrationNumber = `INS-${String(data.exam).toUpperCase()}-${data.session_year}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
  const result = await pool.query(`INSERT INTO exam_registrations(registration_number,account_id,campaign_id,first_name,last_name,birth_date,birth_place,gender,school,series,region,province,center,status)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'À payer') RETURNING id,registration_number,status`, [registrationNumber, accountId, campaign.rows[0].id, data.first_name.trim(), data.last_name.trim().toUpperCase(), normalizeDate(data.birth_date), data.birth_place.trim(), data.gender, data.school || null, data.series || 'Général', data.region.trim(), data.province.trim(), data.center.trim()]);
  return { ...result.rows[0], fee: Number(campaign.rows[0].fee) };
}

async function listRegistrations(accountId) {
  await migrate();
  const result = await pool.query(`SELECT r.*, c.exam, c.session_year, c.fee FROM exam_registrations r INNER JOIN exam_campaigns c ON c.id=r.campaign_id WHERE r.account_id=$1 ORDER BY r.id DESC`, [accountId]);
  return result.rows.map(row => ({ ...row, fee: Number(row.fee) }));
}

async function createSimulatedPayment(accountId, registrationId, provider) {
  await migrate();
  const registration = await pool.query(`SELECT r.*, c.session_year, c.fee FROM exam_registrations r INNER JOIN exam_campaigns c ON c.id=r.campaign_id WHERE r.id=$1 AND r.account_id=$2`, [registrationId, accountId]);
  if (!registration.rows[0]) throw new Error('Dossier introuvable');
  const row = registration.rows[0];
  const reference = `PAY-${row.session_year}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const payment = await client.query(`INSERT INTO payment_orders(payment_reference,registration_id,provider,amount,status) VALUES($1,$2,$3,$4,'Payé') RETURNING id`, [reference, registrationId, provider, row.fee]);
    await client.query(`INSERT INTO payment_events(payment_order_id,event_type,payload) VALUES($1,'simulation.paid',$2::jsonb)`, [payment.rows[0].id, JSON.stringify({ simulated: true })]);
    await client.query(`UPDATE exam_registrations SET status='Payé',updated_at=now() WHERE id=$1`, [registrationId]);
    await client.query('COMMIT');
    return { payment_reference: reference, amount: Number(row.fee), status: 'Payé', registration_number: row.registration_number };
  } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
}

async function addRegistrationDocument(accountId, registrationId, document) {
  await migrate();
  const owner = await pool.query('SELECT id FROM exam_registrations WHERE id=$1 AND account_id=$2', [registrationId, accountId]);
  if (!owner.rows[0]) throw new Error('Dossier introuvable');
  const result = await pool.query(`INSERT INTO registration_documents(registration_id,document_type,original_name,mime_type,content)
    VALUES($1,$2,$3,$4,$5) RETURNING id,document_type,original_name,status`, [registrationId, document.document_type, document.original_name, document.mime_type, document.content]);
  return result.rows[0];
}

async function listRegistrationDocuments(accountId, registrationId) {
  await migrate();
  const result = await pool.query(`SELECT d.id,d.registration_id,d.document_type,d.original_name,d.mime_type,d.status,d.admin_note,d.created_at
    FROM registration_documents d INNER JOIN exam_registrations r ON r.id=d.registration_id WHERE r.id=$1 AND r.account_id=$2 ORDER BY d.id DESC`, [registrationId, accountId]);
  return result.rows;
}

async function getCampaigns() {
  await migrate();
  const result = await pool.query('SELECT * FROM exam_campaigns ORDER BY session_year DESC, exam');
  return result.rows.map(row => ({ ...row, fee: Number(row.fee) }));
}

async function updateCampaignStatus(id, status) {
  await migrate();
  const result = await pool.query('UPDATE exam_campaigns SET status=$1 WHERE id=$2', [status, id]);
  return result.rowCount > 0;
}

async function importCandidatesBatch(items) {
  await migrate();
  if (!Array.isArray(items) || !items.length) return { inserted: 0, errors: [] };
  const client = await pool.connect(); let inserted = 0; const errors = [];
  try {
    await client.query('BEGIN');
    for (const item of items) {
      try {
        const values = [
          item.exam, String(item.pv_number).toUpperCase().trim(), String(item.first_name).trim(),
          String(item.last_name).trim().toUpperCase(), normalizeDate(item.birth_date),
          item.birth_place || 'Burkina Faso', item.gender || 'Masculin', item.center || 'Centre Général',
          item.jury || 'Jury Central', item.series || 'Général', Number(item.session_year) || 2026,
          item.round || '1er tour', item.region || 'Centre', item.province || 'Kadiogo',
          item.status || 'Admis', item.mention || 'Passable', Number(item.average) || 10,
          item.verification_code || generateVerificationCode(item.exam, item.pv_number, item.session_year || 2026)
        ];
        const result = await client.query(`INSERT INTO candidates(exam,pv_number,first_name,last_name,birth_date,birth_place,
          gender,center,jury,series,session_year,round,region,province,status,mention,average,verification_code)
          VALUES(${values.map((_, i) => `$${i + 1}`).join(',')})
          ON CONFLICT(pv_number) DO UPDATE SET first_name=EXCLUDED.first_name,last_name=EXCLUDED.last_name,
          birth_date=EXCLUDED.birth_date,status=EXCLUDED.status,mention=EXCLUDED.mention,average=EXCLUDED.average,
          verification_code=EXCLUDED.verification_code RETURNING id`, values);
        const id = result.rows[0].id; inserted++;
        await client.query('DELETE FROM grades WHERE candidate_id=$1', [id]);
        for (const grade of item.grades || []) {
          await client.query('INSERT INTO grades(candidate_id,subject,score,coefficient) VALUES($1,$2,$3,$4)',
            [id, grade.subject, Number(grade.score) || 0, Number(grade.coefficient) || 1]);
        }
      } catch (error) { errors.push(`PV ${item.pv_number}: ${error.message}`); }
    }
    await client.query('COMMIT');
    return { inserted, errors };
  } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
}

migrate().catch(error => console.error('PostgreSQL migration error:', error.message));

module.exports = {
  database: pool, pool, migrate, findCandidate, findCandidateByPv, verifyCandidateByCode,
  getStatistics, getJuries, getProclamations, authenticateUser, createAdminUser, logAudit,
  createClaim, getClaimByNumber, getClaims, updateClaimStatus, updateJuryStatus,
  importCandidatesBatch, generateVerificationCode, normalizeDate,
  createCandidateAccount, authenticateCandidate, createRegistration, listRegistrations, createSimulatedPayment,
  addRegistrationDocument, listRegistrationDocuments, getCampaigns, updateCampaignStatus,
};
