PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
id INTEGER PRIMARY KEY AUTOINCREMENT,
telegram_id TEXT UNIQUE,
name TEXT NOT NULL,
role TEXT NOT NULL DEFAULT 'Employee',
city TEXT,
department TEXT,
created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

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
VALUES ('andrey', 'Андрей', 'Admin', 'L1'),
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

CREATE TABLE IF NOT EXISTS tickets (
id INTEGER PRIMARY KEY AUTOINCREMENT,

public_id TEXT NOT NULL UNIQUE,

date TEXT NOT NULL,
time TEXT NOT NULL,

employee TEXT NOT NULL,
city TEXT,
department TEXT,
system TEXT,
type TEXT,

problem TEXT NOT NULL,
expected_result TEXT,

status TEXT NOT NULL DEFAULT 'New',
it_comment TEXT,

support_level TEXT,
assignee TEXT,
scale TEXT,

employee_telegram_id TEXT,
telegram_user_id TEXT,
initiator_acceptance TEXT CHECK (initiator_acceptance IS NULL OR initiator_acceptance IN ('pending', 'accepted', 'rejected')),
closure_confirmation_token TEXT,
photo_count INTEGER NOT NULL DEFAULT 0,
file_count INTEGER NOT NULL DEFAULT 0,

created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
closed_at TEXT
);

CREATE TABLE IF NOT EXISTS ideas (
id INTEGER PRIMARY KEY AUTOINCREMENT,

public_id TEXT NOT NULL UNIQUE,

date TEXT NOT NULL,
time TEXT NOT NULL,

employee TEXT NOT NULL,
city TEXT,
department TEXT,
system TEXT,

idea TEXT NOT NULL,
expected_result TEXT,

priority TEXT NOT NULL DEFAULT 'Medium',
status TEXT NOT NULL DEFAULT 'New',

assignee TEXT,
comment TEXT,
linked_ticket_id INTEGER,

employee_telegram_id TEXT,
photo_count INTEGER NOT NULL DEFAULT 0,
file_count INTEGER NOT NULL DEFAULT 0,

created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

FOREIGN KEY (linked_ticket_id)
REFERENCES tickets(id)
ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS comments (
id INTEGER PRIMARY KEY AUTOINCREMENT,

ticket_id INTEGER NOT NULL,
author_name TEXT NOT NULL,
body TEXT NOT NULL,

created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

FOREIGN KEY (ticket_id)
REFERENCES tickets(id)
ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS ticket_messages (
id INTEGER PRIMARY KEY AUTOINCREMENT,
ticket_id INTEGER NOT NULL,
sender_type TEXT NOT NULL CHECK (sender_type IN ('employee', 'support')),
sender_telegram_id TEXT,
telegram_message_id INTEGER,
sender_name TEXT NOT NULL,
body TEXT NOT NULL,
telegram_status TEXT NOT NULL DEFAULT 'not_required',
created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS bot_ticket_chats (
chat_id TEXT PRIMARY KEY,
ticket_id INTEGER NOT NULL,
updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS ticket_events (
id INTEGER PRIMARY KEY AUTOINCREMENT,

ticket_id INTEGER NOT NULL,
event_type TEXT NOT NULL,
old_value TEXT,
new_value TEXT,
author_name TEXT NOT NULL,

created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

FOREIGN KEY (ticket_id)
REFERENCES tickets(id)
ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS attachments (
id INTEGER PRIMARY KEY AUTOINCREMENT,

ticket_id INTEGER NOT NULL,
file_name TEXT NOT NULL,
storage_key TEXT NOT NULL,
content_type TEXT,

created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

FOREIGN KEY (ticket_id)
REFERENCES tickets(id)
ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_tickets_status
ON tickets(status);

CREATE INDEX IF NOT EXISTS idx_tickets_assignee
ON tickets(assignee);

CREATE INDEX IF NOT EXISTS idx_tickets_employee
ON tickets(employee);

CREATE INDEX IF NOT EXISTS idx_tickets_created_at
ON tickets(created_at);

CREATE INDEX IF NOT EXISTS idx_ideas_status
ON ideas(status);

CREATE INDEX IF NOT EXISTS idx_comments_ticket_id
ON comments(ticket_id);

CREATE INDEX IF NOT EXISTS idx_tickets_telegram_user
ON tickets(telegram_user_id);

CREATE INDEX IF NOT EXISTS idx_ticket_messages_ticket_created
ON ticket_messages(ticket_id, created_at, id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_ticket_messages_telegram_update
ON ticket_messages(sender_telegram_id, telegram_message_id)
WHERE telegram_message_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ticket_events_ticket_id
ON ticket_events(ticket_id);
