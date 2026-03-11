import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface TestUser {
  phone: string;
  fullName: string;
  roles: string[];
  referralCode?: string;
}

const TEST_USERS: TestUser[] = [
  {
    phone: '+919999000001',
    fullName: 'Super Admin User',
    roles: ['super_admin', 'admin']
  },
  {
    phone: '+919999000002',
    fullName: 'Admin User',
    roles: ['admin']
  },
  {
    phone: '+919999000003',
    fullName: 'Test Founding Member',
    roles: ['founding_member', 'member'],
    referralCode: 'ELAFOUND01'
  },
  {
    phone: '+919999000004',
    fullName: 'Delivery Partner',
    roles: ['delivery_partner', 'member']
  },
  {
    phone: '+919999000005',
    fullName: 'Regular Member',
    roles: ['member']
  }
];

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

    const results: { phone: string; roles: string[]; referralCode?: string; status: string }[] = [];

    for (const testUser of TEST_USERS) {
      const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers();
      let user = existingUsers?.users?.find(u => u.phone === testUser.phone);

      if (!user) {
        const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
          phone: testUser.phone,
          phone_confirm: true,
          user_metadata: { full_name: testUser.fullName }
        });

        if (createError) {
          console.error(`Error creating user ${testUser.phone}:`, createError);
          results.push({
            phone: testUser.phone,
            roles: testUser.roles,
            status: `Error: ${createError.message}`
          });
          continue;
        }
        user = newUser.user;
        console.log('Created test user:', user.id);
      }

      // Add roles
      for (const role of testUser.roles) {
        const { error: roleError } = await supabaseAdmin
          .from('user_roles')
          .upsert({
            user_id: user.id,
            role: role
          }, {
            onConflict: 'user_id,role'
          });

        if (roleError) {
          console.error(`Error adding role ${role} to ${testUser.phone}:`, roleError);
        }
      }

      // Create delivery partner record if needed
      if (testUser.roles.includes('delivery_partner')) {
        const { error: dpError } = await supabaseAdmin
          .from('delivery_partners')
          .upsert({
            user_id: user.id,
            vehicle_type: 'Motorcycle',
            vehicle_number: 'KA01AB1234',
            is_available: true
          }, {
            onConflict: 'user_id'
          });

        if (dpError) {
          console.error(`Error creating delivery partner for ${testUser.phone}:`, dpError);
        }
      }

      // Create referral code if specified
      let referralCode = testUser.referralCode;
      if (referralCode) {
        const { data: existingCode } = await supabaseAdmin
          .from('referral_codes')
          .select('code')
          .eq('user_id', user.id)
          .single();

        if (!existingCode) {
          const { error: codeError } = await supabaseAdmin
            .from('referral_codes')
            .insert({
              code: referralCode,
              user_id: user.id,
              max_uses: 100,
              is_active: true
            });

          if (codeError) {
            console.error(`Error creating referral code for ${testUser.phone}:`, codeError);
          }
        } else {
          referralCode = existingCode.code;
        }
      }

      results.push({
        phone: testUser.phone,
        roles: testUser.roles,
        referralCode,
        status: 'Success'
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Test users seeded successfully',
        users: results
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
