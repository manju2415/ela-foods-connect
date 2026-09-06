import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

// Sanitize secrets that may have been stored as "KEY=value" instead of "value"
const sanitizeSecret = (raw: string | undefined): string => {
  if (!raw) return '';
  const trimmed = raw.trim().replace(/^["']|["']$/g, '');
  // If user pasted "MSG91_TEMPLATE_ID=abc123", strip the prefix
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
      console.error('[msg91-send-otp] MSG91_AUTH_TOKEN not configured');
      return new Response(
        JSON.stringify({ success: false, error: 'MSG91 is not configured. Contact support.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const templateId = sanitizeSecret(Deno.env.get('MSG91_TEMPLATE_ID'));
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
    if (mobile.length === 10) {
      mobile = '91' + mobile;
    }

    const requestBody = {
      mobile,
      template_id: templateId,
      otp_length: 6,
    };

    console.log('[msg91-send-otp] Sending OTP to:', mobile);
    console.log('[msg91-send-otp] Template ID (sanitized):', templateId);
    console.log('[msg91-send-otp] Request body:', JSON.stringify(requestBody));

    let supabaseLogger: ReturnType<typeof createClient> | null = null;
    try {
      supabaseLogger = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      );
    } catch {
      // Logging is best-effort; never let it block sending the OTP.
    }
    const logAttempt = async (outcome: string, providerRequestId?: string, error?: string) => {
      try {
        await supabaseLogger?.from('otp_send_log').insert({
          phone: mobile,
          outcome,
          provider_request_id: providerRequestId ?? null,
          error: error ?? null,
        });
      } catch (logErr) {
        console.error('[msg91-send-otp] Failed to write otp_send_log:', logErr);
      }
    };

    interface Msg91Response {
      type?: string;
      message?: string;
      request_id?: string;
    }

    // Intermittent network/server errors happen occasionally before MSG91 is
    // even reached — retry once, immediately, rather than failing the whole
    // login flow on a single hiccup.
    let response: Response | null = null;
    let fetchError: unknown = null;
    for (let attempt = 0; attempt < 2 && !response; attempt++) {
      try {
        response = await fetch('https://control.msg91.com/api/v5/otp', {
          method: 'POST',
          headers: {
            'authkey': authKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(requestBody),
        });
      } catch (err) {
        fetchError = err;
        console.error(`[msg91-send-otp] Fetch attempt ${attempt + 1} failed:`, err);
      }
    }

    if (!response) {
      const message = fetchError instanceof Error ? fetchError.message : 'Could not reach SMS provider';
      await logAttempt('internal_error', undefined, message);
      return new Response(
        JSON.stringify({ success: false, error: message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const responseText = await response.text();
    console.log('[msg91-send-otp] HTTP Status:', response.status);
    console.log('[msg91-send-otp] Response:', responseText);

    let data: Msg91Response = {};
    try {
      data = JSON.parse(responseText);
    } catch {
      console.error('[msg91-send-otp] Failed to parse response:', responseText);
      await logAttempt('invalid_response', undefined, responseText.slice(0, 500));
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

    const isSuccess =
      data.type === 'success' ||
      data.type === 'OTP sent successfully' ||
      data.message === 'OTP sent successfully';

    if (isSuccess) {
      await logAttempt('success', data.request_id);
      return new Response(
        JSON.stringify({
          success: true,
          requestId: data.request_id,
          providerStatus: response.status,
          providerResponse: data,
          mobile,
          templateIdMasked: templateId.slice(0, 6) + '…' + templateId.slice(-4),
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    await logAttempt('provider_error', data.request_id, data.message || data.type || 'Failed to send OTP');
    return new Response(
      JSON.stringify({
        success: false,
        error: data.message || data.type || 'Failed to send OTP',
        providerStatus: response.status,
        providerResponse: data,
        mobile,
        templateIdMasked: templateId.slice(0, 6) + '…' + templateId.slice(-4),
      }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('[msg91-send-otp] Error:', err);
    return new Response(
      JSON.stringify({ success: false, error: err instanceof Error ? err.message : 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
