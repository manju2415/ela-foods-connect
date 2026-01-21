import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Search, Loader2, Package, RotateCcw, Eye, Truck } from "lucide-react";
import { format } from "date-fns";

interface ReturnRequest {
  id: string;
  order_id: string;
  order_item_id: string;
  user_id: string;
  product_id: string | null;
  reason: string;
  request_type: string;
  status: string;
  pickup_date: string | null;
  refund_amount: number | null;
  admin_notes: string | null;
  created_at: string;
  order_number?: string;
  customer_email?: string;
  customer_name?: string;
  product_name?: string;
  quantity?: number;
  total_price?: number;
}

const STATUS_OPTIONS = [
  { value: "pending", label: "Pending", color: "bg-yellow-500/10 text-yellow-600 border-yellow-500/20" },
  { value: "approved", label: "Approved", color: "bg-blue-500/10 text-blue-600 border-blue-500/20" },
  { value: "rejected", label: "Rejected", color: "bg-red-500/10 text-red-600 border-red-500/20" },
  { value: "picked_up", label: "Picked Up", color: "bg-purple-500/10 text-purple-600 border-purple-500/20" },
  { value: "refunded", label: "Refunded", color: "bg-green-500/10 text-green-600 border-green-500/20" },
  { value: "exchanged", label: "Exchanged", color: "bg-cyan-500/10 text-cyan-600 border-cyan-500/20" },
  { value: "completed", label: "Completed", color: "bg-green-500/10 text-green-600 border-green-500/20" },
];

