CREATE TABLE IF NOT EXISTS schema_migrations (
  version TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS juries (
  id BIGSERIAL PRIMARY KEY, code TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
  exam TEXT NOT NULL CHECK (exam IN ('CEP','BEPC','BAC')), center TEXT NOT NULL,
  region TEXT NOT NULL, province TEXT NOT NULL, session_year INTEGER NOT NULL DEFAULT 2026,
  status TEXT NOT NULL DEFAULT 'Proclamé' CHECK (status IN ('Brouillon','Proclamé')),
  president_name TEXT, proclaimed_at TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS candidates (
  id BIGSERIAL PRIMARY KEY, exam TEXT NOT NULL CHECK (exam IN ('CEP','BEPC','BAC')),
  pv_number TEXT NOT NULL UNIQUE, first_name TEXT NOT NULL, last_name TEXT NOT NULL,
  birth_date TEXT NOT NULL, birth_place TEXT NOT NULL,
  gender TEXT NOT NULL CHECK (gender IN ('Masculin','Féminin')), center TEXT NOT NULL,
  jury TEXT NOT NULL, series TEXT NOT NULL DEFAULT 'Général',
  session_year INTEGER NOT NULL DEFAULT 2026,
  round TEXT NOT NULL DEFAULT '1er tour' CHECK (round IN ('1er tour','2nd tour')),
  region TEXT NOT NULL DEFAULT 'Centre', province TEXT NOT NULL DEFAULT 'Kadiogo',
  status TEXT NOT NULL CHECK (status IN ('Admis','Admissible','Ajourné','Refusé')),
  mention TEXT, average NUMERIC(5,2) NOT NULL, verification_code TEXT NOT NULL UNIQUE
);
CREATE TABLE IF NOT EXISTS grades (
  id BIGSERIAL PRIMARY KEY, candidate_id BIGINT NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  subject TEXT NOT NULL, score NUMERIC(5,2) NOT NULL, coefficient INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY, username TEXT NOT NULL UNIQUE, email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL, full_name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'dgec_agent' CHECK (role IN ('superadmin','dgec_agent','jury_president')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS claims (
  id BIGSERIAL PRIMARY KEY, claim_number TEXT NOT NULL UNIQUE, pv_number TEXT NOT NULL,
  candidate_name TEXT NOT NULL, exam TEXT NOT NULL, claim_type TEXT NOT NULL,
  description TEXT NOT NULL, phone TEXT NOT NULL, email TEXT,
  status TEXT NOT NULL DEFAULT 'En attente' CHECK (status IN ('En attente','En cours','Approuvée','Rejetée')),
  admin_notes TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGSERIAL PRIMARY KEY, user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  username TEXT, action TEXT NOT NULL, resource_type TEXT, resource_id TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb, ip_address INET, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_candidates_search ON candidates(exam, pv_number);
CREATE INDEX IF NOT EXISTS idx_candidates_verification ON candidates(verification_code);
CREATE INDEX IF NOT EXISTS idx_candidates_stats ON candidates(exam, session_year, status, series);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);

CREATE TABLE IF NOT EXISTS candidate_accounts (
  id BIGSERIAL PRIMARY KEY,
  phone TEXT NOT NULL UNIQUE,
  email TEXT UNIQUE,
  password_hash TEXT NOT NULL,
  full_name TEXT,
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS exam_campaigns (
  id BIGSERIAL PRIMARY KEY,
  exam TEXT NOT NULL CHECK (exam IN ('CEP','BEPC','BAC')),
  session_year INTEGER NOT NULL, label TEXT NOT NULL, fee NUMERIC(12,2) NOT NULL DEFAULT 0,
  opens_at TIMESTAMPTZ NOT NULL, closes_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'Ouverte' CHECK (status IN ('Brouillon','Ouverte','Suspendue','Clôturée')),
  UNIQUE(exam, session_year)
);
INSERT INTO exam_campaigns(exam,session_year,label,fee,opens_at,closes_at,status)
VALUES ('BAC',2026,'Inscription au Baccalauréat 2026',5000,now(),now()+interval '365 days','Ouverte'),
       ('BEPC',2026,'Inscription au BEPC 2026',3000,now(),now()+interval '365 days','Ouverte'),
       ('CEP',2026,'Inscription au CEP 2026',2000,now(),now()+interval '365 days','Ouverte')
ON CONFLICT (exam,session_year) DO NOTHING;
CREATE TABLE IF NOT EXISTS exam_registrations (
  id BIGSERIAL PRIMARY KEY, registration_number TEXT NOT NULL UNIQUE,
  account_id BIGINT NOT NULL REFERENCES candidate_accounts(id) ON DELETE CASCADE,
  campaign_id BIGINT NOT NULL REFERENCES exam_campaigns(id), first_name TEXT NOT NULL,
  last_name TEXT NOT NULL, birth_date TEXT NOT NULL, birth_place TEXT NOT NULL,
  gender TEXT NOT NULL CHECK (gender IN ('Masculin','Féminin')), school TEXT,
  series TEXT NOT NULL DEFAULT 'Général', region TEXT NOT NULL, province TEXT NOT NULL,
  center TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'Brouillon'
    CHECK (status IN ('Brouillon','À payer','Payé','Validé','Rejeté')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS payment_orders (
  id BIGSERIAL PRIMARY KEY, payment_reference TEXT NOT NULL UNIQUE,
  registration_id BIGINT NOT NULL REFERENCES exam_registrations(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('Orange Money','Moov Money','Telecel Money','Guichet')),
  amount NUMERIC(12,2) NOT NULL, status TEXT NOT NULL DEFAULT 'En attente'
    CHECK (status IN ('Créé','En attente','Payé','Échoué','Expiré','Remboursé')),
  paid_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS payment_events (
  id BIGSERIAL PRIMARY KEY, payment_order_id BIGINT NOT NULL REFERENCES payment_orders(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL, payload JSONB NOT NULL DEFAULT '{}'::jsonb, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_registrations_account ON exam_registrations(account_id, status);
CREATE INDEX IF NOT EXISTS idx_payments_registration ON payment_orders(registration_id, status);
CREATE TABLE IF NOT EXISTS registration_documents (
  id BIGSERIAL PRIMARY KEY, registration_id BIGINT NOT NULL REFERENCES exam_registrations(id) ON DELETE CASCADE,
  document_type TEXT NOT NULL, original_name TEXT NOT NULL, mime_type TEXT NOT NULL, content BYTEA NOT NULL,
  status TEXT NOT NULL DEFAULT 'À vérifier', admin_note TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
