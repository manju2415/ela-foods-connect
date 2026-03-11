import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface TestUser {
  phone: string; // 10-digit Indian number (without +91)
  fullName: string;
  roles: string[];
  isDeliveryPartner?: boolean;
  referralCode?: string;
  userLevel?: string;
}

const TEST_USERS: TestUser[] = [
  {
    phone: '9999000001',
    fullName: 'Super Admin',
    roles: ['super_admin', 'admin', 'member'],
    userLevel: 'founder',
  },
  {
    phone: '9999000002',
    fullName: 'Admin User',
    roles: ['admin', 'member'],
  },
  {
    phone: '9999000003',
    fullName: 'Founding Member',
    roles: ['founding_member', 'member'],
    referralCode: 'ELAFOUND01',
    userLevel: 'founder',
  },
  {
    phone: '9999000004',
    fullName: 'Delivery Partner',
    roles: ['delivery_partner', 'member'],
    isDeliveryPartner: true,
  },
  {
    phone: '9999000005',
    fullName: 'Regular Customer',
    roles: ['member'],
  },
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

    const results: { phone: string; email: string; roles: string[]; status: string; referralCode?: string }[] = [];

    for (const testUser of TEST_USERS) {
      // Match the mock auth email format used by AuthContext
      const mockEmail = `91${testUser.phone}@elabazar.local`;
      const tempPassword = `elabazar_91${testUser.phone}_temp_2026`;

      // Check if user already exists by email
      const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers();
      let user = existingUsers?.users?.find(u => u.email === mockEmail);

      if (!user) {
        const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
          email: mockEmail,
          password: tempPassword,
          email_confirm: true,
          user_metadata: { full_name: testUser.fullName, phone: `+91${testUser.phone}` }
        });

        if (createError) {
          console.error(`Error creating user ${testUser.phone}:`, createError);
          results.push({ phone: testUser.phone, email: mockEmail, roles: testUser.roles, status: `Error: ${createError.message}` });
          continue;
        }
        user = newUser.user;
        console.log('Created test user:', user.id, mockEmail);
      }

      // Update profile with phone and user_level
      const profileUpdate: Record<string, unknown> = {
        full_name: testUser.fullName,
        phone: `+91${testUser.phone}`,
      };
      if (testUser.userLevel) {
        profileUpdate.user_level = testUser.userLevel;
      }
      await supabaseAdmin.from('profiles').update(profileUpdate).eq('id', user.id);

      // Add roles (delete existing first to avoid conflicts, then insert)
      await supabaseAdmin.from('user_roles').delete().eq('user_id', user.id);
      for (const role of testUser.roles) {
        await supabaseAdmin.from('user_roles').insert({ user_id: user.id, role });
      }

      // Create delivery partner record if needed
      if (testUser.isDeliveryPartner) {
        const { data: existingDp } = await supabaseAdmin
          .from('delivery_partners')
          .select('id')
          .eq('user_id', user.id)
          .maybeSingle();

        if (!existingDp) {
          await supabaseAdmin.from('delivery_partners').insert({
            user_id: user.id,
            vehicle_type: 'Motorcycle',
            vehicle_number: 'KA01AB1234',
            is_available: true,
          });
        }
      }

      // Create referral code if specified
      let referralCode = testUser.referralCode;
      if (referralCode) {
        const { data: existingCode } = await supabaseAdmin
          .from('referral_codes')
          .select('code')
          .eq('user_id', user.id)
          .maybeSingle();

        if (!existingCode) {
          await supabaseAdmin.from('referral_codes').insert({
            code: referralCode,
            user_id: user.id,
            max_uses: 100,
            is_active: true,
          });
        } else {
          referralCode = existingCode.code;
        }
      }

      // Ensure wallet exists
      const { data: existingWallet } = await supabaseAdmin
        .from('wallets')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle();

      if (!existingWallet) {
        await supabaseAdmin.from('wallets').insert({ user_id: user.id, balance: 0 });
      }

      results.push({
        phone: testUser.phone,
        email: mockEmail,
        roles: testUser.roles,
        referralCode,
        status: 'Success',
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Test users seeded. Use these phone numbers to login:',
        users: results,
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
