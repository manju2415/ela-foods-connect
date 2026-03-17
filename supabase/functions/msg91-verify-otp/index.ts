import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authKey = Deno.env.get('MSG91_AUTH_TOKEN');
    if (!authKey) {
      return new Response(
        JSON.stringify({ success: false, error: 'MSG91 not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { phone, otp } = await req.json();
    if (!phone || !otp) {
      return new Response(
        JSON.stringify({ success: false, error: 'Phone and OTP are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Ensure format: 91XXXXXXXXXX (no +)
    let mobile = phone.replace(/^\+/, '').replace(/\s+/g, '');
    if (mobile.length === 10) {
      mobile = '91' + mobile;
    }

    const verifyUrl = `https://control.msg91.com/api/v5/otp/verify?mobile=${mobile}&otp=${otp}`;
    console.log('[msg91-verify-otp] Verifying OTP for:', mobile);

    const response = await fetch(verifyUrl, {
      method: 'GET',
      headers: { 'authkey': authKey },
    });

    const responseText = await response.text();
    console.log('[msg91-verify-otp] HTTP Status:', response.status);
    console.log('[msg91-verify-otp] Response:', responseText);

    let data;
    try {
      data = JSON.parse(responseText);
    } catch {
      console.error('[msg91-verify-otp] Failed to parse response:', responseText);
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid response from SMS provider' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (data.type === 'success') {
      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ success: false, error: data.message || 'OTP verification failed' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('[msg91-verify-otp] Error:', err);
    return new Response(
      JSON.stringify({ success: false, error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
