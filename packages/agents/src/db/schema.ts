export const SCHEMA = `
CREATE TABLE IF NOT EXISTS campaigns (
  id TEXT PRIMARY KEY,
  ngo_name TEXT NOT NULL,
  ngo_telegram_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  sector TEXT NOT NULL,
  country TEXT NOT NULL,
  funding_goal REAL NOT NULL,
  status TEXT DEFAULT 'pending',
  evaluation_score REAL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  funded_at TEXT,
  completed_at TEXT
);

CREATE TABLE IF NOT EXISTS milestones (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES campaigns(id),
  number INTEGER NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  evidence_file_ids TEXT,
  feedback TEXT,
  submitted_at TEXT,
  approved_at TEXT
);

CREATE TABLE IF NOT EXISTS escrows (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES campaigns(id),
  milestone_number INTEGER NOT NULL,
  tx_hash TEXT NOT NULL,
  sequence INTEGER NOT NULL,
  owner_address TEXT NOT NULL,
  destination_address TEXT NOT NULL,
  condition TEXT NOT NULL,
  fulfillment TEXT NOT NULL,
  amount TEXT NOT NULL,
  cancel_after TEXT NOT NULL,
  status TEXT DEFAULT 'active',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  released_at TEXT
);

CREATE TABLE IF NOT EXISTS fund_allocations (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES campaigns(id),
  amount TEXT NOT NULL,
  treasury_balance_before TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS trust_scores (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES campaigns(id),
  ngo_name TEXT NOT NULL,
  ngo_telegram_id TEXT NOT NULL,
  score REAL NOT NULL,
  breakdown TEXT NOT NULL,
  oracle_tx_hash TEXT,
  credential_tx_hash TEXT,
  completed_at TEXT DEFAULT CURRENT_TIMESTAMP
);
`;
