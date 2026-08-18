import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Users, ChevronRight, ChevronDown, User, Crown, Shield, UserCircle } from "lucide-react";

interface DownlineUser {
  user_id: string;
  email: string;
  full_name: string | null;
  user_level: string;
  level_depth: number;
  referred_by: string | null;
}

interface TreeNode {
  user: DownlineUser;
  children: TreeNode[];
}

interface NetworkTreeVisualProps {
  userId: string;
}

// Login ids are stored as {phone}@elabazar.local — show the readable phone instead.
export const displayContact = (email: string) => {
  const local = (email || "").split("@")[0];
  if (/^\d{10,14}$/.test(local)) {
    const digits = local.length > 10 ? local.slice(-10) : local;
    return `+91 ${digits.slice(0, 5)} ${digits.slice(5)}`;
  }
  return email;
};

export const NetworkTreeVisual = ({ userId }: NetworkTreeVisualProps) => {
  const [downline, setDownline] = useState<DownlineUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  const [rootUser, setRootUser] = useState<{ email: string; full_name: string | null; user_level: string } | null>(null);
  const [previewUser, setPreviewUser] = useState<DownlineUser | null>(null);

  useEffect(() => {
    fetchData();
  }, [userId]);

  const fetchData = async () => {
    setLoading(true);
    
    // Fetch user profile and downline in parallel
    const [profileRes, downlineRes] = await Promise.all([
      supabase.from("profiles").select("email, full_name, user_level").eq("id", userId).single(),
      supabase.rpc("get_user_downline", { p_user_id: userId })
    ]);
    
    if (profileRes.data) {
      setRootUser(profileRes.data);
    }
    
    if (!downlineRes.error && downlineRes.data) {
      setDownline(downlineRes.data as DownlineUser[]);
      // Auto-expand first level
      const firstLevelIds = (downlineRes.data as DownlineUser[])
        .filter(u => u.level_depth === 1)
        .map(u => u.user_id);
      setExpandedNodes(new Set(firstLevelIds));
    }
    
    setLoading(false);
  };

  const toggleNode = useCallback((nodeId: string) => {
    setExpandedNodes(prev => {
      const next = new Set(prev);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      return next;
    });
  }, []);

  // Build tree structure from flat list
  const buildTree = useCallback((users: DownlineUser[], parentId: string): TreeNode[] => {
    const children = users.filter(u => u.referred_by === parentId);
    return children.map(child => ({
      user: child,
      children: buildTree(users, child.user_id)
    }));
  }, []);

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
    return colors[Math.min(depth - 1, colors.length - 1)];
  };

  const renderTreeNode = (node: TreeNode, depth: number = 1) => {
    const hasChildren = node.children.length > 0;
    const isExpanded = expandedNodes.has(node.user.user_id);
    // Cap the indent so deep levels never squeeze the name column off-screen.
    const indent = Math.min(depth, 4) * 12;

    return (
      <div key={node.user.user_id} className="relative">
        <div 
          className={`flex items-start gap-2 p-3 border-l-4 ${getDepthColor(depth)} bg-card rounded-r-lg mb-2 hover:bg-muted/50 transition-colors`}
          style={{ marginLeft: `${indent}px` }}
        >
          {hasChildren ? (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 shrink-0"
              onClick={() => toggleNode(node.user.user_id)}
            >
              {isExpanded ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
            </Button>
          ) : (
            <div className="w-6 h-6 flex items-center justify-center shrink-0">
              <div className="w-2 h-2 rounded-full bg-muted-foreground/30" />
            </div>
          )}
          
          <button
            type="button"
            onClick={() => setPreviewUser(node.user)}
            className="flex items-start gap-3 flex-1 min-w-0 text-left"
          >
            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
              {getLevelIcon(node.user.user_level)}
            </div>
            <div className="min-w-0 flex-1 space-y-1">
              <p className="font-medium break-words leading-tight">
                {node.user.full_name || "Unnamed"}
              </p>
              <p className="text-xs text-muted-foreground truncate">
                {displayContact(node.user.email)}
              </p>
              <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                <Badge variant="outline" className={`text-xs ${getLevelColor(node.user.user_level)}`}>
                  {node.user.user_level}
                </Badge>
                <Badge variant="secondary" className="text-xs">
                  L{node.user.level_depth}
                </Badge>
                {hasChildren && (
                  <Badge variant="outline" className="text-xs">
                    {node.children.length} refs
                  </Badge>
                )}
              </div>
            </div>
          </button>
        </div>
        
        {isExpanded && hasChildren && (
          <div className="relative">
            {node.children.map(child => renderTreeNode(child, depth + 1))}
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
            Network Tree
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

  const tree = buildTree(downline, userId);
  const stats = {
    total: downline.length,
    direct: downline.filter(u => u.level_depth === 1).length,
    founders: downline.filter(u => u.user_level === "founder").length,
    masters: downline.filter(u => u.user_level === "master").length,
    associates: downline.filter(u => u.user_level === "associate").length,
  };

  const previewChildren = previewUser
    ? downline.filter(u => u.referred_by === previewUser.user_id)
    : [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="h-5 w-5" />
          Network Tree
        </CardTitle>
        <CardDescription>
          Visual hierarchy of your referral network — tap a member to preview their details
        </CardDescription>
      </CardHeader>
      <CardContent>
        {/* Stats Summary */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6">
          <div className="p-3 rounded-lg bg-muted/50 text-center">
            <p className="text-2xl font-bold">{stats.total}</p>
            <p className="text-xs text-muted-foreground">Total Network</p>
          </div>
          <div className="p-3 rounded-lg bg-primary/10 text-center">
            <p className="text-2xl font-bold text-primary">{stats.direct}</p>
            <p className="text-xs text-muted-foreground">Direct Referrals</p>
          </div>
          <div className="p-3 rounded-lg bg-amber-500/10 text-center">
            <p className="text-2xl font-bold text-amber-600">{stats.founders}</p>
            <p className="text-xs text-muted-foreground">Founders</p>
          </div>
          <div className="p-3 rounded-lg bg-blue-500/10 text-center">
            <p className="text-2xl font-bold text-blue-600">{stats.masters}</p>
            <p className="text-xs text-muted-foreground">Masters</p>
          </div>
          <div className="p-3 rounded-lg bg-green-500/10 text-center">
            <p className="text-2xl font-bold text-green-600">{stats.associates}</p>
            <p className="text-xs text-muted-foreground">Associates</p>
          </div>
        </div>

        {downline.length === 0 ? (
          <div className="text-center py-12">
            <Users className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">No Referrals Yet</h3>
            <p className="text-muted-foreground max-w-md mx-auto">
              Share your referral code to start building your network and earn bonuses.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {/* Root User Node */}
            {rootUser && (
              <div className="flex items-start gap-3 p-4 bg-primary/5 border border-primary/20 rounded-lg mb-4">
                <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center shrink-0">
                  <User className="h-5 w-5 text-primary-foreground" />
                </div>
                <div className="flex-1 min-w-0 space-y-1">
                  <p className="font-semibold break-words">{rootUser.full_name || "You"}</p>
                  <p className="text-sm text-muted-foreground truncate">
                    {displayContact(rootUser.email)}
                  </p>
                  <Badge className={`${getLevelColor(rootUser.user_level)} w-fit`}>
                    {rootUser.user_level}
                  </Badge>
                </div>
              </div>
            )}

            {/* Tree */}
            <div className="border rounded-lg p-2 sm:p-4 bg-muted/20 max-h-[500px] overflow-y-auto">
              {tree.map(node => renderTreeNode(node))}
            </div>

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
          </div>
        )}

        {/* Member preview */}
        <Sheet open={!!previewUser} onOpenChange={(open) => !open && setPreviewUser(null)}>
          <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto">
            {previewUser && (
              <>
                <SheetHeader className="text-left">
                  <SheetTitle className="break-words">
                    {previewUser.full_name || "Unnamed member"}
                  </SheetTitle>
                  <SheetDescription>{displayContact(previewUser.email)}</SheetDescription>
                </SheetHeader>

                <div className="grid grid-cols-3 gap-3 mt-4">
                  <div className="p-3 rounded-lg bg-muted/50 text-center">
                    <p className="text-sm font-semibold capitalize">{previewUser.user_level}</p>
                    <p className="text-xs text-muted-foreground">Level</p>
                  </div>
                  <div className="p-3 rounded-lg bg-muted/50 text-center">
                    <p className="text-sm font-semibold">L{previewUser.level_depth}</p>
                    <p className="text-xs text-muted-foreground">Depth</p>
                  </div>
                  <div className="p-3 rounded-lg bg-muted/50 text-center">
                    <p className="text-sm font-semibold">{previewChildren.length}</p>
                    <p className="text-xs text-muted-foreground">Direct refs</p>
                  </div>
                </div>

                <div className="mt-5">
                  <h4 className="font-medium mb-2">Members under this person</h4>
                  {previewChildren.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No direct referrals yet.</p>
                  ) : (
                    <div className="space-y-2">
                      {previewChildren.map(child => (
                        <div
                          key={child.user_id}
                          className="flex items-start gap-3 p-3 rounded-lg border bg-card"
                        >
                          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                            {getLevelIcon(child.user_level)}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="font-medium break-words leading-tight">
                              {child.full_name || "Unnamed"}
                            </p>
                            <p className="text-xs text-muted-foreground truncate">
                              {displayContact(child.email)}
                            </p>
                          </div>
                          <Badge variant="outline" className={`text-xs shrink-0 ${getLevelColor(child.user_level)}`}>
                            {child.user_level}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </SheetContent>
        </Sheet>
      </CardContent>
    </Card>
  );
};
