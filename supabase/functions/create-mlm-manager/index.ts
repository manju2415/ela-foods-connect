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
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Grants the admin role — only an existing super admin may call this.
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    const callerClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user: caller } } = await callerClient.auth.getUser();
    if (!caller) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    const { data: isSuperAdmin } = await supabaseAdmin.rpc('is_super_admin', { _user_id: caller.id });
    if (!isSuperAdmin) {
      return new Response(
        JSON.stringify({ error: 'Only super admins can create manager accounts' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const phone = '+919999000001';
    const fullName = 'MLM Manager';

    // Check if user already exists by phone in profiles
    const { data: existingProfile } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('phone', phone)
      .maybeSingle();

    if (existingProfile) {
      await supabaseAdmin
        .from('user_roles')
        .upsert({ user_id: existingProfile.id, role: 'admin' }, { onConflict: 'user_id,role' });

      return new Response(
        JSON.stringify({ message: 'Manager account already exists', phone }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create user with phone
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      phone,
      phone_confirm: true,
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
      JSON.stringify({ message: 'Manager account created', phone }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
