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
        JSON.stringify({ success: false, error: 'MSG91 is not configured. Contact support.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const templateId = Deno.env.get('MSG91_TEMPLATE_ID');
    if (!templateId) {
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
    const mobile = phone.replace(/^\+/, '');

    console.log('[msg91-send-otp] Sending OTP to:', mobile);

    const response = await fetch('https://control.msg91.com/api/v5/otp', {
      method: 'POST',
      headers: {
        'authkey': authKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        mobile,
        template_id: templateId,
        otp_length: 6,
      }),
    });

    const data = await response.json();
    console.log('[msg91-send-otp] Response:', JSON.stringify(data));

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
