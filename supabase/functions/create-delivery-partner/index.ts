import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface CreateDeliveryPartnerRequest {
  phone: string;
  fullName: string;
  vehicleType?: string;
  vehicleNumber?: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Authorization required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

    const supabaseUser = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { Authorization: authHeader } }
    });

    const { data: { user: callerUser }, error: userError } = await supabaseUser.auth.getUser();
    if (userError || !callerUser) {
      return new Response(
        JSON.stringify({ error: 'Invalid authentication' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: roles } = await supabaseUser
      .from('user_roles')
      .select('role')
      .eq('user_id', callerUser.id);

    const isAdmin = roles?.some(r => r.role === 'admin' || r.role === 'super_admin');
    if (!isAdmin) {
      return new Response(
        JSON.stringify({ error: 'Admin access required' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const body: CreateDeliveryPartnerRequest = await req.json();
    const { phone, fullName, vehicleType, vehicleNumber } = body;

    if (!phone || !fullName) {
      return new Response(
        JSON.stringify({ error: 'Phone and full name are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    // Use the same email/password pattern as the login flow (createSessionForPhone)
    const cleanPhone = phone.replace(/\+/g, '');
    const mockEmail = `${cleanPhone}@elabazar.local`;
    const tempPassword = `elabazar_${cleanPhone}_temp_2026`;

    // Create user with email/password matching the OTP login flow
    const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email: mockEmail,
      password: tempPassword,
      email_confirm: true,
      user_metadata: { full_name: fullName, phone: phone }
    });

    if (createError) {
      // If user already exists, find them and add delivery partner role
      if (createError.message.includes('already') || createError.message.includes('exists')) {
        // Look up existing user by email
        const { data: { users }, error: listError } = await supabaseAdmin.auth.admin.listUsers();
        if (listError) {
          return new Response(
            JSON.stringify({ error: 'Failed to look up existing user' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        
        const existingUser = users.find(u => u.email === mockEmail);
        if (!existingUser) {
          return new Response(
            JSON.stringify({ error: 'User not found with this phone number' }),
            { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        console.log('Found existing user:', existingUser.id);

        // Add delivery_partner role
        const { error: roleError } = await supabaseAdmin
          .from('user_roles')
          .upsert({ user_id: existingUser.id, role: 'delivery_partner' }, { onConflict: 'user_id,role' });
        if (roleError) console.error('Error adding role:', roleError);

        // Create delivery_partners record
        const { error: dpError } = await supabaseAdmin
          .from('delivery_partners')
          .upsert({
            user_id: existingUser.id,
            vehicle_type: vehicleType || null,
            vehicle_number: vehicleNumber || null,
            is_available: true
          }, { onConflict: 'user_id' });

        if (dpError) {
          // Try insert if upsert fails (no unique constraint on user_id)
          const { error: dpInsertError } = await supabaseAdmin
            .from('delivery_partners')
            .insert({
              user_id: existingUser.id,
              vehicle_type: vehicleType || null,
              vehicle_number: vehicleNumber || null,
              is_available: true
            });
          if (dpInsertError) {
            console.error('Error creating delivery partner:', dpInsertError);
          }
        }

        return new Response(
          JSON.stringify({
            success: true,
            user_id: existingUser.id,
            phone: phone,
            message: 'Existing user converted to delivery partner. They can login with their phone number via OTP.'
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      console.error('Error creating user:', createError);
      return new Response(
        JSON.stringify({ error: createError.message }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!newUser.user) {
      return new Response(
        JSON.stringify({ error: 'Failed to create user' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Created user:', newUser.user.id);

    await new Promise(resolve => setTimeout(resolve, 1000));

    // Add delivery_partner role (handle_new_user trigger may have already added 'member')
    const { error: roleError } = await supabaseAdmin
      .from('user_roles')
      .insert({ user_id: newUser.user.id, role: 'delivery_partner' });

    if (roleError) {
      console.error('Error adding role:', roleError);
    }

    const { error: dpError } = await supabaseAdmin
      .from('delivery_partners')
      .insert({
        user_id: newUser.user.id,
        vehicle_type: vehicleType || null,
        vehicle_number: vehicleNumber || null,
        is_available: true
      });

    if (dpError) {
      console.error('Error creating delivery partner:', dpError);
      return new Response(
        JSON.stringify({ error: dpError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Update profile with name and phone
    await supabaseAdmin
      .from('profiles')
      .update({ full_name: fullName, phone: phone })
      .eq('id', newUser.user.id);

    console.log('Delivery partner created successfully');

    return new Response(
      JSON.stringify({
        success: true,
        user_id: newUser.user.id,
        phone: phone,
        message: 'Delivery partner created. They can now login with their phone number via OTP.'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Unexpected error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
