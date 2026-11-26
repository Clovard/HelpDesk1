INSERT INTO ticket_events (
  ticket_id,
  event_type,
  old_value,
  new_value,
  author_name,
  created_at
)
SELECT
  ticket.id,
  'ticket_created',
  NULL,
  'Заявка создана',
  ticket.employee,
  ticket.created_at
FROM tickets AS ticket
WHERE NOT EXISTS (
  SELECT 1
  FROM ticket_events AS event
  WHERE event.ticket_id = ticket.id
    AND event.event_type = 'ticket_created'
);
