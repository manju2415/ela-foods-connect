import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface NotificationRequest {
  userId?: string;
  userIds?: string[];
  title: string;
  body: string;
  data?: Record<string, string>;
  type?: string;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const FCM_SERVER_KEY = Deno.env.get("FCM_SERVER_KEY");
    if (!FCM_SERVER_KEY) {
      throw new Error("FCM_SERVER_KEY not configured");
    }

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { userId, userIds, title, body, data, type }: NotificationRequest = await req.json();

    // Get target user IDs
    const targetUserIds = userIds || (userId ? [userId] : []);
    if (targetUserIds.length === 0) {
      throw new Error("No target users specified");
    }

    // Fetch push tokens for users
    const { data: profiles, error: profilesError } = await supabaseClient
      .from("profiles")
      .select("id, push_token")
      .in("id", targetUserIds)
      .not("push_token", "is", null);

    if (profilesError) {
      throw profilesError;
    }

    const tokens = profiles
      ?.filter((p: any) => p.push_token)
      .map((p: any) => p.push_token) || [];

    if (tokens.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: "No push tokens found for users" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Send notifications via FCM
    const results = await Promise.allSettled(
      tokens.map(async (token: string) => {
        const response = await fetch("https://fcm.googleapis.com/fcm/send", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `key=${FCM_SERVER_KEY}`,
          },
          body: JSON.stringify({
            to: token,
            notification: {
              title,
              body,
              icon: "/favicon.png",
              click_action: "FLUTTER_NOTIFICATION_CLICK",
            },
            data: {
              ...data,
              type: type || "general",
            },
          }),
        });

        if (!response.ok) {
          throw new Error(`FCM error: ${response.statusText}`);
        }

        return response.json();
      })
    );

    // Create in-app notifications
    await Promise.all(
      targetUserIds.map(async (uid: string) => {
        await supabaseClient.rpc("create_notification", {
          p_user_id: uid,
          p_title: title,
          p_message: body,
          p_type: type || "general",
          p_reference_id: data?.orderId || null,
          p_reference_type: data?.type || null,
        });
      })
    );

    const successCount = results.filter((r) => r.status === "fulfilled").length;
    const failureCount = results.filter((r) => r.status === "rejected").length;

    return new Response(
      JSON.stringify({
        success: true,
        sent: successCount,
        failed: failureCount,
        totalTokens: tokens.length,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("Error sending push notification:", errorMessage);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
