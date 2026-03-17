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
      console.error('[msg91-send-otp] MSG91_AUTH_TOKEN not configured');
      return new Response(
        JSON.stringify({ success: false, error: 'MSG91 is not configured. Contact support.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const templateId = Deno.env.get('MSG91_TEMPLATE_ID');
    if (!templateId) {
      console.error('[msg91-send-otp] MSG91_TEMPLATE_ID not configured');
      return new Response(
        JSON.stringify({ success: false, error: 'MSG91 template is not configured. Contact support.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { phone } = await req.json();
    if (!phone) {
      return new Response(
        JSON.stringify({ success: false, error: 'Phone number is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // MSG91 expects country code + number without + (e.g. 919876543210)
    let mobile = phone.replace(/^\+/, '').replace(/\s+/g, '');
    
    // Ensure it starts with country code 91
    if (mobile.length === 10) {
      mobile = '91' + mobile;
    }

    const requestBody = {
      mobile,
      template_id: templateId,
      otp_length: 6,
    };

    console.log('[msg91-send-otp] Sending OTP to:', mobile);
    console.log('[msg91-send-otp] Request body:', JSON.stringify(requestBody));

    const response = await fetch('https://control.msg91.com/api/v5/otp', {
      method: 'POST',
      headers: {
        'authkey': authKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    const responseText = await response.text();
    console.log('[msg91-send-otp] HTTP Status:', response.status);
    console.log('[msg91-send-otp] Response:', responseText);

    let data;
    try {
      data = JSON.parse(responseText);
    } catch {
      console.error('[msg91-send-otp] Failed to parse response:', responseText);
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid response from SMS provider' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (data.type === 'success' || data.type === 'OTP sent successfully') {
      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ success: false, error: data.message || 'Failed to send OTP' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('[msg91-send-otp] Error:', err);
    return new Response(
      JSON.stringify({ success: false, error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
