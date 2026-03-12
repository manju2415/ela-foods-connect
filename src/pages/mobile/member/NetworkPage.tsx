import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { MobileHeader } from "@/components/mobile/MobileHeader";
import { PullToRefresh } from "@/components/mobile/PullToRefresh";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";
import { Card, CardContent } from "@/components/ui/card";
import { Users, User, ChevronRight } from "lucide-react";

interface NetworkMember {
  user_id: string;
  full_name: string;
  email: string;
  user_level: string;
  level_depth: number;
}

export default function MemberNetworkPage() {
  const { user } = useAuth();
  const [network, setNetwork] = useState<NetworkMember[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchNetwork = useCallback(async () => {
    if (!user) return;
    
    const { data } = await supabase.rpc("get_user_downline", { p_user_id: user.id });
    if (data) setNetwork(data);
    setLoading(false);
  }, [user]);

  useEffect(() => { fetchNetwork(); }, [fetchNetwork]);

  const { isPulling, isRefreshing, pullDistance, pullProgress, shouldTrigger, handlers } = usePullToRefresh({
    onRefresh: fetchNetwork,
  });

  const getLevelColor = (level: string) => {
    switch (level) {
      case "founder": return "bg-amber-100 text-amber-800";
      case "master": return "bg-purple-100 text-purple-800";
      default: return "bg-blue-100 text-blue-800";
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <MobileHeader title="My Network" showBack />
      <PullToRefresh isPulling={isPulling} isRefreshing={isRefreshing} pullDistance={pullDistance} pullProgress={pullProgress} shouldTrigger={shouldTrigger} handlers={handlers}>
        <div className="p-4 space-y-3">
          <Card className="bg-gradient-to-br from-purple-500 to-purple-600 text-white">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <Users className="h-8 w-8" />
                <div>
                  <p className="text-2xl font-bold">{network.length}</p>
                  <p className="text-sm opacity-80">Total Network Members</p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          {loading ? (
            Array.from({ length: 3 }).map((_, i) => (
              <Card key={i} className="animate-pulse"><CardContent className="p-4"><div className="h-12 bg-muted rounded" /></CardContent></Card>
            ))
          ) : network.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <Users className="h-16 w-16 mx-auto mb-4 opacity-50" />
              <p>No referrals yet</p>
            </div>
          ) : (
            network.map((member) => (
              <Card key={member.user_id}>
                <CardContent className="p-4 flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
                    <User className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div className="flex-1">
                    <p className="font-medium">{member.full_name || member.email}</p>
                    <span className={`text-xs px-2 py-0.5 rounded ${getLevelColor(member.user_level)}`}>
                      {member.user_level} • Level {member.level_depth}
                    </span>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </PullToRefresh>
    </div>
  );
}
