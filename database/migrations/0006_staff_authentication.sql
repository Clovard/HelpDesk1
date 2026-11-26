CREATE TABLE IF NOT EXISTS staff_accounts (
  username TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  access_role TEXT NOT NULL CHECK (access_role IN ('Admin', 'Agent')),
  support_level TEXT NOT NULL CHECK (support_level IN ('L1', 'L2', 'L3')),
  password_salt TEXT,
  password_hash TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO staff_accounts (username, display_name, access_role, support_level)
VALUES
  ('andrey', 'Андрей', 'Admin', 'L1'),
  ('artem', 'Артём', 'Agent', 'L2'),
  ('pentagon', 'Пентагон', 'Agent', 'L3');

CREATE TABLE IF NOT EXISTS staff_sessions (
  token_hash TEXT PRIMARY KEY,
  username TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (username) REFERENCES staff_accounts(username) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_staff_sessions_expires_at ON staff_sessions(expires_at);

CREATE TABLE IF NOT EXISTS auth_login_failures (
  ip_hash TEXT NOT NULL,
  failed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_auth_login_failures_ip_time ON auth_login_failures(ip_hash, failed_at);