export default function ReturnRequests() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedRequest, setSelectedRequest] = useState<ReturnRequest | null>(null);
  const [adminNotes, setAdminNotes] = useState("");
  const [newStatus, setNewStatus] = useState("");
  const [refundAmount, setRefundAmount] = useState("");
  const queryClient = useQueryClient();

  const { data: requests = [], isLoading } = useQuery({
    queryKey: ["return-requests"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("return_requests" as any)
        .select("*")
        .order("created_at", { ascending: false });
      
      if (error) {
        console.error("Error fetching return requests:", error);
        return [];
      }
      
      // Enrich with order and user data
      const enrichedData = await Promise.all(
        ((data || []) as any[]).map(async (request) => {
          const [orderRes, profileRes, itemRes] = await Promise.all([
            supabase.from("orders").select("order_number").eq("id", request.order_id).maybeSingle(),
            supabase.from("profiles").select("email, full_name").eq("id", request.user_id).maybeSingle(),
            supabase.from("order_items").select("product_name, quantity, total_price").eq("id", request.order_item_id).maybeSingle(),
          ]);
          
          return {
            ...request,
            order_number: orderRes.data?.order_number,
            customer_email: profileRes.data?.email,
            customer_name: profileRes.data?.full_name,
            product_name: itemRes.data?.product_name,
            quantity: itemRes.data?.quantity,
            total_price: itemRes.data?.total_price,
          } as ReturnRequest;
        })
      );
      
      return enrichedData;
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, status, notes, refund }: { 
      id: string; 
      status: string; 
      notes: string; 
      refund?: number 
    }) => {
      const { error } = await supabase
        .from("return_requests" as any)
        .update({
          status,
          admin_notes: notes,
          refund_amount: refund || null,
          processed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["return-requests"] });
      toast.success("Return request updated");
      setSelectedRequest(null);
    },
    onError: (error) => {
      toast.error("Failed to update: " + error.message);
    },
  });

  const getStatusBadge = (status: string) => {
    const option = STATUS_OPTIONS.find((s) => s.value === status);
    return (
      <Badge className={option?.color || "bg-muted"}>
        {option?.label || status}
      </Badge>
    );
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case "refund":
        return <RotateCcw className="h-4 w-4" />;
      case "exchange":
        return <Package className="h-4 w-4" />;
      case "pickup":
        return <Truck className="h-4 w-4" />;
      default:
        return null;
    }
  };

  const handleUpdate = () => {
    if (!selectedRequest || !newStatus) return;
    updateMutation.mutate({
      id: selectedRequest.id,
      status: newStatus,
      notes: adminNotes,
      refund: refundAmount ? Number(refundAmount) : undefined,
    });
  };

  const filteredRequests = requests.filter((r) => {
    const matchesSearch =
      r.order_number?.toLowerCase().includes(search.toLowerCase()) ||
      r.customer_email?.toLowerCase().includes(search.toLowerCase()) ||
      r.customer_name?.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === "all" || r.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <RotateCcw className="h-8 w-8" />
            Return Requests
          </h1>
          <p className="text-muted-foreground">
            Manage product returns, exchanges, and refunds
          </p>
        </div>

        <Card>
          <CardHeader>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <CardTitle>All Requests ({filteredRequests.length})</CardTitle>
              <div className="flex gap-2">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Search..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-9 w-48"
                  />
                </div>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-36">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    {STATUS_OPTIONS.map((s) => (
                      <SelectItem key={s.value} value={s.value}>
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin" />
              </div>
            ) : filteredRequests.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No return requests found
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Order</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRequests.map((request) => (
                    <TableRow key={request.id}>
                      <TableCell className="font-mono text-sm">
                        {request.order_number}
                      </TableCell>
                      <TableCell>
                        <div>
                          <div className="font-medium">{request.customer_name || "—"}</div>
                          <div className="text-sm text-muted-foreground">
                            {request.customer_email}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div>
                          <div className="font-medium">{request.product_name}</div>
                          <div className="text-sm text-muted-foreground">
                            Qty: {request.quantity} • ₹{request.total_price}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="flex items-center gap-1 w-fit">
                          {getTypeIcon(request.request_type)}
                          {request.request_type}
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-[200px] truncate">
                        {request.reason}
                      </TableCell>
                      <TableCell>{getStatusBadge(request.status)}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {format(new Date(request.created_at), "dd MMM yyyy")}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setSelectedRequest(request);
                            setNewStatus(request.status);
                            setAdminNotes(request.admin_notes || "");
                            setRefundAmount(request.refund_amount?.toString() || "");
                          }}
                        >
                          <Eye className="h-4 w-4" />
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

      {/* Detail Dialog */}
      <Dialog open={!!selectedRequest} onOpenChange={() => setSelectedRequest(null)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Return Request Details</DialogTitle>
            <DialogDescription>
              Order: {selectedRequest?.order_number}
            </DialogDescription>
          </DialogHeader>
          
          {selectedRequest && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">Customer</p>
                  <p className="font-medium">
                    {selectedRequest.customer_name || selectedRequest.customer_email}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Request Type</p>
                  <Badge variant="outline" className="mt-1">
                    {selectedRequest.request_type}
                  </Badge>
                </div>
                <div>
                  <p className="text-muted-foreground">Product</p>
                  <p className="font-medium">{selectedRequest.product_name}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Amount</p>
                  <p className="font-medium">₹{selectedRequest.total_price}</p>
                </div>
              </div>

              <div>
                <p className="text-muted-foreground text-sm mb-1">Reason</p>
                <p className="p-3 bg-muted rounded-lg text-sm">{selectedRequest.reason}</p>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Update Status</label>
                <Select value={newStatus} onValueChange={setNewStatus}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUS_OPTIONS.map((s) => (
                      <SelectItem key={s.value} value={s.value}>
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {(newStatus === "refunded" || selectedRequest.request_type === "refund") && (
                <div className="space-y-2">
                  <label className="text-sm font-medium">Refund Amount (₹)</label>
                  <Input
                    type="number"
                    value={refundAmount}
                    onChange={(e) => setRefundAmount(e.target.value)}
                    placeholder={selectedRequest.total_price?.toString()}
                  />
                </div>
              )}

              <div className="space-y-2">
                <label className="text-sm font-medium">Admin Notes</label>
                <Textarea
                  value={adminNotes}
                  onChange={(e) => setAdminNotes(e.target.value)}
                  placeholder="Add internal notes..."
                  rows={3}
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedRequest(null)}>
              Cancel
            </Button>
            <Button
              onClick={handleUpdate}
              disabled={updateMutation.isPending}
            >
              {updateMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Update Request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
