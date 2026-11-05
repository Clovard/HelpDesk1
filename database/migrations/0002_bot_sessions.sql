CREATE TABLE IF NOT EXISTS bot_sessions (
    chat_id TEXT PRIMARY KEY,
    state TEXT NOT NULL,
    payload TEXT NOT NULL DEFAULT '{}',
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);