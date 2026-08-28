import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { SuperAdminGuard } from "@/components/admin/SuperAdminGuard";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AdminMobileCard } from "@/components/admin/AdminMobileCard";
import { useToast } from "@/hooks/use-toast";
import { Loader2, AlertTriangle, PackagePlus, X } from "lucide-react";
import { format } from "date-fns";

interface PaymentAttempt {
  id: string;
  payment_id: string;
  purpose: string;
  customer_name: string | null;
  customer_phone: string | null;
  customer_email: string | null;
  amount: number;
  items: any;
  status: string;
  order_id: string | null;
  notes: string | null;
  created_at: string;
}

export default function PaymentRecovery() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [busyId, setBusyId] = useState<string | null>(null);

  const { data: attempts = [], isLoading } = useQuery({
    queryKey: ["payment-attempts-unmatched"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payment_attempts")
        .select("*")
        .is("order_id", null)
        .neq("status", "converted")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as PaymentAttempt[];
    },
    refetchInterval: 60000,
  });

  const pending = attempts.filter((a) => a.status === "pending");

  const runAction = async (attempt: PaymentAttempt, action: "create_order" | "dismiss") => {
    setBusyId(attempt.id);
    try {
      const { data, error } = await supabase.functions.invoke("reconcile-payment-attempt", {
        body: { attempt_id: attempt.id, action },
      });
      if (error || data?.error) throw new Error(data?.error || error?.message || "Failed");

      toast({
        title: action === "dismiss" ? "Payment dismissed" : "Order created",
        description:
          action === "dismiss"
            ? "This payment will no longer appear here."
            : `Order ${data.order_number} was created and marked paid.`,
      });
      queryClient.invalidateQueries({ queryKey: ["payment-attempts-unmatched"] });
    } catch (err: any) {
      toast({ title: "Could not recover", description: err.message, variant: "destructive" });
    } finally {
      setBusyId(null);
    }
  };

  const itemCount = (items: any) =>
    Array.isArray(items) ? items.reduce((s: number, i: any) => s + Number(i.quantity || 0), 0) : 0;

  return (
    <SuperAdminGuard>
      <AdminLayout>
        <div className="space-y-6">
          <div>
            <h1 className="text-2xl font-bold">Paid, No Order</h1>
            <p className="text-muted-foreground text-sm">
              Payments received where the order was never created. Create the order in one click.
            </p>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <AlertTriangle className="h-4 w-4 text-orange-500" />
                {pending.length} payment{pending.length === 1 ? "" : "s"} awaiting an order
              </CardTitle>
              <CardDescription>
                Every verified payment is recorded here before the order is created, so nothing is lost.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="flex justify-center py-10">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : attempts.length === 0 ? (
                <p className="text-sm text-muted-foreground py-6 text-center">
                  All payments have matching orders.
                </p>
              ) : (
                <>
                  {/* Mobile */}
                  <div className="space-y-3 md:hidden">
                    {attempts.map((a) => (
                      <AdminMobileCard key={a.id}>
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="font-medium truncate">{a.customer_name || "Unknown customer"}</div>
                            <div className="text-xs text-muted-foreground truncate">
                              {a.customer_phone || a.customer_email || a.payment_id}
                            </div>
                          </div>
                          <Badge variant={a.status === "pending" ? "destructive" : "secondary"}>{a.status}</Badge>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <AdminMobileField label="Amount">₹{Number(a.amount).toFixed(2)}</AdminMobileField>
                          <AdminMobileField label="Items">{itemCount(a.items)}</AdminMobileField>
                          <AdminMobileField label="Payment">
                            <span className="font-mono text-xs">{a.payment_id}</span>
                          </AdminMobileField>
                          <AdminMobileField label="Date">
                            {format(new Date(a.created_at), "dd MMM yyyy, hh:mm a")}
                          </AdminMobileField>
                        </div>
                        {a.status === "pending" && (
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              className="flex-1"
                              disabled={busyId === a.id}
                              onClick={() => runAction(a, "create_order")}
                            >
                              {busyId === a.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <PackagePlus className="h-4 w-4 mr-1" />
                              )}
                              Create order
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={busyId === a.id}
                              onClick={() => runAction(a, "dismiss")}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        )}
                      </AdminMobileCard>
                    ))}

                  </div>

                  {/* Desktop */}
                  <div className="hidden md:block overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Customer</TableHead>
                          <TableHead>Payment ID</TableHead>
                          <TableHead>Amount</TableHead>
                          <TableHead>Items</TableHead>
                          <TableHead>Received</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead className="text-right">Action</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {attempts.map((a) => (
                          <TableRow key={a.id}>
                            <TableCell>
                              <div className="font-medium">{a.customer_name || "Unknown"}</div>
                              <div className="text-xs text-muted-foreground">
                                {a.customer_phone || a.customer_email || "—"}
                              </div>
                            </TableCell>
                            <TableCell className="font-mono text-xs">{a.payment_id}</TableCell>
                            <TableCell>₹{Number(a.amount).toFixed(2)}</TableCell>
                            <TableCell>{itemCount(a.items)}</TableCell>
                            <TableCell className="text-sm">
                              {format(new Date(a.created_at), "dd MMM yyyy, hh:mm a")}
                            </TableCell>
                            <TableCell>
                              <Badge variant={a.status === "pending" ? "destructive" : "secondary"}>{a.status}</Badge>
                            </TableCell>
                            <TableCell className="text-right">
                              {a.status === "pending" && (
                                <div className="flex justify-end gap-2">
                                  <Button size="sm" disabled={busyId === a.id} onClick={() => runAction(a, "create_order")}>
                                    {busyId === a.id ? (
                                      <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                      <PackagePlus className="h-4 w-4 mr-1" />
                                    )}
                                    Create order
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    disabled={busyId === a.id}
                                    onClick={() => runAction(a, "dismiss")}
                                  >
                                    Dismiss
                                  </Button>
                                </div>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </AdminLayout>
    </SuperAdminGuard>
  );
}
