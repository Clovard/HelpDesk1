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

CREATE INDEX IF NOT EXISTS idx_ticket_events_ticket_id
ON ticket_events(ticket_id);