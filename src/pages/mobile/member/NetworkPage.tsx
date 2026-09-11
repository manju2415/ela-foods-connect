import { useState } from "react";
import { PullToRefresh } from "@/components/mobile/PullToRefresh";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";
import { useAuth } from "@/contexts/AuthContext";
import { MobileAppLayout } from "@/components/mobile/MobileAppLayout";
import { MobileHeader } from "@/components/mobile/MobileHeader";
import { NetworkTreeVisual } from "@/components/dashboard/NetworkTreeVisual";

export default function MemberNetworkPage() {
  const { user } = useAuth();
  const [revision, setRevision] = useState(0);
  const refresh = usePullToRefresh({ onRefresh: async () => { setRevision(value => value + 1); } });
  return (
    <MobileAppLayout appType="member">
      <div className="min-h-screen bg-background">
        <MobileHeader title="My Network" showBack />
        <PullToRefresh {...refresh}>
        <div className="p-4 space-y-3">
          {user && <NetworkTreeVisual key={`${user.id}-${revision}`} userId={user.id} />}
        </div>
        </PullToRefresh>
      </div>
    </MobileAppLayout>
  );
}
