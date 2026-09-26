// Database schema. Every statement is idempotent and runs on first connect.

export const SCHEMA_SQL: string[] = [
  `CREATE TABLE IF NOT EXISTS operatives (
    id uuid PRIMARY KEY,
    name text NOT NULL,
    name_key text NOT NULL UNIQUE,
    pin_hash text NOT NULL,
    role text NOT NULL DEFAULT 'operative' CHECK (role IN ('operative','admin')),
    active boolean NOT NULL DEFAULT true,
    failed_pins int NOT NULL DEFAULT 0,
    locked_until timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS sessions (
    token_hash text PRIMARY KEY,
    operative_id uuid NOT NULL REFERENCES operatives(id),
    user_agent text,
    created_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS vehicles (
    id serial PRIMARY KEY,
    reg text NOT NULL UNIQUE,
    active boolean NOT NULL DEFAULT true
  )`,
  `CREATE TABLE IF NOT EXISTS sites (
    id serial PRIMARY KEY,
    name text NOT NULL,
    address text NOT NULL,
    permit_no text NOT NULL,
    last_checked date,
    active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS note_counters (
    day text PRIMARY KEY,
    last int NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS notes (
    id uuid PRIMARY KEY,
    client_id uuid NOT NULL UNIQUE,
    note_no text NOT NULL UNIQUE,
    state text NOT NULL DEFAULT 'draft' CHECK (state IN ('draft','signed','cancelled')),
    operative_id uuid NOT NULL REFERENCES operatives(id),
    created_at timestamptz NOT NULL DEFAULT now(),
    signed_at timestamptz,
    transfer_at timestamptz,
    customer_name text,
    company_name text,
    postcode text,
    customer_email text,
    data jsonb,
    data_hash text,
    pdf_key text,
    pdf_sha256 text,
    email_requested boolean NOT NULL DEFAULT false,
    email_status text NOT NULL DEFAULT 'none' CHECK (email_status IN ('none','pending','sent','failed')),
    email_attempts int NOT NULL DEFAULT 0,
    email_last_error text,
    emailed_at timestamptz,
    destination jsonb,
    destination_added_at timestamptz,
    destination_pdf_key text,
    supersedes_id uuid REFERENCES notes(id),
    superseded_by_id uuid REFERENCES notes(id),
    photo_count int NOT NULL DEFAULT 0
  )`,
  `CREATE INDEX IF NOT EXISTS notes_created_idx ON notes (created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS notes_operative_idx ON notes (operative_id, created_at DESC)`,
  `CREATE TABLE IF NOT EXISTS photos (
    note_id uuid NOT NULL REFERENCES notes(id),
    idx int NOT NULL,
    storage_key text NOT NULL,
    content_type text NOT NULL,
    bytes int NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (note_id, idx)
  )`,
  `CREATE TABLE IF NOT EXISTS audit_log (
    id bigserial PRIMARY KEY,
    at timestamptz NOT NULL DEFAULT now(),
    note_id uuid,
    operative_id uuid,
    action text NOT NULL,
    detail jsonb,
    ip text,
    user_agent text
  )`,
  `CREATE INDEX IF NOT EXISTS audit_note_idx ON audit_log (note_id, at)`,
  `CREATE TABLE IF NOT EXISTS rate_events (
    key text NOT NULL,
    at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS rate_key_idx ON rate_events (key, at)`,
];
