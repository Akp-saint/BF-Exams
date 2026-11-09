UPDATE candidates
SET verification_code = 'BF-' || upper(gen_random_uuid()::text);

UPDATE claims
SET claim_number = 'REC-' || extract(year FROM created_at)::integer::text || '-'
  || upper(replace(gen_random_uuid()::text, '-', ''));
