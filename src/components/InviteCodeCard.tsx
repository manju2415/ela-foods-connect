import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Copy, Gift, Share2 } from "lucide-react";
import { toast } from "sonner";
import { copyToClipboard } from "@/lib/clipboard";
import { useRegistrationEnabled } from "@/hooks/useRegistrationEnabled";

const INVITE_BASE_URL = "https://elabazar.com/auth";

/**
 * Invite & earn card. Shows the user's active invite code; while registration
 * is switched off every logged-in user can get one, so it is issued on first
 * view. The inviter is credited (per MLM settings) on the invitee's first paid
 * order. Renders nothing when the user has no code and cannot get one.
 */
export function InviteCodeCard({ userId }: { userId: string }) {
  const { registrationEnabled, isLoading: settingLoading } = useRegistrationEnabled();
  const [code, setCode] = useState<string | null>(null);

  useEffect(() => {
    if (settingLoading) return;
    let cancelled = false;
    (async () => {
      const { data: existing } = await supabase
        .from("referral_codes")
        .select("code")
        .eq("user_id", userId)
        .eq("is_active", true)
        .limit(1)
        .maybeSingle();
      if (existing?.code) {
        if (!cancelled) setCode(existing.code);
        return;
      }
      if (registrationEnabled) return;
      const { data: issued } = await supabase.rpc("generate_user_referral_code", { p_user_id: userId });
      if (!cancelled && typeof issued === "string") setCode(issued);
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, registrationEnabled, settingLoading]);

  if (!code) return null;

  const link = `${INVITE_BASE_URL}?ref=${encodeURIComponent(code)}`;
  const message = `Join me on Elabazar! Log in with my invite code ${code}: ${link}`;

  const handleCopy = async () => {
    const ok = await copyToClipboard(code);
    if (ok) toast.success("Invite code copied");
    else toast.error("Please copy the code manually.");
  };

  const handleShare = async () => {
    try {
      if (navigator.share) {
        await navigator.share({ title: "Elabazar invite", text: message });
        return;
      }
    } catch {
      return; // share sheet dismissed
    }
    const ok = await copyToClipboard(message);
    if (ok) toast.success("Invite message copied");
    else toast.error("Please copy the code manually.");
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Gift className="h-4 w-4" /> Invite &amp; Earn
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between gap-3 rounded-lg border border-primary/20 bg-primary/5 p-3">
          <span className="font-mono text-xl font-bold text-primary break-all">{code}</span>
          <Button variant="outline" size="sm" onClick={handleCopy}>
            <Copy className="mr-1 h-4 w-4" /> Copy
          </Button>
        </div>
        <Button className="w-full" onClick={handleShare}>
          <Share2 className="mr-2 h-4 w-4" /> Share invite
        </Button>
        <p className="text-xs text-muted-foreground">
          {registrationEnabled
            ? "Friends sign up with your code. You earn wallet credits when they complete their membership payment."
            : "Friends log in with your code. You earn wallet credits when they place their first paid order."}
        </p>
      </CardContent>
    </Card>
  );
}
