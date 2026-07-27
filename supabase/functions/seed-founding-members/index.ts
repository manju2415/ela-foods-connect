import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface SeedUser {
  full_name: string;
  phone10: string; // 10-digit phone (no country code)
  email: string;
}

const USERS: SeedUser[] = [
  { full_name: "Shyju V M", phone10: "9448493280", email: "shyjuvm@gmail.com" },
  { full_name: "Sudevan P M", phone10: "9845121558", email: "info@addblr.com" },
  { full_name: "Manoj Kumar", phone10: "9611485193", email: "mnrmanoj02@gmail.com" },
  { full_name: "Vinod M S", phone10: "9845482617", email: "indexgr@rediffmail.com" },
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const url = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const results: any[] = [];

  for (const u of USERS) {
    const log: any = { name: u.full_name, phone: u.phone10, email: u.email, steps: [] };
    try {
      const phoneE164 = `+91${u.phone10}`;
      const loginEmail = `91${u.phone10}@elabazar.local`;
      const tempPassword = `elabazar_91${u.phone10}_temp_2026`;

      // 1. Find any existing profile via phone variants and delete the auth user (cascades)
      const phoneVariants = [phoneE164, `91${u.phone10}`, u.phone10, `0${u.phone10}`];
      const { data: existingProfiles } = await admin
        .from("profiles")
        .select("id")
        .in("phone", phoneVariants);

      // Also search by login email or real email
      const { data: existingByEmail } = await admin
        .from("profiles")
        .select("id")
        .in("email", [loginEmail, u.email]);

      const idsToDelete = new Set<string>([
        ...(existingProfiles ?? []).map((p) => p.id),
        ...(existingByEmail ?? []).map((p) => p.id),
      ]);

      for (const id of idsToDelete) {
        const { error: delErr } = await admin.auth.admin.deleteUser(id);
        if (delErr) log.steps.push({ deleteUser: id, error: delErr.message });
        else log.steps.push({ deletedExistingUser: id });
      }

      // 2. Create fresh auth user
      const { data: created, error: createErr } = await admin.auth.admin.createUser({
        email: loginEmail,
        password: tempPassword,
        phone: phoneE164,
        phone_confirm: true,
        email_confirm: true,
        user_metadata: { full_name: u.full_name, phone: phoneE164 },
      });

      if (createErr || !created?.user) {
        log.steps.push({ createUser: "failed", error: createErr?.message });
        results.push({ ...log, ok: false });
        continue;
      }

      const userId = created.user.id;
      log.user_id = userId;
      log.steps.push({ created: userId });

      // Small wait for handle_new_user trigger to finish
      await new Promise((r) => setTimeout(r, 400));

      // 3. Update profile with real email + founder flags
      const { error: profErr } = await admin
        .from("profiles")
        .update({
          full_name: u.full_name,
          email: u.email,
          phone: phoneE164,
          user_level: "founder",
          is_designated_founder: true,
        })
        .eq("id", userId);
      if (profErr) log.steps.push({ profileUpdate: "error", error: profErr.message });
      else log.steps.push({ profileUpdated: true });

      // 4. Ensure founding_member role (idempotent)
      const { error: roleErr } = await admin
        .from("user_roles")
        .upsert({ user_id: userId, role: "founding_member" }, { onConflict: "user_id,role" });
      if (roleErr) log.steps.push({ roleInsert: "error", error: roleErr.message });
      else log.steps.push({ foundingMemberRoleAdded: true });

      // 5. Generate referral code
      const { data: codeData, error: codeErr } = await admin.rpc(
        "generate_user_referral_code",
        { p_user_id: userId },
      );
      if (codeErr) log.steps.push({ referralCode: "error", error: codeErr.message });
      else log.steps.push({ referralCode: codeData });

      // 6. Ensure wallet exists
      await admin
        .from("wallets")
        .upsert({ user_id: userId }, { onConflict: "user_id" });

      results.push({ ...log, ok: true });
    } catch (e: any) {
      log.steps.push({ exception: e.message });
      results.push({ ...log, ok: false });
    }
  }

  return new Response(JSON.stringify({ results }, null, 2), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status: 200,
  });
});
