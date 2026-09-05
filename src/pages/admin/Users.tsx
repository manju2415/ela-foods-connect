import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { useUserRole } from "@/hooks/useUserRole";
import {
  AdminMobileCard,
  AdminMobileField,
} from "@/components/admin/AdminMobileCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Search,
  Users as UsersIcon,
  Shield,
  Crown,
  UserPlus,
  UserCog,
  Trash2,
  Wallet,
  IndianRupee,
  Download,
} from "lucide-react";
import { toast } from "sonner";
import { WalletAdjustDialog } from "@/components/admin/WalletAdjustDialog";
import { RecordPaymentDialog } from "@/components/admin/RecordPaymentDialog";
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
import { format } from "date-fns";
import { Database } from "@/integrations/supabase/types";
import { AddUserDialog } from "@/components/AddUserDialog";

type AppRole = Database["public"]["Enums"]["app_role"];

interface User {
  id: string;
  email: string;
  full_name: string | null;
  phone: string | null;
  is_active: boolean;
  created_at: string;
  roles: AppRole[];
  wallet_balance: number;
  withdrawable_balance: number;
  purchase_only_balance: number;
}

const ROLE_COLORS: Record<AppRole, string> = {
  member: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  founding_member:
    "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  admin:
    "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
  super_admin: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  delivery_partner:
    "bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200",
  mlm_admin:
    "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200",
};

