import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // This wipes every account and all business data — only an existing super
    // admin may trigger it.
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user: caller } } = await callerClient.auth.getUser();
    if (!caller) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { data: isSuperAdmin } = await supabase.rpc("is_super_admin", { _user_id: caller.id });
    if (!isSuperAdmin) {
      return new Response(JSON.stringify({ error: "Only super admins can reset test data" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 1. List all existing users
    const { data: listData, error: listError } = await supabase.auth.admin.listUsers({ perPage: 1000 });
    if (listError) throw listError;

    // 2. Delete all existing users
    for (const u of (listData?.users || [])) {
      await supabase.auth.admin.deleteUser(u.id);
    }

    // 3. Clean up any orphan data
    await supabase.from("wallet_transactions").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    await supabase.from("wallets").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    await supabase.from("referrals").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    await supabase.from("referral_codes").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    await supabase.from("notifications").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    await supabase.from("order_items").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    await supabase.from("order_status_history").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    await supabase.from("order_assignments").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    await supabase.from("orders").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    await supabase.from("addresses").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    await supabase.from("cart_items").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    await supabase.from("wishlist").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    await supabase.from("withdrawal_requests").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    await supabase.from("undelivery_logs").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    await supabase.from("return_requests").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    await supabase.from("product_reviews").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    await supabase.from("testimonials").delete().neq("id", "00000000-0000-0000-0000-000000000000");

    // 4. Create fresh test accounts
    // The handle_new_user trigger will auto-assign roles and create profiles
    const testAccounts = [
      { phone: "9999000001", name: "Super Admin", description: "Super Admin" },
      { phone: "9999000002", name: "Store Admin", description: "Store Admin" },
      { phone: "9999000003", name: "MLM Admin (Founder)", description: "MLM Admin + Founding Member" },
      { phone: "9999000004", name: "Delivery Partner", description: "Delivery Partner" },
      { phone: "9999000005", name: "Regular Customer", description: "Regular Customer" },
      { phone: "9999000006", name: "Member User", description: "Member" },
    ];

    interface CreatedTestUser {
      phone: string;
      name: string;
      role: string;
      user_id: string | undefined;
    }

    const createdUsers: CreatedTestUser[] = [];

    for (const acct of testAccounts) {
      const cleanPhone = `91${acct.phone}`;
      const mockEmail = `${cleanPhone}@elabazar.local`;
      // Not used for sign-in: verify-otp-login rotates this to a fresh random
      // secret on every login.
      const tempPassword = crypto.randomUUID() + crypto.randomUUID();

      const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
        email: mockEmail,
        password: tempPassword,
        email_confirm: true,
        user_metadata: {
          full_name: acct.name,
          phone: `+91${acct.phone}`,
        },
      });

      if (createError) {
        console.error(`Failed to create ${acct.phone}:`, createError.message);
        continue;
      }

      createdUsers.push({
        phone: acct.phone,
        name: acct.name,
        role: acct.description,
        user_id: newUser?.user?.id,
      });
    }

    // Wait for triggers
    await new Promise(r => setTimeout(r, 2000));

    // 5. Create wallets for founding member and member (others get wallets on demand)
    for (const u of createdUsers) {
      if (["9999000003", "9999000006"].includes(u.phone) && u.user_id) {
        await supabase.from("wallets").upsert({
          user_id: u.user_id,
          balance: 0,
          withdrawable_balance: 0,
          purchase_only_balance: 0,
        }, { onConflict: "user_id" });
      }
    }

    // 6. Generate referral codes for founding member and member
    for (const u of createdUsers) {
      if (["9999000003", "9999000006"].includes(u.phone) && u.user_id) {
        await supabase.rpc("generate_user_referral_code", { p_user_id: u.user_id });
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `Deleted ${listData?.users?.length || 0} users. Created ${createdUsers.length} fresh test accounts.`,
        accounts: createdUsers.map(u => ({
          phone: u.phone,
          name: u.name,
          role: u.role,
          otp: "000000",
        })),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Reset error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
