-- Lets a promotion be non-public (code-only, e.g. referral codes) and lets a
-- customer "claim" one of those by entering its code, so it then shows up in
-- their own available-promotions list without granting a redemption.
--
-- Additive and reversible: no existing table or column is touched, and the
-- new column defaults every existing promotion to public, preserving current
-- behaviour.

ALTER TABLE promotions ADD COLUMN IF NOT EXISTS is_public boolean NOT NULL DEFAULT true;

CREATE TABLE IF NOT EXISTS promotion_claims (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  promotion_id uuid NOT NULL REFERENCES promotions(id) ON DELETE CASCADE,
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  claimed_at   timestamptz(3) NOT NULL DEFAULT now()
);

-- A customer can only claim a given promotion once.
CREATE UNIQUE INDEX IF NOT EXISTS promotion_claims_promotion_user
  ON promotion_claims (promotion_id, user_id);

CREATE INDEX IF NOT EXISTS promotion_claims_user
  ON promotion_claims (user_id);
