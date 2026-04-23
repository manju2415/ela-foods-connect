import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const jsonResponse = (payload: Record<string, unknown>) =>
  new Response(JSON.stringify(payload), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const cleanUserData = async (adminClient: ReturnType<typeof createClient>, userId: string) => {
  const { data: orderRows, error: ordersLookupError } = await adminClient
    .from("orders")
    .select("id")
    .eq("user_id", userId);

  if (ordersLookupError) throw ordersLookupError;

  const orderIds = (orderRows || []).map((order: { id: string }) => order.id);

  if (orderIds.length > 0) {
    const cleanupByOrderId = [
      adminClient.from("undelivery_logs").delete().in("order_id", orderIds),
      adminClient.from("order_status_history").delete().in("order_id", orderIds),
      adminClient.from("order_assignments").delete().in("order_id", orderIds),
      adminClient.from("return_requests").delete().in("order_id", orderIds),
      adminClient.from("order_items").delete().in("order_id", orderIds),
    ];

    const cleanupResults = await Promise.all(cleanupByOrderId);
    const cleanupError = cleanupResults.find((result) => result.error)?.error;
    if (cleanupError) throw cleanupError;

    const { error: deleteOrdersError } = await adminClient.from("orders").delete().in("id", orderIds);
    if (deleteOrdersError) throw deleteOrdersError;
  }

  const { data: walletRows, error: walletsLookupError } = await adminClient
    .from("wallets")
    .select("id")
    .eq("user_id", userId);

  if (walletsLookupError) throw walletsLookupError;

  const walletIds = (walletRows || []).map((wallet: { id: string }) => wallet.id);

  if (walletIds.length > 0) {
    const { error: walletTransactionsError } = await adminClient
      .from("wallet_transactions")
      .delete()
      .in("wallet_id", walletIds);
    if (walletTransactionsError) throw walletTransactionsError;
  }

  const cleanupByUserId = [
    adminClient.from("addresses").delete().eq("user_id", userId),
    adminClient.from("cart_items").delete().eq("user_id", userId),
    adminClient.from("delivery_partners").delete().eq("user_id", userId),
    adminClient.from("notifications").delete().eq("user_id", userId),
    adminClient.from("product_reviews").delete().eq("user_id", userId),
    adminClient.from("referral_codes").delete().eq("user_id", userId),
    adminClient.from("referrals").delete().or(`referrer_id.eq.${userId},referred_id.eq.${userId}`),
    adminClient.from("store_staff").delete().eq("user_id", userId),
    adminClient.from("testimonials").delete().eq("user_id", userId),
    adminClient.from("user_roles").delete().eq("user_id", userId),
    adminClient.from("wallets").delete().eq("user_id", userId),
    adminClient.from("wishlist").delete().eq("user_id", userId),
    adminClient.from("withdrawal_requests").delete().eq("user_id", userId),
  ];

  const cleanupResults = await Promise.all(cleanupByUserId);
  const cleanupError = cleanupResults.find((result) => result.error)?.error;
  if (cleanupError) throw cleanupError;
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return jsonResponse({ ok: false, error: "Unauthorized" });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Verify the caller is a super_admin
    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user: caller } } = await callerClient.auth.getUser();
    if (!caller) {
      return jsonResponse({ ok: false, error: "Unauthorized" });
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const { data: isSuperAdmin } = await adminClient.rpc("is_super_admin", { _user_id: caller.id });
    if (!isSuperAdmin) {
      return jsonResponse({ ok: false, error: "Only super admins can remove users" });
    }

    const { user_id } = await req.json();
    if (!user_id) {
      return jsonResponse({ ok: false, error: "user_id is required" });
    }

    // Prevent self-deletion
    if (user_id === caller.id) {
      return jsonResponse({ ok: false, error: "Cannot remove yourself" });
    }

    await cleanUserData(adminClient, user_id);

    // Delete user from auth after public records are cleaned up
    const { error } = await adminClient.auth.admin.deleteUser(user_id);
    if (error) {
      console.error("Delete user error:", error);
      return jsonResponse({ ok: false, error: error.message, code: error.code });
    }

    return jsonResponse({ ok: true, success: true });
  } catch (err) {
    console.error("Error:", err);
    return jsonResponse({
      ok: false,
      error: err instanceof Error ? err.message : "Internal server error",
    });
  }
});
