-- Return wallet money when an unpaid order that used wallet credit is cancelled (once only).
CREATE OR REPLACE FUNCTION public.refund_wallet_on_unpaid_cancel()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_wallet wallets%ROWTYPE; v_withdrawable boolean; v_amt numeric;
BEGIN
  IF NEW.status = 'cancelled' AND OLD.status IS DISTINCT FROM 'cancelled'
     AND OLD.payment_status IS DISTINCT FROM 'completed'
     AND COALESCE(NEW.wallet_amount_used,0) > 0 THEN
    v_amt := NEW.wallet_amount_used;
    SELECT * INTO v_wallet FROM wallets WHERE user_id = NEW.user_id FOR UPDATE;
    IF v_wallet.id IS NULL THEN RETURN NEW; END IF;
    IF EXISTS (SELECT 1 FROM wallet_transactions WHERE wallet_id = v_wallet.id AND type = 'refund' AND reference_id = NEW.id::text) THEN
      RETURN NEW;
    END IF;
    SELECT COALESCE(bool_or(is_withdrawable), false) INTO v_withdrawable
      FROM wallet_transactions WHERE wallet_id = v_wallet.id AND type = 'purchase' AND reference_id = NEW.id::text;
    IF v_withdrawable THEN
      UPDATE wallets SET withdrawable_balance = COALESCE(withdrawable_balance,0) + v_amt, balance = balance + v_amt, updated_at = now() WHERE id = v_wallet.id;
    ELSE
      UPDATE wallets SET purchase_only_balance = COALESCE(purchase_only_balance,0) + v_amt, balance = balance + v_amt, updated_at = now() WHERE id = v_wallet.id;
    END IF;
    INSERT INTO wallet_transactions(wallet_id,type,amount,balance_after,description,reference_id,is_withdrawable)
    SELECT id,'refund',v_amt,balance,'Wallet refund: order '||NEW.order_number||' cancelled (payment not completed)',NEW.id::text,v_withdrawable FROM wallets WHERE id = v_wallet.id;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS refund_wallet_on_unpaid_cancel_trg ON public.orders;
CREATE TRIGGER refund_wallet_on_unpaid_cancel_trg AFTER UPDATE OF status ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.refund_wallet_on_unpaid_cancel();

-- New-order alerts only once the order is fully paid.
CREATE OR REPLACE FUNCTION public.notify_new_order()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v_rec record; v_message text;
BEGIN
  IF NEW.payment_status IS DISTINCT FROM 'completed' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.payment_status = 'completed' THEN RETURN NEW; END IF;
  v_message := 'Order #' || NEW.order_number || ' · ₹' || round(COALESCE(NEW.total_amount,0) + COALESCE(NEW.wallet_amount_used,0),2)
    || ' · ' || NEW.fulfillment_type || ' · Payment: ' || NEW.payment_status;
  FOR v_rec IN
    SELECT DISTINCT ur.user_id FROM user_roles ur WHERE ur.role IN ('super_admin','admin')
    UNION
    SELECT DISTINCT ss.user_id FROM store_staff ss WHERE NEW.pickup_store_id IS NOT NULL AND ss.store_id = NEW.pickup_store_id
  LOOP
    INSERT INTO notifications(user_id,title,message,type,reference_type,reference_id)
    VALUES(v_rec.user_id,'New Order Received',v_message,'order','order',NEW.id);
  END LOOP;
  RETURN NEW;
END $function$;

DROP TRIGGER IF EXISTS notify_new_order_trg ON public.orders;
CREATE TRIGGER notify_new_order_trg AFTER INSERT OR UPDATE OF payment_status ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.notify_new_order();