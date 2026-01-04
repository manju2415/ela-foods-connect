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
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // Create a test user via admin API
    const testEmail = 'founder@elafoods.com';
    const testPassword = 'TestPass123!';

    // Check if user already exists
    const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers();
    let testUser = existingUsers?.users?.find(u => u.email === testEmail);

    if (!testUser) {
      // Create the test user
      const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email: testEmail,
        password: testPassword,
        email_confirm: true,
        user_metadata: { full_name: 'Test Founding Member' }
      });

      if (createError) {
        console.error('Error creating user:', createError);
        throw createError;
      }
      testUser = newUser.user;
      console.log('Created test user:', testUser.id);
    } else {
      console.log('Test user already exists:', testUser.id);
    }

    // Add founding_member role
    const { error: roleError } = await supabaseAdmin
      .from('user_roles')
      .upsert({ 
        user_id: testUser.id, 
        role: 'founding_member' 
      }, { 
        onConflict: 'user_id,role' 
      });

    if (roleError) {
      console.error('Error adding role:', roleError);
    }

    // Create referral code for this user
    const { data: existingCode } = await supabaseAdmin
      .from('referral_codes')
      .select('code')
      .eq('user_id', testUser.id)
      .single();

    let referralCode = existingCode?.code;

    if (!referralCode) {
      referralCode = 'ELAFOUND01';
      const { error: codeError } = await supabaseAdmin
        .from('referral_codes')
        .insert({
          code: referralCode,
          user_id: testUser.id,
          max_uses: 100,
          is_active: true
        });

      if (codeError) {
        console.error('Error creating referral code:', codeError);
        throw codeError;
      }
      console.log('Created referral code:', referralCode);
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Test data seeded successfully',
        testUser: {
          email: testEmail,
          password: testPassword
        },
        referralCode
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Seed error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
