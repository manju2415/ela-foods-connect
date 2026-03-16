import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const tokenAuth = Deno.env.get('MSG91_AUTH_TOKEN');
  if (!tokenAuth) {
    return new Response(
      JSON.stringify({ error: 'MSG91 is not configured' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  return new Response(
    JSON.stringify({
      widgetId: '36637067444a333332313632',
      tokenAuth,
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
});
