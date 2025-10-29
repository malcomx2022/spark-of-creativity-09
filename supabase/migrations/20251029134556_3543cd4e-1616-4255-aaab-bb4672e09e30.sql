-- Corriger les fonctions en supprimant d'abord le trigger
DROP TRIGGER IF EXISTS trigger_set_invoice_number ON public.payments;

DROP FUNCTION IF EXISTS set_invoice_number();
DROP FUNCTION IF EXISTS generate_invoice_number();

CREATE OR REPLACE FUNCTION generate_invoice_number()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  year_month text;
  sequence_num integer;
  invoice_num text;
BEGIN
  year_month := to_char(now(), 'YYYYMM');
  
  SELECT COALESCE(MAX(
    CAST(substring(invoice_number from '[0-9]+$') AS integer)
  ), 0) + 1
  INTO sequence_num
  FROM payments
  WHERE invoice_number LIKE 'INV-' || year_month || '-%';
  
  invoice_num := 'INV-' || year_month || '-' || lpad(sequence_num::text, 6, '0');
  
  RETURN invoice_num;
END;
$$;

CREATE OR REPLACE FUNCTION set_invoice_number()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.invoice_number IS NULL AND NEW.status IN ('paid', 'completed') THEN
    NEW.invoice_number := generate_invoice_number();
  END IF;
  RETURN NEW;
END;
$$;

-- Recréer le trigger
CREATE TRIGGER trigger_set_invoice_number
  BEFORE INSERT OR UPDATE ON public.payments
  FOR EACH ROW
  EXECUTE FUNCTION set_invoice_number();