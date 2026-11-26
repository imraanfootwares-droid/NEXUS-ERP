-- Allow audited bill edits, 1-click reverts, and safe deletions to update/delete
-- finalized invoices ONLY when the transaction explicitly sets the transaction-local
-- flag `app.allow_invoice_revision = 'true'`. Accidental/un-audited direct updates
-- remain blocked.

CREATE OR REPLACE FUNCTION public.enforce_invoice_immutability()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Audited revision path (edit / revert / delete with bill_revisions snapshot)
  IF current_setting('app.allow_invoice_revision', true) = 'true' THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF OLD.status <> 'draft' THEN
      RAISE EXCEPTION 'Finalized GST invoices cannot be deleted; cancel or issue a credit note.';
    END IF;
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.status <> 'draft' THEN
    IF NEW.subtotal IS DISTINCT FROM OLD.subtotal
       OR NEW.grand_total IS DISTINCT FROM OLD.grand_total
       OR NEW.taxable_amount IS DISTINCT FROM OLD.taxable_amount
       OR NEW.cgst_amount IS DISTINCT FROM OLD.cgst_amount
       OR NEW.sgst_amount IS DISTINCT FROM OLD.sgst_amount
       OR NEW.igst_amount IS DISTINCT FROM OLD.igst_amount
       OR NEW.invoice_number IS DISTINCT FROM OLD.invoice_number
       OR NEW.invoice_type IS DISTINCT FROM OLD.invoice_type THEN
      RAISE EXCEPTION 'Finalized invoice amounts and numbers are immutable.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
