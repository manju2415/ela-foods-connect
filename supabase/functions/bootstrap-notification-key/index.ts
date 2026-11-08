// TEMPORARY one-time bootstrap: copies this runtime's service key into Vault
// as order_notifications_service_key. Never logs or returns the key.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { jwtRole } from "../_shared/orderMessaging.ts";

Deno.serve(async () => {
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!key) return Response.json({ ok: false, step: "no_key" }, { status: 500 });
  // Same acceptance rule as send-order-notifications.
  const role = jwtRole(`Bearer ${key}`);
  const kind = role === "service_role" ? "jwt_service_role" : (key.startsWith("sb_secret_") ? "sb_secret" : "unknown");
  if (kind === "unknown") return Response.json({ ok: false, step: "incompatible_key" }, { status: 500 });
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, key);
  const { error } = await supabase.rpc("bootstrap_order_notifications_key", { p_key: key });
  if (error) return Response.json({ ok: false, step: "rpc_failed" }, { status: 500 });
  return Response.json({ ok: true, kind });
});
