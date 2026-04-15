CREATE OR REPLACE FUNCTION public.trigger_purchase_commission()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF (TG_OP = 'INSERT' AND NEW.payment_status = 'completed') OR 
     (TG_OP = 'UPDATE' AND NEW.status = 'delivered' AND OLD.status != 'delivered') THEN
    PERFORM credit_purchase_commission(NEW.user_id, NEW.total_amount);
  END IF;
  RETURN NEW;
END;
$function$;