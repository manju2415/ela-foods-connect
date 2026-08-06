import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { SuperAdminGuard } from "@/components/admin/SuperAdminGuard";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Loader2, Receipt } from "lucide-react";

interface PaymentLog {
  id: string;
  user_id: string;
  amount: number;
  payment_id: string | null;
  order_id: string | null;
  status: string;
  notes: string | null;
  created_at: string;
}

export default function FounderPayments() {
  const { data: logs = [], isLoading } = useQuery({
    queryKey: ["founder-payment-logs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("founder_payment_logs")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as PaymentLog[];
    },
  });

  const { data: profiles = [] } = useQuery({
    queryKey: ["founder-payment-profiles", logs.map((l) => l.user_id).join(",")],
    queryFn: async () => {
      if (logs.length === 0) return [];
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, email, phone, founder_status")
        .in("id", logs.map((l) => l.user_id));
      if (error) throw error;
      return data as { id: string; full_name: string | null; email: string; phone: string | null; founder_status: string | null }[];
    },
    enabled: logs.length > 0,
  });

  const profileFor = (id: string) => profiles.find((p) => p.id === id);
  const total = logs
    .filter((l) => l.status === "success")
    .reduce((sum, l) => sum + Number(l.amount), 0);

  return (
    <SuperAdminGuard>
      <AdminLayout>
        <div className="space-y-6">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2">
              <Receipt className="h-7 w-7 text-primary" />
              Founder Payment Logs
            </h1>
            <p className="text-muted-foreground">All founding member registration fee transactions</p>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Total Collected</CardTitle>
              <CardDescription>Successful founder registration payments</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold">₹{total.toFixed(2)}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Transactions</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin" />
                </div>
              ) : logs.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">No founder payments yet</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Founder</TableHead>
                        <TableHead>Amount</TableHead>
                        <TableHead>Payment ID</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Date</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {logs.map((log) => {
                        const p = profileFor(log.user_id);
                        return (
                          <TableRow key={log.id}>
                            <TableCell>
                              <div className="font-medium">{p?.full_name || "Unknown"}</div>
                              <div className="text-sm text-muted-foreground">{p?.phone || p?.email}</div>
                            </TableCell>
                            <TableCell>₹{Number(log.amount).toFixed(2)}</TableCell>
                            <TableCell className="text-sm font-mono">{log.payment_id || "—"}</TableCell>
                            <TableCell>
                              <Badge variant={log.status === "success" ? "default" : "secondary"}>
                                {log.status}
                              </Badge>
                            </TableCell>
                            <TableCell>{new Date(log.created_at).toLocaleString()}</TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </AdminLayout>
    </SuperAdminGuard>
  );
}
