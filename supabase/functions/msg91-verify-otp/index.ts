import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const sanitizeSecret = (raw: string | undefined): string => {
  if (!raw) return '';
  const trimmed = raw.trim().replace(/^["']|["']$/g, '');
  const eqIdx = trimmed.indexOf('=');
  if (eqIdx > -1 && /^[A-Z_][A-Z0-9_]*$/i.test(trimmed.slice(0, eqIdx))) {
    return trimmed.slice(eqIdx + 1).trim();
  }
  return trimmed;
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authKey = sanitizeSecret(Deno.env.get('MSG91_AUTH_TOKEN'));
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

    interface Msg91Response {
      type?: string;
      message?: string;
    }

    let data: Msg91Response = {};
    try {
      data = JSON.parse(responseText);
    } catch {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Invalid response from SMS provider',
          providerStatus: response.status,
          providerResponse: responseText,
        }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const msg = (data.message || '').toString().toLowerCase();
    const alreadyVerified = msg.includes('already verified');
    if (data.type === 'success' || alreadyVerified) {
      return new Response(
        JSON.stringify({ success: true, providerResponse: data, alreadyVerified }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({
        success: false,
        error: data.message || data.type || 'OTP verification failed',
        providerStatus: response.status,
        providerResponse: data,
        mobile,
      }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('[msg91-verify-otp] Error:', err);
    return new Response(
      JSON.stringify({ success: false, error: err instanceof Error ? err.message : 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
