import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { SuperAdminGuard } from "@/components/admin/SuperAdminGuard";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Crown, Search, UserPlus, Trash2, Loader2, Users, Copy, TrendingUp } from "lucide-react";

interface Founder {
  id: string;
  email: string;
  full_name: string | null;
  referral_count: number;
  is_designated_founder: boolean;
  referral_codes: { code: string; usage_count: number }[];
}

interface UserProfile {
  id: string;
  email: string;
  full_name: string | null;
}

interface FounderCommission {
  id: string;
  level_depth: number;
  commission_amount: number;
  description: string | null;
  is_active: boolean;
}

export default function Founders() {
  const [search, setSearch] = useState("");
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [userSearch, setUserSearch] = useState("");
  const [searchResults, setSearchResults] = useState<UserProfile[]>([]);
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [removeFounder, setRemoveFounder] = useState<Founder | null>(null);
  const queryClient = useQueryClient();

  // Fetch founders with founding_member role
  const { data: founders = [], isLoading } = useQuery({
    queryKey: ["designated-founders"],
    queryFn: async () => {
      // Get users with founding_member role
      const { data: roleData } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "founding_member")
        .limit(4);
      
      if (!roleData || roleData.length === 0) return [];
      
      const userIds = roleData.map(r => r.user_id);
      
      const { data: profileData } = await supabase
        .from("profiles")
        .select("id, email, full_name, referral_count")
        .in("id", userIds);
      
      const foundersWithCodes = await Promise.all(
        (profileData || []).map(async (founder) => {
          const { data: codes } = await supabase
            .from("referral_codes")
            .select("code, usage_count")
            .eq("user_id", founder.id);
          return { 
            ...founder, 
            is_designated_founder: true,
            referral_codes: codes || [] 
          };
        })
      );
      
      return foundersWithCodes as Founder[];
    },
  });

  // Fetch founder level commissions from mlm_settings
  const { data: commissions = [] } = useQuery({
    queryKey: ["founder-commissions"],
    queryFn: async () => {
      const { data } = await supabase
        .from("mlm_settings")
        .select("value")
        .eq("key", "founder_level_commissions")
        .maybeSingle();

      if (data?.value) {
        const val = data.value as { enabled?: boolean; levels?: { depth: number; amount: number; description: string }[] };
        if (val.enabled !== false && val.levels) {
          return val.levels.map((l, i) => ({
            id: String(i + 1),
            level_depth: l.depth,
            commission_amount: l.amount,
            description: l.description,
            is_active: true,
          })) as FounderCommission[];
        }
      }

      // Fallback defaults
      return [
        { id: "1", level_depth: 1, commission_amount: 100, description: "Direct referral", is_active: true },
        { id: "2", level_depth: 2, commission_amount: 75, description: "Level 2", is_active: true },
        { id: "3", level_depth: 3, commission_amount: 50, description: "Level 3", is_active: true },
        { id: "4", level_depth: 4, commission_amount: 40, description: "Level 4", is_active: true },
        { id: "5", level_depth: 5, commission_amount: 30, description: "Level 5", is_active: true },
      ] as FounderCommission[];
    },
  });

  // Search users
  const searchUsers = async (query: string) => {
    if (query.length < 3) {
      setSearchResults([]);
      return;
    }
    
    setIsSearching(true);
    const { data } = await supabase
      .from("profiles")
      .select("id, email, full_name")
      .or(`email.ilike.%${query}%,full_name.ilike.%${query}%`)
      .limit(10);
    
    setSearchResults((data || []) as UserProfile[]);
    setIsSearching(false);
  };

  // Add founder mutation - adds founding_member role
  const addFounderMutation = useMutation({
    mutationFn: async (userId: string) => {
      if (founders.length >= 4) {
        throw new Error("Maximum 4 founders allowed");
      }
      
      // Check if already has founding_member role
      const { data: existingRole } = await supabase
        .from("user_roles")
        .select("id")
        .eq("user_id", userId)
        .eq("role", "founding_member")
        .maybeSingle();
      
      if (existingRole) {
        throw new Error("User is already a founder");
      }
      
      // Add founding_member role
      const { error: roleError } = await supabase
        .from("user_roles")
        .insert({ user_id: userId, role: "founding_member" });
      
      if (roleError) throw roleError;
      
      // Update profile user_level to founder
      const { error: profileError } = await supabase
        .from("profiles")
        .update({ user_level: "founder" })
        .eq("id", userId);
      
      if (profileError) throw profileError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["designated-founders"] });
      toast.success("Founder added successfully");
      setIsAddDialogOpen(false);
      setSelectedUser(null);
      setUserSearch("");
      setSearchResults([]);
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  // Remove founder mutation - removes founding_member role
  const removeFounderMutation = useMutation({
    mutationFn: async (userId: string) => {
      // Remove founding_member role
      const { error: roleError } = await supabase
        .from("user_roles")
        .delete()
        .eq("user_id", userId)
        .eq("role", "founding_member");
      
      if (roleError) throw roleError;
      
      // Update profile user_level back to master
      const { error: profileError } = await supabase
        .from("profiles")
        .update({ user_level: "master" })
        .eq("id", userId);
      
      if (profileError) throw profileError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["designated-founders"] });
      toast.success("Founder removed successfully");
      setRemoveFounder(null);
    },
    onError: (error) => {
      toast.error("Failed to remove founder: " + error.message);
    },
  });

  // Update commission mutation - saves to mlm_settings
  const updateCommissionMutation = useMutation({
    mutationFn: async ({ id, amount }: { id: string; amount: number }) => {
      const index = Number(id) - 1;
      const currentLevels = commissions.map(c => ({
        depth: c.level_depth,
        amount: c.commission_amount,
        description: c.description || `Level ${c.level_depth}`,
      }));
      currentLevels[index] = { ...currentLevels[index], amount };

      const { error } = await supabase
        .from("mlm_settings")
        .upsert({
          key: "founder_level_commissions",
          value: { enabled: true, levels: currentLevels } as unknown as Record<string, never>,
          updated_at: new Date().toISOString(),
        }, { onConflict: "key" });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["founder-commissions"] });
      toast.success("Commission updated");
    },
    onError: (error) => {
      toast.error("Failed to update: " + error.message);
    },
  });

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    toast.success("Code copied to clipboard");
  };

  const filteredFounders = founders.filter(
    (f) =>
      f.email.toLowerCase().includes(search.toLowerCase()) ||
      f.full_name?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <SuperAdminGuard>
      <AdminLayout>
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold flex items-center gap-2">
                <Crown className="h-8 w-8 text-primary" />
                Designated Founders
              </h1>
              <p className="text-muted-foreground">
                Manage the 4 designated founders who earn multi-level commissions
              </p>
            </div>
            <Button
              onClick={() => setIsAddDialogOpen(true)}
              disabled={founders.length >= 4}
            >
              <UserPlus className="h-4 w-4 mr-2" />
              Add Founder ({founders.length}/4)
            </Button>
          </div>

          {/* Founders List */}
          <Card>
            <CardHeader>
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  Current Founders ({founders.length}/4)
                </CardTitle>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Search founders..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-9 w-full sm:w-64"
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin" />
                </div>
              ) : founders.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Crown className="h-12 w-12 mx-auto mb-4 text-muted-foreground/50" />
                  <p>No founders designated yet</p>
                  <p className="text-sm">Add users as founders to enable multi-level commissions</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Founder</TableHead>
                      <TableHead>Referral Codes</TableHead>
                      <TableHead>Network Size</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredFounders.map((founder) => (
                      <TableRow key={founder.id}>
                        <TableCell>
                          <div>
                            <div className="font-medium flex items-center gap-2">
                              {founder.full_name || "No name"}
                              <Crown className="h-4 w-4 text-primary" />
                            </div>
                            <div className="text-sm text-muted-foreground">{founder.email}</div>
                          </div>
                        </TableCell>
                        <TableCell>
                          {founder.referral_codes.length > 0 ? (
                            <div className="flex flex-wrap gap-2">
                              {founder.referral_codes.map((rc) => (
                                <Badge
                                  key={rc.code}
                                  variant="outline"
                                  className="cursor-pointer"
                                  onClick={() => copyCode(rc.code)}
                                >
                                  {rc.code}
                                  <Copy className="h-3 w-3 ml-1" />
                                </Badge>
                              ))}
                            </div>
                          ) : (
                            <span className="text-muted-foreground">No codes</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary">{founder.referral_count} members</Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setRemoveFounder(founder)}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {/* Level Commissions */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5" />
                Multi-Level Commission Rates
              </CardTitle>
              <CardDescription>
                All upline members (Founders, Masters, Associates) earn these commissions based on level depth in their network
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
                {commissions.map((commission) => (
                  <div
                    key={commission.id}
                    className="p-4 border rounded-lg space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <Badge variant={commission.level_depth <= 3 ? "default" : "secondary"}>
                        Level {commission.level_depth}
                      </Badge>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Amount (₹)</Label>
                      <Input
                        type="number"
                        min="0"
                        value={commission.commission_amount}
                        onChange={(e) =>
                          updateCommissionMutation.mutate({
                            id: commission.id,
                            amount: Number(e.target.value),
                          })
                        }
                        className="h-8"
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {commission.description}
                    </p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Add Founder Dialog */}
        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Designated Founder</DialogTitle>
              <DialogDescription>
                Search for a user to designate as a founder. Founders earn commissions from all levels in their network.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Search User</Label>
                <Input
                  placeholder="Search by email or name..."
                  value={userSearch}
                  onChange={(e) => {
                    setUserSearch(e.target.value);
                    searchUsers(e.target.value);
                  }}
                />
              </div>

              {isSearching && (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="h-5 w-5 animate-spin" />
                </div>
              )}

              {searchResults.length > 0 && (
                <div className="border rounded-lg divide-y max-h-48 overflow-y-auto">
                  {searchResults.map((user) => (
                    <div
                      key={user.id}
                      className={`p-3 cursor-pointer hover:bg-muted transition-colors ${
                        selectedUser?.id === user.id ? "bg-primary/10" : ""
                      }`}
                      onClick={() => setSelectedUser(user)}
                    >
                      <div className="font-medium">{user.full_name || "No name"}</div>
                      <div className="text-sm text-muted-foreground">{user.email}</div>
                    </div>
                  ))}
                </div>
              )}

              {selectedUser && (
                <div className="p-3 bg-muted rounded-lg">
                  <p className="text-sm font-medium">Selected:</p>
                  <p>{selectedUser.full_name || selectedUser.email}</p>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={() => selectedUser && addFounderMutation.mutate(selectedUser.id)}
                disabled={!selectedUser || addFounderMutation.isPending}
              >
                {addFounderMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Add as Founder
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Remove Founder Confirmation */}
        <AlertDialog open={!!removeFounder} onOpenChange={() => setRemoveFounder(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Remove Founder?</AlertDialogTitle>
              <AlertDialogDescription>
                This will remove {removeFounder?.full_name || removeFounder?.email} as a designated founder.
                They will no longer earn multi-level commissions from their network.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => removeFounder && removeFounderMutation.mutate(removeFounder.id)}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Remove Founder
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </AdminLayout>
    </SuperAdminGuard>
  );
}