export default function UsersPage() {
  const { isSuperAdmin } = useUserRole();
  const [search, setSearch] = useState("");
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [newRole, setNewRole] = useState<AppRole | "">("");
  const [userToDelete, setUserToDelete] = useState<User | null>(null);
  const [walletUser, setWalletUser] = useState<User | null>(null);
  const [paymentUser, setPaymentUser] = useState<User | null>(null);
  const queryClient = useQueryClient();

  const { data: users = [], isLoading } = useQuery({
    queryKey: ["admin-users"],
    queryFn: async () => {
      // Get all profiles
      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("id, email, full_name, phone, is_active, created_at")
        .order("created_at", { ascending: false });

      if (profilesError) throw profilesError;

      // Get all user roles
      const userIds = profiles.map((p) => p.id);
      const { data: roles } = await supabase
        .from("user_roles")
        .select("user_id, role")
        .in("user_id", userIds);

      const { data: wallets } = await supabase
        .from("wallets")
        .select("user_id, balance, withdrawable_balance, purchase_only_balance")
        .in("user_id", userIds);

      const walletMap = new Map(
        (wallets || []).map((w) => [
          w.user_id,
          {
            wallet_balance: Number(w.balance ?? 0),
            withdrawable_balance: Number(w.withdrawable_balance ?? 0),
            purchase_only_balance: Number(w.purchase_only_balance ?? 0),
          },
        ]),
      );

      const rolesMap = new Map<string, AppRole[]>();
      roles?.forEach((r) => {
        const existing = rolesMap.get(r.user_id) || [];
        rolesMap.set(r.user_id, [...existing, r.role]);
      });

      return profiles.map((profile) => ({
        ...profile,
        roles: rolesMap.get(profile.id) || [],
        ...(walletMap.get(profile.id) || {
          wallet_balance: 0,
          withdrawable_balance: 0,
          purchase_only_balance: 0,
        }),
      })) as User[];
    },
  });

  const toggleStatusMutation = useMutation({
    mutationFn: async ({
      userId,
      isActive,
    }: {
      userId: string;
      isActive: boolean;
    }) => {
      const { error } = await supabase
        .from("profiles")
        .update({ is_active: isActive })
        .eq("id", userId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      toast.success("User status updated");
      setEditingUser(null);
    },
    onError: () => {
      toast.error("Failed to update user status");
    },
  });

  const addRoleMutation = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: AppRole }) => {
      const { error } = await supabase
        .from("user_roles")
        .insert({ user_id: userId, role });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      toast.success("Role added successfully");
      setSelectedUser(null);
      setNewRole("");
    },
    onError: (error: unknown) => {
      const code = error && typeof error === "object" && "code" in error ? error.code : undefined;
      if (code === "23505") {
        toast.error("User already has this role");
      } else {
        toast.error("Failed to add role");
      }
    },
  });

  const removeUserMutation = useMutation({
    mutationFn: async (userId: string) => {
      const { data, error } = await supabase.functions.invoke("remove-user", {
        body: { user_id: userId },
      });
      if (error) throw error;
      if (data?.ok === false || data?.error)
        throw new Error(data.error || "Failed to remove user");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      toast.success("User removed successfully");
      setUserToDelete(null);
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to remove user");
    },
  });

  const removeRoleMutation = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: AppRole }) => {
      const { error } = await supabase
        .from("user_roles")
        .delete()
        .eq("user_id", userId)
        .eq("role", role);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      toast.success("Role removed successfully");
    },
    onError: () => {
      toast.error("Failed to remove role");
    },
  });

  const filteredUsers = users.filter(
    (user) =>
      user.email.toLowerCase().includes(search.toLowerCase()) ||
      user.full_name?.toLowerCase().includes(search.toLowerCase()) ||
      user.phone?.includes(search),
  );

  const exportUserReport = () => {
    const escapeCsv = (value: string) => `"${value.replace(/"/g, '""')}"`;
    const header = ["User Name", "Mobile Number", "Email"];
    const rows = users.map((user) =>
      [user.full_name || "N/A", user.phone || "N/A", user.email]
        .map(escapeCsv)
        .join(","),
    );
    const csv = [header.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `user-report-${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const getRoleIcon = (role: AppRole) => {
    switch (role) {
      case "super_admin":
        return <Crown className="h-3 w-3" />;
      case "admin":
        return <Shield className="h-3 w-3" />;
      default:
        return null;
    }
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Users</h1>
            <p className="text-muted-foreground">
              Manage user accounts and roles
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {isSuperAdmin && (
              <Button
                variant="outline"
                onClick={exportUserReport}
                disabled={users.length === 0}
              >
                <Download className="h-4 w-4 mr-2" />
                Download Report
              </Button>
            )}
            <AddUserDialog
              onUserAdded={() => {
                queryClient.invalidateQueries({ queryKey: ["admin-users"] });
              }}
              isAdmin={true}
              trigger={
                <Button>
                  <UserPlus className="h-4 w-4 mr-2" />
                  Invite your circle and Earn
                </Button>
              }
            />
          </div>
        </div>

        <Card className="max-w-full overflow-hidden">
          <CardHeader className="p-4 sm:p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <CardTitle className="flex items-center gap-2">
                <UsersIcon className="h-5 w-5" />
                All Users ({filteredUsers.length})
              </CardTitle>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search users..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9 w-full sm:w-64"
                />
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
              </div>
            ) : filteredUsers.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No users found
              </div>
            ) : (
              <>
                <div className="hidden md:block">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>User</TableHead>
                        <TableHead>Phone</TableHead>
                        <TableHead>Roles</TableHead>
                        <TableHead>Wallet</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Joined</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredUsers.map((user) => (
                        <TableRow key={user.id}>
                          <TableCell>
                            <div>
                              <div className="font-medium">
                                {user.full_name || "N/A"}
                              </div>
                              <div className="text-sm text-muted-foreground">
                                {user.email}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>{user.phone || "N/A"}</TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-1">
                              {user.roles.length === 0 ? (
                                <Badge variant="outline">No roles</Badge>
                              ) : (
                                user.roles.map((role) => (
                                  <Badge
                                    key={role}
                                    className={`${ROLE_COLORS[role]} flex items-center gap-1`}
                                    variant="secondary"
                                  >
                                    {getRoleIcon(role)}
                                    {role.replace("_", " ")}
                                  </Badge>
                                ))
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="font-medium">
                              ₹{user.wallet_balance.toFixed(2)}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              W ₹{user.withdrawable_balance.toFixed(2)} · P ₹
                              {user.purchase_only_balance.toFixed(2)}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant={user.is_active ? "default" : "secondary"}
                            >
                              {user.is_active ? "Active" : "Inactive"}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {format(new Date(user.created_at), "MMM d, yyyy")}
                          </TableCell>
                          <TableCell className="text-right space-x-1">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setEditingUser(user)}
                            >
                              <UserCog className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              title="Adjust wallet"
                              onClick={() => setWalletUser(user)}
                            >
                              <Wallet className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              title="Record registration payment"
                              onClick={() => setPaymentUser(user)}
                            >
                              <IndianRupee className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setSelectedUser(user)}
                            >
                              Manage Roles
                            </Button>
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() => setUserToDelete(user)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                <div className="space-y-3 md:hidden">
                  {filteredUsers.map((user) => (
                    <AdminMobileCard key={user.id}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="font-medium truncate">
                            {user.full_name || "N/A"}
                          </div>
                          <div className="text-sm text-muted-foreground break-all">
                            {user.email}
                          </div>
                        </div>
                        <Badge
                          variant={user.is_active ? "default" : "secondary"}
                          className="shrink-0"
                        >
                          {user.is_active ? "Active" : "Inactive"}
                        </Badge>
                      </div>
                      <div className="grid grid-cols-1 gap-3">
                        <AdminMobileField label="Phone">
                          {user.phone || "N/A"}
                        </AdminMobileField>
                        <AdminMobileField label="Roles">
                          <div className="flex flex-wrap gap-1">
                            {user.roles.length === 0 ? (
                              <Badge variant="outline">No roles</Badge>
                            ) : (
                              user.roles.map((role) => (
                                <Badge
                                  key={role}
                                  className={`${ROLE_COLORS[role]} flex items-center gap-1`}
                                  variant="secondary"
                                >
                                  {getRoleIcon(role)}
                                  {role.replace("_", " ")}
                                </Badge>
                              ))
                            )}
                          </div>
                        </AdminMobileField>
                        <AdminMobileField label="Wallet">
                          ₹{user.wallet_balance.toFixed(2)}
                          <span className="block text-xs text-muted-foreground">
                            W ₹{user.withdrawable_balance.toFixed(2)} · P ₹
                            {user.purchase_only_balance.toFixed(2)}
                          </span>
                        </AdminMobileField>
                        <AdminMobileField label="Joined">
                          {format(new Date(user.created_at), "MMM d, yyyy")}
                        </AdminMobileField>
                      </div>
                      <div className="flex flex-wrap gap-2 pt-1">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setEditingUser(user)}
                        >
                          <UserCog className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          title="Adjust wallet"
                          onClick={() => setWalletUser(user)}
                        >
                          <Wallet className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          title="Record payment"
                          onClick={() => setPaymentUser(user)}
                        >
                          <IndianRupee className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setSelectedUser(user)}
                          className="flex-1"
                        >
                          Manage Roles
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => setUserToDelete(user)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </AdminMobileCard>
                  ))}
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <WalletAdjustDialog
          userId={walletUser?.id ?? null}
          userName={walletUser?.full_name || walletUser?.email}
          open={!!walletUser}
          onOpenChange={(o) => !o && setWalletUser(null)}
          onSuccess={() =>
            queryClient.invalidateQueries({ queryKey: ["admin-users"] })
          }
        />

        <RecordPaymentDialog
          userId={paymentUser?.id ?? null}
          userName={paymentUser?.full_name || paymentUser?.email}
          open={!!paymentUser}
          onOpenChange={(o) => !o && setPaymentUser(null)}
          onSuccess={() =>
            queryClient.invalidateQueries({ queryKey: ["admin-users"] })
          }
        />

        {/* Manage Roles Dialog */}
        <Dialog
          open={!!selectedUser}
          onOpenChange={() => setSelectedUser(null)}
        >
          <DialogContent className="max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                Manage Roles: {selectedUser?.full_name || selectedUser?.email}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div>
                <h4 className="text-sm font-medium mb-2">Current Roles</h4>
                <div className="flex flex-wrap gap-2">
                  {selectedUser?.roles.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No roles assigned
                    </p>
                  ) : (
                    selectedUser?.roles.map((role) => (
                      <Badge
                        key={role}
                        className={`${ROLE_COLORS[role]} cursor-pointer`}
                        onClick={() => {
                          if (confirm(`Remove ${role} role?`)) {
                            removeRoleMutation.mutate({
                              userId: selectedUser.id,
                              role,
                            });
                          }
                        }}
                      >
                        {role.replace("_", " ")} ×
                      </Badge>
                    ))
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <h4 className="text-sm font-medium">Add Role</h4>
                <div className="flex gap-2">
                  <Select
                    value={newRole}
                    onValueChange={(v) => setNewRole(v as AppRole)}
                  >
                    <SelectTrigger className="flex-1">
                      <SelectValue placeholder="Select role" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="member">Member</SelectItem>
                      <SelectItem value="founding_member">
                        Founding Member
                      </SelectItem>
                      <SelectItem value="delivery_partner">
                        Delivery Partner
                      </SelectItem>
                      <SelectItem value="admin">Admin</SelectItem>
                      <SelectItem value="super_admin">Super Admin</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button
                    onClick={() => {
                      if (selectedUser && newRole) {
                        addRoleMutation.mutate({
                          userId: selectedUser.id,
                          role: newRole,
                        });
                      }
                    }}
                    disabled={!newRole || addRoleMutation.isPending}
                  >
                    Add
                  </Button>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setSelectedUser(null)}>
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Edit User Status Dialog */}
        <Dialog open={!!editingUser} onOpenChange={() => setEditingUser(null)}>
          <DialogContent className="max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                Edit User: {editingUser?.full_name || editingUser?.email}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label>Account Status</Label>
                  <p className="text-sm text-muted-foreground">
                    {editingUser?.is_active
                      ? "User can access the platform"
                      : "User is blocked from the platform"}
                  </p>
                </div>
                <Switch
                  checked={editingUser?.is_active || false}
                  onCheckedChange={(checked) => {
                    if (editingUser) {
                      toggleStatusMutation.mutate({
                        userId: editingUser.id,
                        isActive: checked,
                      });
                    }
                  }}
                />
              </div>
              <div className="border-t pt-4">
                <h4 className="text-sm font-medium mb-2">User Details</h4>
                <div className="text-sm space-y-1">
                  <p>
                    <span className="text-muted-foreground">Email:</span>{" "}
                    {editingUser?.email}
                  </p>
                  <p>
                    <span className="text-muted-foreground">Phone:</span>{" "}
                    {editingUser?.phone || "N/A"}
                  </p>
                  <p>
                    <span className="text-muted-foreground">Joined:</span>{" "}
                    {editingUser
                      ? format(new Date(editingUser.created_at), "PPP")
                      : ""}
                  </p>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditingUser(null)}>
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        {/* Remove User Confirmation */}
        <AlertDialog
          open={!!userToDelete}
          onOpenChange={() => setUserToDelete(null)}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Remove User</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to permanently remove{" "}
                {userToDelete?.full_name || userToDelete?.phone}? This action
                cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={() =>
                  userToDelete && removeUserMutation.mutate(userToDelete.id)
                }
              >
                {removeUserMutation.isPending ? "Removing..." : "Remove"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </AdminLayout>
  );
}
