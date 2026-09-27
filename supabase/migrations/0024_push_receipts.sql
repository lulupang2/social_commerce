-- Extend push deliveries with Expo ticket/receipt reconciliation.
-- Existing rows keep NULL ticket/receipt columns and are left untouched by the
-- reconcile worker (they predate per-device ticket storage).
ALTER TABLE summergear_app.notification_deliveries
  ADD COLUMN ticket_id text,
  ADD COLUMN ticket_received_at timestamptz,
  ADD COLUMN receipt_status text CHECK (receipt_status IN ('pending','ok','error','unknown')),
  ADD COLUMN receipt_details text,
  ADD COLUMN receipt_checked_at timestamptz,
  ADD COLUMN last_receipt_error text;

-- Old delivery timestamps remain as historical ticket evidence. New rows record
-- delivery time only after Expo confirms the receipt.
ALTER TABLE summergear_app.notification_deliveries
  ALTER COLUMN delivered_at DROP NOT NULL,
  ALTER COLUMN delivered_at DROP DEFAULT;

CREATE INDEX notification_deliveries_receipt_pending ON summergear_app.notification_deliveries(event_id)
  WHERE ticket_id IS NOT NULL AND receipt_status='pending';

-- Allow events to await receipt confirmation after Expo accepts the ticket.
-- Drop the existing status check robustly; it may have a system-generated name.
DO $$
DECLARE conname text;
BEGIN
  SELECT c.conname INTO conname
  FROM pg_constraint c
  JOIN pg_class t ON c.conrelid = t.oid
  JOIN pg_namespace n ON t.relnamespace = n.oid
  WHERE n.nspname = 'summergear_app'
    AND t.relname = 'notification_events'
    AND c.contype = 'c'
    AND pg_get_constraintdef(c.oid) LIKE '%status%'
  LIMIT 1;
  IF conname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE summergear_app.notification_events DROP CONSTRAINT %I', conname);
  END IF;
END $$;
ALTER TABLE summergear_app.notification_events
  ADD CONSTRAINT notification_events_status_check CHECK (status IN ('pending','sent','skipped','failed','receipt_pending'));

-- Worker needs to update per-device receipt state and disable stale tokens.
GRANT UPDATE(receipt_status, receipt_details, receipt_checked_at, last_receipt_error, ticket_id, ticket_received_at, delivered_at) ON summergear_app.notification_deliveries TO summergear_worker;
