import { useEffect, useState } from "react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { SuperAdminGuard } from "@/components/admin/SuperAdminGuard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Plus, Loader2, Ticket } from "lucide-react";

interface FoundingMember {
  id: string;
  user_id: string;
  created_at: string;
  profile: {
    full_name: string | null;
    email: string;
  } | null;
  referral_codes: {
    code: string;
    is_active: boolean;
  }[];
}

const FoundingMembers = () => {
  const [members, setMembers] = useState<FoundingMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [generatingCode, setGeneratingCode] = useState<string | null>(null);
  const { toast } = useToast();

  const fetchMembers = async () => {
    setLoading(true);
    const { data: roles, error } = await supabase
      .from("user_roles")
      .select("id, user_id, created_at")
      .eq("role", "founding_member");

    if (error) {
      toast({ title: "Error fetching members", variant: "destructive" });
      setLoading(false);
      return;
    }

    // Fetch profiles and referral codes for each member
    const membersWithDetails = await Promise.all(
      (roles || []).map(async (role) => {
        const [profileRes, codesRes] = await Promise.all([
          supabase.from("profiles").select("full_name, email").eq("id", role.user_id).maybeSingle(),
          supabase.from("referral_codes").select("code, is_active").eq("user_id", role.user_id),
        ]);

        return {
          ...role,
          profile: profileRes.data,
          referral_codes: codesRes.data || [],
        };
      })
    );

    setMembers(membersWithDetails);
    setLoading(false);
  };

  useEffect(() => {
    fetchMembers();
  }, []);

  const handleAddFoundingMember = async () => {
    if (!email.trim()) {
      toast({ title: "Please enter an email", variant: "destructive" });
      return;
    }

    setIsAdding(true);

    // Find user by email
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("id")
      .eq("email", email.trim().toLowerCase())
      .maybeSingle();

    if (profileError || !profile) {
      toast({ title: "User not found with this email", variant: "destructive" });
      setIsAdding(false);
      return;
    }

    // Check if already a founding member
    const { data: existingRole } = await supabase
      .from("user_roles")
      .select("id")
      .eq("user_id", profile.id)
      .eq("role", "founding_member")
      .maybeSingle();

    if (existingRole) {
      toast({ title: "User is already a founding member", variant: "destructive" });
      setIsAdding(false);
      return;
    }

    // Add founding member role
    const { error: roleError } = await supabase
      .from("user_roles")
      .insert({ user_id: profile.id, role: "founding_member" });

    if (roleError) {
      toast({ title: "Failed to add founding member", variant: "destructive" });
      setIsAdding(false);
      return;
    }

    toast({ title: "Founding member added successfully!" });
    setEmail("");
    setDialogOpen(false);
    setIsAdding(false);
    fetchMembers();
  };

  const generateReferralCode = async (userId: string) => {
    setGeneratingCode(userId);

    // Generate a unique code
    const { data: codeData, error: codeError } = await supabase.rpc("generate_referral_code");

    if (codeError) {
      toast({ title: "Failed to generate code", variant: "destructive" });
      setGeneratingCode(null);
      return;
    }

    // Insert the referral code
    const { error: insertError } = await supabase
      .from("referral_codes")
      .insert({ user_id: userId, code: codeData });

    if (insertError) {
      toast({ title: "Failed to save referral code", variant: "destructive" });
      setGeneratingCode(null);
      return;
    }

    toast({ title: `Referral code ${codeData} generated!` });
    setGeneratingCode(null);
    fetchMembers();
  };

  return (
    <SuperAdminGuard>
      <AdminLayout>
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold">Founding Members</h2>
              <p className="text-muted-foreground">Manage founding members and their referral codes</p>
            </div>

          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Add Member
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add Founding Member</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-4">
                <div className="space-y-2">
                  <Label htmlFor="email">User Email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="user@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    The user must already have an account
                  </p>
                </div>
                <Button onClick={handleAddFoundingMember} disabled={isAdding} className="w-full">
                  {isAdding && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Add as Founding Member
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>All Founding Members</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : members.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">No founding members yet</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Referral Codes</TableHead>
                    <TableHead>Added</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {members.map((member) => (
                    <TableRow key={member.id}>
                      <TableCell className="font-medium">
                        {member.profile?.full_name || "N/A"}
                      </TableCell>
                      <TableCell>{member.profile?.email || "N/A"}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {member.referral_codes.length === 0 ? (
                            <span className="text-muted-foreground text-sm">No codes</span>
                          ) : (
                            member.referral_codes.map((code) => (
                              <Badge
                                key={code.code}
                                variant={code.is_active ? "default" : "secondary"}
                              >
                                {code.code}
                              </Badge>
                            ))
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        {new Date(member.created_at).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => generateReferralCode(member.user_id)}
                          disabled={generatingCode === member.user_id}
                        >
                          {generatingCode === member.user_id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <>
                              <Ticket className="h-4 w-4 mr-1" />
                              Generate Code
                            </>
                          )}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  </SuperAdminGuard>
  );
};

export default FoundingMembers;
