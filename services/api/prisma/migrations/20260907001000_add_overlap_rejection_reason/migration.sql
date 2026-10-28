-- The matching engine distinguishes "the passenger's journey does not
-- sufficiently coincide with the driver's" from a wrong-direction or
-- off-corridor rejection, so the audit trail says which rule actually fired.
ALTER TYPE "MatchRejectionReason" ADD VALUE IF NOT EXISTS 'ROUTE_OVERLAP_TOO_LOW' AFTER 'WRONG_DIRECTION';
