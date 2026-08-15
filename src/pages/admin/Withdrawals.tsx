import { useEffect, useState } from "react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Loader2, CheckCircle, XCircle, Clock, Banknote, Download, Send } from "lucide-react";
import { format } from "date-fns";

interface WithdrawalRequest {
  id: string;
  user_id: string;
  amount: number;
  status: string;
  bank_name: string | null;
  bank_account_number: string | null;
  bank_ifsc: string | null;
  bank_account_holder: string | null;
  notes: string | null;
  created_at: string;
  processed_at: string | null;
  paid_at?: string | null;
  payment_reference?: string | null;
  payment_method?: string | null;
}

interface UserProfile {
  email: string;
  full_name: string | null;
}

const AdminWithdrawals = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [requests, setRequests] = useState<(WithdrawalRequest & { profile?: UserProfile })[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [selectedRequest, setSelectedRequest] = useState<WithdrawalRequest | null>(null);
  const [notes, setNotes] = useState("");
  const [paymentReference, setPaymentReference] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("bank_transfer");
  const [stats, setStats] = useState({ pending: 0, approved: 0, total: 0 });

  useEffect(() => {
    fetchRequests();
  }, []);

  const fetchRequests = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("withdrawal_requests")
      .select("*")
      .order("created_at", { ascending: false });

    if (data) {
      // Fetch user profiles
      const userIds = [...new Set(data.map(r => r.user_id))];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, email, full_name")
        .in("id", userIds);

      const profileMap = new Map(profiles?.map(p => [p.id, p]) || []);
      
      const enrichedRequests = data.map(r => ({
        ...r,
        profile: profileMap.get(r.user_id)
      }));
      
      setRequests(enrichedRequests);
      
      // Calculate stats
      const pending = data.filter(r => r.status === "pending").length;
      const approved = data.filter(r => ["approved", "processing"].includes(r.status)).length;
      const total = data.reduce(
        (sum, r) => (["paid", "completed"].includes(r.status) ? sum + Number(r.amount) : sum),
        0
      );
      setStats({ pending, approved, total });
    }
    setLoading(false);
  };

  const handleProcess = async (status: "approved" | "processing" | "paid" | "rejected") => {
    if (!selectedRequest || !user) return;
    if (status === "paid" && !paymentReference.trim()) {
      toast({
        title: "Reference required",
        description: "Enter the bank/UPI reference (UTR) before marking as paid.",
        variant: "destructive",
      });
      return;
    }
    setProcessingId(selectedRequest.id);

    const { data, error } = await supabase.rpc("process_withdrawal", {
      p_request_id: selectedRequest.id,
      p_status: status,
      p_notes: notes || null,
      p_admin_id: user.id,
      p_payment_reference: status === "paid" ? paymentReference.trim() : undefined,
      p_payment_method: status === "paid" ? paymentMethod : undefined,
    });

    const result = data as { success?: boolean; error?: string } | null;

    if (error || !result?.success) {
      toast({
        title: "Error",
        description: result?.error || error?.message || "Failed to update request",
        variant: "destructive"
      });
    } else {
      toast({
        title: "Success",
        description: `Withdrawal marked as ${status}.`
      });
      fetchRequests();
      setSelectedRequest(null);
      setNotes("");
      setPaymentReference("");
    }
    setProcessingId(null);
  };

  const exportPayoutCsv = () => {
    const rows = requests.filter(r => ["pending", "approved", "processing"].includes(r.status));
    if (rows.length === 0) {
      toast({ title: "Nothing to export", description: "No open withdrawal requests." });
      return;
    }
    const header = [
      "Request ID", "Member", "Email", "Amount", "Account Holder",
      "Bank", "Account Number", "IFSC", "Status", "Requested On",
    ];
    const escape = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const csv = [
      header.join(","),
      ...rows.map(r => [
        r.id,
        r.profile?.full_name || "",
        r.profile?.email || "",
        Number(r.amount).toFixed(2),
        r.bank_account_holder || "",
        r.bank_name || "",
        r.bank_account_number || "",
        r.bank_ifsc || "",
        r.status,
        format(new Date(r.created_at), "yyyy-MM-dd"),
      ].map(escape).join(",")),
    ].join("\n");

    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `withdrawal-payouts-${format(new Date(), "yyyy-MM-dd")}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "pending":
        return <Badge variant="outline" className="bg-yellow-500/10 text-yellow-600"><Clock className="h-3 w-3 mr-1" />Pending</Badge>;
      case "approved":
        return <Badge variant="outline" className="bg-green-500/10 text-green-600"><CheckCircle className="h-3 w-3 mr-1" />Approved</Badge>;
      case "processing":
        return <Badge variant="outline" className="bg-blue-500/10 text-blue-600"><Send className="h-3 w-3 mr-1" />Processing</Badge>;
      case "paid":
      case "completed":
        return <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600"><Banknote className="h-3 w-3 mr-1" />Paid</Badge>;
      case "rejected":
        return <Badge variant="outline" className="bg-red-500/10 text-red-600"><XCircle className="h-3 w-3 mr-1" />Rejected</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };


  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-2xl font-bold">Withdrawal Requests</h2>
            <p className="text-muted-foreground">Manage user withdrawal requests and offline payouts</p>
          </div>
          <Button variant="outline" onClick={exportPayoutCsv}>
            <Download className="h-4 w-4 mr-2" />
            Export payout CSV
          </Button>
        </div>

        {/* Stats */}
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Pending Requests</CardTitle>
              <Clock className="h-4 w-4 text-yellow-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-yellow-600">{stats.pending}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Approved Requests</CardTitle>
              <CheckCircle className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{stats.approved}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Total Paid Out</CardTitle>
              <Banknote className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-primary">₹{stats.total.toFixed(2)}</div>
            </CardContent>
          </Card>
        </div>

        {/* Requests Table */}
        <Card>
          <CardContent className="p-0">
            {loading ? (
              <div className="flex items-center justify-center p-8">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : requests.length === 0 ? (
              <div className="text-center p-8 text-muted-foreground">
                No withdrawal requests yet
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Bank Details</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {requests.map((request) => (
                    <TableRow key={request.id}>
                      <TableCell>
                        <div>
                          <p className="font-medium">{request.profile?.full_name || "N/A"}</p>
                          <p className="text-sm text-muted-foreground">{request.profile?.email}</p>
                        </div>
                      </TableCell>
                      <TableCell className="font-semibold">₹{Number(request.amount).toFixed(2)}</TableCell>
                      <TableCell>
                        <div className="text-sm">
                          <p>{request.bank_account_holder}</p>
                          <p className="text-muted-foreground">{request.bank_name} - {request.bank_account_number}</p>
                          <p className="text-muted-foreground">IFSC: {request.bank_ifsc}</p>
                        </div>
                      </TableCell>
                      <TableCell>{getStatusBadge(request.status)}</TableCell>
                      <TableCell>{format(new Date(request.created_at), "MMM dd, yyyy")}</TableCell>
                      <TableCell>
                        {["pending", "approved", "processing"].includes(request.status) && (
                          <Button size="sm" onClick={() => {
                            setSelectedRequest(request);
                            setNotes(request.notes || "");
                            setPaymentReference(request.payment_reference || "");
                          }}>
                            Process
                          </Button>
                        )}
                        {request.payment_reference && (
                          <p className="text-xs text-muted-foreground mt-1">Ref: {request.payment_reference}</p>
                        )}
                        {request.notes && (
                          <p className="text-xs text-muted-foreground mt-1">{request.notes}</p>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Process Dialog */}
        <Dialog open={!!selectedRequest} onOpenChange={() => setSelectedRequest(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Process Withdrawal Request</DialogTitle>
            </DialogHeader>
            {selectedRequest && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-muted-foreground">User</p>
                    <p className="font-medium">{requests.find(r => r.id === selectedRequest.id)?.profile?.full_name}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Amount</p>
                    <p className="font-medium text-lg">₹{Number(selectedRequest.amount).toFixed(2)}</p>
                  </div>
                  <div className="col-span-2">
                    <p className="text-muted-foreground">Bank Details</p>
                    <p>{selectedRequest.bank_account_holder}</p>
                    <p>{selectedRequest.bank_name} - A/C: {selectedRequest.bank_account_number}</p>
                    <p>IFSC: {selectedRequest.bank_ifsc}</p>
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Payment method</label>
                    <select
                      className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                      value={paymentMethod}
                      onChange={(e) => setPaymentMethod(e.target.value)}
                    >
                      <option value="bank_transfer">Bank transfer (NEFT/IMPS)</option>
                      <option value="upi">UPI</option>
                      <option value="cash">Cash</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Payment reference / UTR</label>
                    <Input
                      value={paymentReference}
                      onChange={(e) => setPaymentReference(e.target.value)}
                      placeholder="Required to mark as paid"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Notes (optional)</label>
                  <Textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Add any notes about this request..."
                  />
                </div>
              </div>
            )}
            <DialogFooter className="flex-wrap gap-2">
              <Button
                variant="destructive"
                onClick={() => handleProcess("rejected")}
                disabled={!!processingId}
              >
                {processingId ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <XCircle className="h-4 w-4 mr-2" />}
                Reject & refund
              </Button>
              {selectedRequest?.status === "pending" && (
                <Button
                  variant="outline"
                  onClick={() => handleProcess("approved")}
                  disabled={!!processingId}
                >
                  <CheckCircle className="h-4 w-4 mr-2" />
                  Approve
                </Button>
              )}
              {selectedRequest?.status !== "processing" && (
                <Button
                  variant="outline"
                  onClick={() => handleProcess("processing")}
                  disabled={!!processingId}
                >
                  <Send className="h-4 w-4 mr-2" />
                  Mark processing
                </Button>
              )}
              <Button onClick={() => handleProcess("paid")} disabled={!!processingId}>
                {processingId ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Banknote className="h-4 w-4 mr-2" />}
                Mark as paid
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AdminLayout>
  );
};

export default AdminWithdrawals;
