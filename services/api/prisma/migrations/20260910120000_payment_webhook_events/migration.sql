-- Records each webhook the payment provider delivers, so it is acted on once.
--
-- Providers retry until they get a 2xx and can deliver out of order, so the
-- same event arriving several times is normal operation rather than an attack.
-- The unique key below is what turns a repeat into a no-op instead of a second
-- charge or a payment flipping back to PAID after it was refunded.
--
-- Additive and reversible: no existing table or column is touched.

CREATE TABLE IF NOT EXISTS payment_webhook_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider    varchar(30)  NOT NULL,
  event_id    varchar(200) NOT NULL,
  event_type  varchar(60)  NOT NULL,
  payment_id  uuid,
  payload     jsonb,
  received_at timestamptz(3) NOT NULL DEFAULT now()
);

-- The idempotency guarantee. Scoped by provider so two vendors cannot collide
-- on an id namespace neither of them controls.
CREATE UNIQUE INDEX IF NOT EXISTS payment_webhook_events_provider_event
  ON payment_webhook_events (provider, event_id);

CREATE INDEX IF NOT EXISTS payment_webhook_events_payment
  ON payment_webhook_events (payment_id);
