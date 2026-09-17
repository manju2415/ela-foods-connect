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

interface FirebaseServiceAccount {
  project_id: string;
  client_email: string;
  private_key: string;
}

// In-memory only, scoped to this function instance's lifetime — never
// written to disk, a table, or any response. A cold start (new instance)
// simply mints a fresh token on its first send.
let cachedAccessToken: { token: string; expiresAt: number } | null = null;

function base64UrlEncode(input: string | Uint8Array): string {
  const bytes = typeof input === "string" ? new TextEncoder().encode(input) : input;
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function pemPrivateKeyToArrayBuffer(pem: string): ArrayBuffer {
  const base64 = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s+/g, "");
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

// Signs a Google OAuth2 service-account JWT with the Web Crypto API (no
// Node-only crypto, no firebase-admin — both unavailable/unsupported in the
// Deno runtime Supabase Edge Functions run on) and exchanges it for a
// short-lived access token scoped to Firebase Cloud Messaging only.
async function getFcmAccessToken(serviceAccount: FirebaseServiceAccount): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedAccessToken && cachedAccessToken.expiresAt - 60 > now) {
    return cachedAccessToken.token;
  }

  const header = { alg: "RS256", typ: "JWT" };
  const claimSet = {
    iss: serviceAccount.client_email,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  };
  const signingInput = `${base64UrlEncode(JSON.stringify(header))}.${base64UrlEncode(JSON.stringify(claimSet))}`;

  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    pemPrivateKeyToArrayBuffer(serviceAccount.private_key),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    cryptoKey,
    new TextEncoder().encode(signingInput)
  );
  const jwt = `${signingInput}.${base64UrlEncode(new Uint8Array(signature))}`;

  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });

  if (!tokenResponse.ok) {
    // Never log the JWT or the service account — only the token endpoint's
    // own error response, which describes the failure (e.g. clock skew,
    // revoked key) without containing any credential material.
    const errText = await tokenResponse.text();
    throw new Error(`Failed to obtain FCM OAuth2 access token: ${tokenResponse.status} ${errText}`);
  }

  const tokenJson = await tokenResponse.json();
  cachedAccessToken = {
    token: tokenJson.access_token,
    expiresAt: now + (tokenJson.expires_in ?? 3600),
  };
  return cachedAccessToken.token;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const serviceAccountRaw = Deno.env.get("FIREBASE_SERVICE_ACCOUNT");
    if (!serviceAccountRaw) {
      throw new Error("FIREBASE_SERVICE_ACCOUNT not configured");
    }
    let serviceAccount: FirebaseServiceAccount;
    try {
      serviceAccount = JSON.parse(serviceAccountRaw);
    } catch {
      // Deliberately no detail from the parse error and no snippet of the
      // input — either would risk leaking fragments of the credential.
      throw new Error("FIREBASE_SERVICE_ACCOUNT is not valid JSON");
    }
    if (!serviceAccount.project_id || !serviceAccount.client_email || !serviceAccount.private_key) {
      throw new Error("FIREBASE_SERVICE_ACCOUNT is missing project_id, client_email, or private_key");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");

    // Only admins may push notifications to arbitrary users.
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const callerClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY") ?? "", {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user: caller } } = await callerClient.auth.getUser();
    if (!caller) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { data: isAdmin } = await supabaseClient.rpc("is_admin", { _user_id: caller.id });
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "Only admins can send push notifications" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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
      ?.filter((p) => p.push_token)
      .map((p) => p.push_token) || [];

    if (tokens.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: "No push tokens found for users" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Send notifications via FCM HTTP v1, authenticated with a short-lived
    // OAuth2 access token derived from the service account (never a static
    // server key). Same notification/data fields as before, in v1's shape.
    const accessToken = await getFcmAccessToken(serviceAccount);
    const fcmEndpoint = `https://fcm.googleapis.com/v1/projects/${serviceAccount.project_id}/messages:send`;

    const results = await Promise.allSettled(
      tokens.map(async (token: string) => {
        const response = await fetch(fcmEndpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            message: {
              token,
              notification: {
                title,
                body,
              },
              data: {
                ...data,
                type: type || "general",
              },
              // Same values the legacy payload sent (icon/click_action) —
              // carried over unchanged for parity, not verified/fixed here.
              android: {
                notification: {
                  icon: "/favicon.png",
                  click_action: "FLUTTER_NOTIFICATION_CLICK",
                },
              },
            },
          }),
        });

        if (!response.ok) {
          const errText = await response.text();
          throw new Error(`FCM error: ${response.status} ${errText}`);
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
