import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const email = 'mlm.manager@elafoods.com';
    const password = 'Manager@123';
    const fullName = 'MLM Manager';

    // Check if user already exists
    const { data: existingProfile } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('email', email)
      .maybeSingle();

    if (existingProfile) {
      // Ensure admin role exists
      await supabaseAdmin
        .from('user_roles')
        .upsert({ user_id: existingProfile.id, role: 'admin' }, { onConflict: 'user_id,role' });

      return new Response(
        JSON.stringify({ message: 'Manager account already exists', email, password }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create user
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    });

    if (authError) throw authError;

    // Assign admin role
    await supabaseAdmin
      .from('user_roles')
      .insert({ user_id: authData.user.id, role: 'admin' });

    // Update profile
    await supabaseAdmin
      .from('profiles')
      .update({ full_name: fullName, user_level: 'master' })
      .eq('id', authData.user.id);

    return new Response(
      JSON.stringify({ message: 'Manager account created', email, password }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
