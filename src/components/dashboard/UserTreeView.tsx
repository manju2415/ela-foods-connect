import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Users, ChevronRight, ChevronDown, User } from "lucide-react";

interface DownlineUser {
  user_id: string;
  email: string;
  full_name: string | null;
  user_level: string;
  level_depth: number;
  referred_by: string | null;
}

interface UserTreeViewProps {
  userId: string;
}

export const UserTreeView = ({ userId }: UserTreeViewProps) => {
  const [downline, setDownline] = useState<DownlineUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedLevels, setExpandedLevels] = useState<Set<number>>(new Set([1]));

  useEffect(() => {
    fetchDownline();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const fetchDownline = async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc("get_user_downline", {
      p_user_id: userId,
    });
    
    if (!error && data) {
      setDownline(data as DownlineUser[]);
    }
    setLoading(false);
  };

  const toggleLevel = (level: number) => {
    setExpandedLevels((prev) => {
      const next = new Set(prev);
      if (next.has(level)) {
        next.delete(level);
      } else {
        next.add(level);
      }
      return next;
    });
  };

  const groupByLevel = () => {
    const grouped: Record<number, DownlineUser[]> = {};
    downline.forEach((user) => {
      if (!grouped[user.level_depth]) {
        grouped[user.level_depth] = [];
      }
      grouped[user.level_depth].push(user);
    });
    return grouped;
  };

  const getLevelBadgeColor = (level: string) => {
    switch (level) {
      case "founder":
        return "bg-primary/10 text-primary border-primary/20";
      case "master":
        return "bg-blue-500/10 text-blue-600 border-blue-500/20";
      case "associate":
        return "bg-green-500/10 text-green-600 border-green-500/20";
      default:
        return "bg-muted text-muted-foreground";
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Your Network
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  const groupedByLevel = groupByLevel();
  const levels = Object.keys(groupedByLevel).map(Number).sort();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="h-5 w-5" />
          Your Network
        </CardTitle>
        <CardDescription>
          {downline.length} total members in your network
        </CardDescription>
      </CardHeader>
      <CardContent>
        {downline.length === 0 ? (
          <div className="text-center py-8">
            <Users className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">No referrals yet</p>
            <p className="text-sm text-muted-foreground mt-1">
              Share your referral code to grow your network
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {levels.map((level) => (
              <div key={level} className="border rounded-lg overflow-hidden">
                <button
                  onClick={() => toggleLevel(level)}
                  className="w-full flex items-center justify-between p-3 bg-muted/50 hover:bg-muted transition-colors"
                >
                  <div className="flex items-center gap-2">
                    {expandedLevels.has(level) ? (
                      <ChevronDown className="h-4 w-4" />
                    ) : (
                      <ChevronRight className="h-4 w-4" />
                    )}
                    <span className="font-medium">Level {level}</span>
                    <Badge variant="secondary">{groupedByLevel[level].length} members</Badge>
                  </div>
                </button>
                
                {expandedLevels.has(level) && (
                  <div className="divide-y">
                    {groupedByLevel[level].map((user) => (
                      <div
                        key={user.user_id}
                        className="flex items-center justify-between p-3 hover:bg-muted/30"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                            <User className="h-4 w-4 text-primary" />
                          </div>
                          <div>
                            <p className="font-medium">{user.full_name || "Unnamed"}</p>
                            <p className="text-sm text-muted-foreground">{user.email}</p>
                          </div>
                        </div>
                        <Badge className={getLevelBadgeColor(user.user_level)}>
                          {user.user_level || "No role"}
                        </Badge>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};