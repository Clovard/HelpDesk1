ALTER TABLE tickets ADD COLUMN telegram_user_id TEXT;

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

CREATE INDEX IF NOT EXISTS idx_ticket_messages_ticket_created
ON ticket_messages(ticket_id, created_at, id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_ticket_messages_telegram_update
ON ticket_messages(sender_telegram_id, telegram_message_id)
WHERE telegram_message_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_tickets_telegram_user
ON tickets(telegram_user_id);
