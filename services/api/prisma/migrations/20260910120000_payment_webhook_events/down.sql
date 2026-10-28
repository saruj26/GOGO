-- Reverses 20260910120000_payment_webhook_events.
DROP INDEX IF EXISTS payment_webhook_events_payment;
DROP INDEX IF EXISTS payment_webhook_events_provider_event;
DROP TABLE IF EXISTS payment_webhook_events;
