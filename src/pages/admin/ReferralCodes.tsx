import { useEffect, useState } from "react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { SuperAdminGuard } from "@/components/admin/SuperAdminGuard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";

interface ReferralCode {
  id: string;
  code: string;
  user_id: string;
  is_active: boolean;
  usage_count: number | null;
  max_uses: number | null;
  created_at: string;
  owner_name: string | null;
  owner_email: string;
}

const ReferralCodes = () => {
  const [codes, setCodes] = useState<ReferralCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const { toast } = useToast();

  const fetchCodes = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("referral_codes")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      toast({ title: "Error fetching codes", variant: "destructive" });
      setLoading(false);
      return;
    }

    // Fetch owner info for each code
    const codesWithOwners = await Promise.all(
      (data || []).map(async (code) => {
        const { data: profile } = await supabase
          .from("profiles")
          .select("full_name, email")
          .eq("id", code.user_id)
          .maybeSingle();

        return {
          ...code,
          owner_name: profile?.full_name || null,
          owner_email: profile?.email || "Unknown",
        };
      })
    );

    setCodes(codesWithOwners);
    setLoading(false);
  };

  useEffect(() => {
    fetchCodes();
  }, []);

  const toggleCodeStatus = async (codeId: string, currentStatus: boolean) => {
    setTogglingId(codeId);
    
    const { error } = await supabase
      .from("referral_codes")
      .update({ is_active: !currentStatus })
      .eq("id", codeId);

    if (error) {
      toast({ 
        title: "Failed to update code status", 
        description: error.message,
        variant: "destructive" 
      });
    } else {
      toast({ title: `Code ${!currentStatus ? "activated" : "deactivated"} successfully` });
      fetchCodes();
    }
    
    setTogglingId(null);
  };

  return (
    <SuperAdminGuard>
      <AdminLayout>
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold">Referral Codes</h2>
          <p className="text-muted-foreground">View and manage all referral codes</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>All Referral Codes</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : codes.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">No referral codes yet</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Code</TableHead>
                    <TableHead>Owner</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Usage</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="text-right">Active</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {codes.map((code) => (
                    <TableRow key={code.id}>
                      <TableCell>
                        <Badge variant="outline" className="font-mono text-base">
                          {code.code}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="font-medium">{code.owner_name || "N/A"}</p>
                          <p className="text-sm text-muted-foreground">{code.owner_email}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={code.is_active ? "default" : "secondary"}>
                          {code.is_active ? "Active" : "Inactive"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {code.usage_count || 0}
                        {code.max_uses && ` / ${code.max_uses}`}
                      </TableCell>
                      <TableCell>
                        {new Date(code.created_at).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="text-right">
                        <Switch
                          checked={code.is_active ?? false}
                          onCheckedChange={() => toggleCodeStatus(code.id, code.is_active ?? false)}
                          disabled={togglingId === code.id}
                        />
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

export default ReferralCodes;
