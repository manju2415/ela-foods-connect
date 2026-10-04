import { memberLevelLabel } from "@/lib/memberLevel";
import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Users, ChevronRight, ChevronDown, Crown, Shield, UserCircle, Search, Eye } from "lucide-react";
import { displayContact } from "@/lib/displayContact";

interface NetworkUser {
  user_id: string;
  email: string;
  full_name: string | null;
  user_level: string;
  referral_count: number;
  referred_by: string | null;
}

interface DownlineUser {
  user_id: string;
  email: string;
  full_name: string | null;
  user_level: string;
  level_depth: number;
  referred_by: string | null;
}

interface TreeNode {
  user: NetworkUser;
  children: TreeNode[];
  downline?: DownlineUser[];
}

interface AdminNetworkTreeProps {
  onViewUser: (userId: string) => void;
}

interface LevelCounts {
  founders: number;
  masters: number;
  associates: number;
}

export const AdminNetworkTree = ({ onViewUser }: AdminNetworkTreeProps) => {
  const [rootUsers, setRootUsers] = useState<NetworkUser[]>([]);
  const [levelCounts, setLevelCounts] = useState<LevelCounts>({ founders: 0, masters: 0, associates: 0 });
  const [loading, setLoading] = useState(true);
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  const [nodeDownlines, setNodeDownlines] = useState<Record<string, DownlineUser[]>>({});
  const [loadingNodes, setLoadingNodes] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<NetworkUser[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    fetchRootUsers();
    fetchLevelCounts();
  }, []);

  const fetchRootUsers = async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc("get_network_roots");

    if (!error && data) {
      setRootUsers(data as NetworkUser[]);
    }
    setLoading(false);
  };

  // Whole-network level breakdown (matches the Overview tab) — deliberately
  // NOT scoped to root users, since a founder/master can have an upline
  // referrer and still not be a "root" node in get_network_roots().
  // Uses the same scoped RPC as the Network Admin/Analytics dashboards
  // (SECURITY DEFINER, gated by is_any_admin) rather than direct profiles/
  // user_roles reads — those are RLS-restricted to admin/super_admin, which
  // left this breakdown empty for a pure mlm_admin viewer.
  const fetchLevelCounts = async () => {
    const { data, error } = await supabase.rpc("get_network_admin_stats");
    if (error || !data || (data as { error?: string }).error) return;
    const result = data as { founders: number; masters: number; associates: number };
    setLevelCounts({
      founders: result.founders,
      masters: result.masters,
      associates: result.associates,
    });
  };

  const fetchNodeDownline = async (userId: string) => {
    if (nodeDownlines[userId]) return;
    
    setLoadingNodes(prev => new Set(prev).add(userId));
    
    const { data, error } = await supabase.rpc("get_user_downline", { p_user_id: userId });
    
    if (!error && data) {
      setNodeDownlines(prev => ({ ...prev, [userId]: data as DownlineUser[] }));
    }
    
    setLoadingNodes(prev => {
      const next = new Set(prev);
      next.delete(userId);
      return next;
    });
  };

  const toggleNode = useCallback(async (nodeId: string) => {
    const isExpanding = !expandedNodes.has(nodeId);
    
    setExpandedNodes(prev => {
      const next = new Set(prev);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      return next;
    });

    if (isExpanding) {
      await fetchNodeDownline(nodeId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expandedNodes, nodeDownlines]);

  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }
    
    setSearching(true);
    const { data } = await supabase
      .from("profiles")
      .select("id, email, full_name, user_level, registration_fee_paid, referral_count, referred_by")
      .or(`email.ilike.%${searchQuery}%,full_name.ilike.%${searchQuery}%`)
      .limit(10);
    
    if (data) {
      setSearchResults(data.map(p => ({
        user_id: p.id,
        email: p.email,
        full_name: p.full_name,
        user_level: memberLevelLabel(p.user_level, p.registration_fee_paid).toLowerCase(),
        referral_count: p.referral_count || 0,
        referred_by: p.referred_by
      })));
    }
    setSearching(false);
  };

  const getLevelIcon = (level: string) => {
    switch (level) {
      case "founder":
        return <Crown className="h-4 w-4 text-amber-500" />;
      case "master":
        return <Shield className="h-4 w-4 text-blue-500" />;
      default:
        return <UserCircle className="h-4 w-4 text-green-500" />;
    }
  };

  const getLevelColor = (level: string) => {
    switch (level) {
      case "founder":
        return "bg-amber-500/10 text-amber-700 border-amber-500/20";
      case "master":
        return "bg-blue-500/10 text-blue-700 border-blue-500/20";
      case "associate":
        return "bg-green-500/10 text-green-700 border-green-500/20";
      default:
        return "bg-muted text-muted-foreground";
    }
  };

  const getDepthColor = (depth: number) => {
    const colors = [
      "border-l-primary",
      "border-l-blue-500",
      "border-l-green-500",
      "border-l-amber-500",
      "border-l-purple-500",
    ];
    return colors[Math.min(depth, colors.length - 1)];
  };

  const renderDownlineNode = (user: DownlineUser, allDownline: DownlineUser[], depth: number = 1) => {
    const children = allDownline.filter(u => u.referred_by === user.user_id);
    const hasChildren = children.length > 0;
    const isExpanded = expandedNodes.has(user.user_id);

    return (
      <div key={user.user_id} className="relative">
        <div 
          className={`flex items-start gap-2 p-3 border-l-4 ${getDepthColor(depth)} bg-card rounded-r-lg mb-2 hover:bg-muted/50 transition-colors`}
          style={{ marginLeft: `${Math.min(depth, 4) * 12}px` }}
        >
          {hasChildren ? (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 shrink-0"
              onClick={() => toggleNode(user.user_id)}
            >
              {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </Button>
          ) : (
            <div className="w-6 h-6 flex items-center justify-center shrink-0">
              <div className="w-2 h-2 rounded-full bg-muted-foreground/30" />
            </div>
          )}
          
          <div className="flex items-start gap-3 flex-1 min-w-0">
            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
              {getLevelIcon(user.user_level)}
            </div>
            <div className="min-w-0 flex-1 space-y-1">
              <p className="font-medium break-words leading-tight">{user.full_name || "Unnamed"}</p>
              <p className="text-xs text-muted-foreground truncate">{displayContact(user.email)}</p>
              <div className="flex flex-wrap items-center gap-1.5">
                <Badge variant="outline" className={`text-xs ${getLevelColor(user.user_level)}`}>
                  {user.user_level || "No role"}
                </Badge>
                <Badge variant="secondary" className="text-xs">
                  L{user.level_depth}
                </Badge>
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 shrink-0"
              onClick={() => onViewUser(user.user_id)}
            >
              <Eye className="h-4 w-4" />
            </Button>
          </div>
        </div>
        
        {isExpanded && hasChildren && (
          <div className="relative">
            {children.map(child => renderDownlineNode(child, allDownline, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  const renderRootNode = (user: NetworkUser) => {
    const isExpanded = expandedNodes.has(user.user_id);
    const isLoading = loadingNodes.has(user.user_id);
    const downline = nodeDownlines[user.user_id] || [];
    const directChildren = downline.filter(u => u.level_depth === 1);
    const hasChildren = user.referral_count > 0;

    return (
      <div key={user.user_id} className="relative">
        <div className="flex items-center gap-2 p-4 bg-primary/5 border border-primary/20 rounded-lg mb-2 hover:bg-primary/10 transition-colors">
          {hasChildren ? (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0"
              onClick={() => toggleNode(user.user_id)}
              disabled={isLoading}
            >
              {isLoading ? (
                <div className="h-4 w-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              ) : isExpanded ? (
                <ChevronDown className="h-5 w-5" />
              ) : (
                <ChevronRight className="h-5 w-5" />
              )}
            </Button>
          ) : (
            <div className="w-8 h-8" />
          )}
          
          <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center shrink-0">
            {getLevelIcon(user.user_level)}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold truncate">{user.full_name || "Unnamed"}</p>
            <p className="text-sm text-muted-foreground truncate">{user.email}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Badge className={getLevelColor(user.user_level)}>
              {user.user_level || "No role"}
            </Badge>
            <Badge variant="outline">
              {user.referral_count} referrals
            </Badge>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => onViewUser(user.user_id)}
            >
              <Eye className="h-4 w-4" />
            </Button>
          </div>
        </div>
        
        {isExpanded && downline.length > 0 && (
          <div className="ml-4 border-l-2 border-muted pl-2">
            {directChildren.map(child => renderDownlineNode(child, downline))}
          </div>
        )}
      </div>
    );
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Full Network Tree
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[1, 2, 3, 4].map(i => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="h-5 w-5" />
          Full Network Tree
        </CardTitle>
        <CardDescription>
          Complete MLM hierarchy starting from root users
        </CardDescription>
      </CardHeader>
      <CardContent>
        {/* Search */}
        <div className="flex gap-2 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search users by name or email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              className="pl-9"
            />
          </div>
          <Button onClick={handleSearch} disabled={searching}>
            {searching ? "Searching..." : "Search"}
          </Button>
        </div>

        {/* Search Results */}
        {searchResults.length > 0 && (
          <div className="mb-6 p-4 border rounded-lg bg-muted/20">
            <h4 className="font-medium mb-3">Search Results</h4>
            <div className="space-y-2">
              {searchResults.map(user => (
                <div key={user.user_id} className="flex items-center gap-3 p-3 bg-card rounded-lg">
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                    {getLevelIcon(user.user_level)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{user.full_name || "Unnamed"}</p>
                    <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                  </div>
                  <Badge variant="outline" className={getLevelColor(user.user_level)}>
                    {user.user_level || "No role"}
                  </Badge>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onViewUser(user.user_id)}
                  >
                    <Eye className="h-4 w-4 mr-1" />
                    View
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          <div className="p-3 rounded-lg bg-muted/50 text-center">
            <p className="text-2xl font-bold">{rootUsers.length}</p>
            <p className="text-xs text-muted-foreground">Root Users</p>
          </div>
          <div className="p-3 rounded-lg bg-amber-500/10 text-center">
            <p className="text-2xl font-bold text-amber-600">{levelCounts.founders}</p>
            <p className="text-xs text-muted-foreground">Founders</p>
          </div>
          <div className="p-3 rounded-lg bg-blue-500/10 text-center">
            <p className="text-2xl font-bold text-blue-600">{levelCounts.masters}</p>
            <p className="text-xs text-muted-foreground">Masters</p>
          </div>
          <div className="p-3 rounded-lg bg-green-500/10 text-center">
            <p className="text-2xl font-bold text-green-600">{levelCounts.associates}</p>
            <p className="text-xs text-muted-foreground">Associates</p>
          </div>
        </div>

        {/* Tree */}
        {rootUsers.length === 0 ? (
          <div className="text-center py-12">
            <Users className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">No Users Yet</h3>
            <p className="text-muted-foreground">The network will appear here once users register.</p>
          </div>
        ) : (
          <div className="border rounded-lg p-4 bg-muted/20 max-h-[600px] overflow-y-auto space-y-2">
            {rootUsers.map(user => renderRootNode(user))}
          </div>
        )}

        {/* Legend */}
        <div className="flex flex-wrap gap-4 mt-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <Crown className="h-4 w-4 text-amber-500" />
            <span>Founder</span>
          </div>
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-blue-500" />
            <span>Master</span>
          </div>
          <div className="flex items-center gap-2">
            <UserCircle className="h-4 w-4 text-green-500" />
            <span>Associate</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
