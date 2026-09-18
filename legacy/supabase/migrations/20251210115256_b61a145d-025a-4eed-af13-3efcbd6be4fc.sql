-- Supprimer le trigger problématique sur practitioner_payouts s'il existe
DROP TRIGGER IF EXISTS update_practitioner_payouts_updated_at ON practitioner_payouts;

-- Mettre à jour manuellement le payout à completed
UPDATE practitioner_payouts 
SET status = 'completed', processed_at = now()
WHERE id = '2d7df0a4-7b8e-4291-a96f-ba30166f66d7';

-- Synchroniser les balances pour chaque praticien qui a des paiements
-- Dr. Praticien Test (40ffeae5-0412-48aa-9a02-3fc7caff8fef)
-- Paiements: 14250 (held) + 9500 (held) + 9500 (held) + 9500 (ready) + 14250 (held) + 14250 (held) = 61750 held + 9500 ready
-- Après release des holds expirés: 9500 (held, expire 12 dec) + reste en ready
UPDATE practitioner_balances
SET 
  balance_available = (
    SELECT COALESCE(SUM(p.net_amount), 0)
    FROM payments p
    JOIN appointments a ON p.appointment_id = a.id
    WHERE a.practitioner_id = '40ffeae5-0412-48aa-9a02-3fc7caff8fef'
    AND p.status = 'paid'
    AND p.payout_status = 'ready'
  ),
  balance_on_hold = (
    SELECT COALESCE(SUM(p.net_amount), 0)
    FROM payments p
    JOIN appointments a ON p.appointment_id = a.id
    WHERE a.practitioner_id = '40ffeae5-0412-48aa-9a02-3fc7caff8fef'
    AND p.status = 'paid'
    AND p.payout_status = 'held'
  ),
  balance_pending = 0,
  updated_at = now()
WHERE practitioner_id = '40ffeae5-0412-48aa-9a02-3fc7caff8fef';

-- Karim Test Essai (b06788a8-e77b-412f-9c69-3c68cdab5306)
UPDATE practitioner_balances
SET 
  balance_available = (
    SELECT COALESCE(SUM(p.net_amount), 0)
    FROM payments p
    JOIN appointments a ON p.appointment_id = a.id
    WHERE a.practitioner_id = 'b06788a8-e77b-412f-9c69-3c68cdab5306'
    AND p.status = 'paid'
    AND p.payout_status = 'ready'
  ),
  balance_on_hold = (
    SELECT COALESCE(SUM(p.net_amount), 0)
    FROM payments p
    JOIN appointments a ON p.appointment_id = a.id
    WHERE a.practitioner_id = 'b06788a8-e77b-412f-9c69-3c68cdab5306'
    AND p.status = 'paid'
    AND p.payout_status = 'held'
  ),
  balance_pending = 0,
  updated_at = now()
WHERE practitioner_id = 'b06788a8-e77b-412f-9c69-3c68cdab5306';

-- Coach Sportif Test (a791383e-e527-440d-8e29-d30a285980c6) - s'assurer qu'il a un record
INSERT INTO practitioner_balances (practitioner_id, balance_available, balance_pending, balance_on_hold, currency)
VALUES ('a791383e-e527-440d-8e29-d30a285980c6', 0, 0, 0, 'XOF')
ON CONFLICT (practitioner_id) DO NOTHING;