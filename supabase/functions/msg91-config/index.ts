import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

// SECURITY: Do NOT return MSG91_AUTH_TOKEN to the client. The widget-based
// frontend flow is not used (we go through msg91-send-otp / msg91-verify-otp
// edge functions instead). This endpoint now only confirms configuration
// status without leaking the auth key.
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const hasToken = !!Deno.env.get('MSG91_AUTH_TOKEN');
  const hasTemplate = !!Deno.env.get('MSG91_TEMPLATE_ID');

  return new Response(
    JSON.stringify({
      configured: hasToken && hasTemplate,
      hasToken,
      hasTemplate,
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
});
