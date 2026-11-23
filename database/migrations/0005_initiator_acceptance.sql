ALTER TABLE tickets ADD COLUMN initiator_acceptance TEXT
    CHECK (initiator_acceptance IS NULL OR initiator_acceptance IN ('pending', 'accepted', 'rejected'));

ALTER TABLE tickets ADD COLUMN closure_confirmation_token TEXT;

UPDATE tickets AS ticket
SET initiator_acceptance = COALESCE(
    (
        SELECT CASE message.body
            WHEN 'Сотрудник подтвердил, что проблема решена.' THEN 'accepted'
            WHEN 'Сотрудник сообщил, что проблема осталась.' THEN 'rejected'
        END
        FROM ticket_messages AS message
        WHERE message.ticket_id = ticket.id
          AND message.sender_type = 'employee'
          AND message.body IN (
              'Сотрудник подтвердил, что проблема решена.',
              'Сотрудник сообщил, что проблема осталась.'
          )
          AND message.created_at >= COALESCE(ticket.closed_at, ticket.created_at)
        ORDER BY message.created_at DESC, message.id DESC
        LIMIT 1
    ),
    'pending'
)
WHERE ticket.status = 'Closed';
