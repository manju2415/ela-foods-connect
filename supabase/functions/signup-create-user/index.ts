// Open signup: creates a Supabase auth user for a phone-verified signup.
// Idempotent — if the user already exists, returns success so the client can sign in normally.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { phone, fullName, referralCode, founder } = await req.json();

    if (!phone || typeof phone !== "string" || !/^\+?\d{10,15}$/.test(phone)) {
      return new Response(JSON.stringify({ error: "Invalid phone" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!fullName || typeof fullName !== "string" || fullName.trim().length < 2) {
      return new Response(JSON.stringify({ error: "Invalid name" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const cleanPhone = phone.replace(/\+/g, "");
    const email = `${cleanPhone}@elabazar.local`;
    const password = `elabazar_${cleanPhone}_temp_2026`;

    // Check if user already exists by trying to look them up via profiles
    const { data: existingProfile } = await supabase
      .from("profiles")
      .select("id")
      .eq("phone", phone.startsWith("+") ? phone : `+${cleanPhone}`)
      .maybeSingle();

    if (existingProfile) {
      return new Response(JSON.stringify({ success: true, isNewUser: false }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Create auth user via admin API
    const { data: created, error: createErr } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      phone_confirm: true,
      user_metadata: { full_name: fullName.trim(), phone: cleanPhone },
    });

    if (createErr) {
      // If the user already exists in auth but profile lookup missed, treat as success
      if (createErr.message?.toLowerCase().includes("already")) {
        return new Response(JSON.stringify({ success: true, isNewUser: false }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      console.error("[signup-create-user] createUser error:", createErr);
      return new Response(JSON.stringify({ error: createErr.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Ensure profile row exists and phone is normalized
    if (created?.user) {
      await supabase.from("profiles").upsert({
        id: created.user.id,
        email,
        full_name: fullName.trim(),
        phone: phone.startsWith("+") ? phone : `+${cleanPhone}`,
      }, { onConflict: "id" });
    }

    return new Response(JSON.stringify({ success: true, isNewUser: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[signup-create-user] error:", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
