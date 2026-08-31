import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { IfscInput } from "@/components/IfscInput";
import { Loader2, Banknote, Clock, CheckCircle, XCircle, ArrowDownToLine } from "lucide-react";

import { format } from "date-fns";

interface WithdrawalRequest {
  id: string;
  amount: number;
  status: string;
  notes: string | null;
  created_at: string;
  processed_at: string | null;
}

interface Profile {
  bank_name: string | null;
  bank_account_number: string | null;
  bank_ifsc: string | null;
  bank_account_holder: string | null;
}

interface WithdrawalSectionProps {
  userId: string;
}

export const WithdrawalSection = ({ userId }: WithdrawalSectionProps) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(false);
  const [requests, setRequests] = useState<WithdrawalRequest[]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loadingData, setLoadingData] = useState(true);
  const [showBankForm, setShowBankForm] = useState(false);
  const [ifscVerified, setIfscVerified] = useState(false);
  const [withdrawableBalance, setWithdrawableBalance] = useState(0);

  const [bankDetails, setBankDetails] = useState({
    bank_name: "",
    bank_account_number: "",
    bank_ifsc: "",
    bank_account_holder: ""
  });

  useEffect(() => {
    if (userId) {
      fetchData();
    }
  }, [userId]);

  const fetchData = async () => {
    if (!userId) return;
    setLoadingData(true);

    const [requestsRes, profileRes, walletRes] = await Promise.all([
      supabase
        .from("withdrawal_requests")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(10),
      supabase
        .from("profiles")
        .select("bank_name, bank_account_number, bank_ifsc, bank_account_holder")
        .eq("id", userId)
        .maybeSingle(),
      supabase
        .from("wallets")
        .select("withdrawable_balance")
        .eq("user_id", userId)
        .maybeSingle()
    ]);

    if (requestsRes.data) setRequests(requestsRes.data);
    if (profileRes.data) {
      setProfile(profileRes.data);
      setBankDetails({
        bank_name: profileRes.data.bank_name || "",
        bank_account_number: profileRes.data.bank_account_number || "",
        bank_ifsc: profileRes.data.bank_ifsc || "",
        bank_account_holder: profileRes.data.bank_account_holder || ""
      });
    }
    if (walletRes.data) {
      setWithdrawableBalance(walletRes.data.withdrawable_balance || 0);
    }
    setLoadingData(false);
  };

  const handleSaveBankDetails = async () => {
    if (!user) return;
    if (!bankDetails.bank_name || !bankDetails.bank_account_number || !bankDetails.bank_ifsc || !bankDetails.bank_account_holder) {
      toast({
        title: "Error",
        description: "Please fill in all bank details",
        variant: "destructive"
      });
      return;
    }
    if (!ifscVerified) {
      toast({
        title: "Verify IFSC code",
        description: "Please enter a valid IFSC code — we could not verify the one entered.",
        variant: "destructive"
      });
      return;
    }



    setLoading(true);
    const { error } = await supabase
      .from("profiles")
      .update(bankDetails)
      .eq("id", user.id);

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Success", description: "Bank details saved!" });
      setProfile(bankDetails);
      setShowBankForm(false);
    }
    setLoading(false);
  };

  const handleRequestWithdrawal = async () => {
    if (!user) return;
    const withdrawAmount = parseFloat(amount);
    
    if (isNaN(withdrawAmount) || withdrawAmount <= 0) {
      toast({ title: "Error", description: "Please enter a valid amount", variant: "destructive" });
      return;
    }

    if (withdrawAmount > withdrawableBalance) {
      toast({ title: "Error", description: "Amount exceeds withdrawable balance", variant: "destructive" });
      return;
    }

    if (!profile?.bank_account_number) {
      toast({ title: "Error", description: "Please add bank details first", variant: "destructive" });
      setShowBankForm(true);
      return;
    }

    setLoading(true);
    const { data, error } = await supabase.rpc("request_withdrawal", {
      p_user_id: userId,
      p_amount: withdrawAmount
    });

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else if (data && typeof data === 'object' && 'success' in data) {
      const result = data as { success: boolean; error?: string };
      if (result.success) {
        toast({ title: "Success", description: "Withdrawal request submitted!" });
        setAmount("");
        fetchData();
      } else {
        toast({ title: "Error", description: result.error || "Failed to request withdrawal", variant: "destructive" });
      }
    }
    setLoading(false);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "pending":
        return <Badge variant="outline" className="bg-yellow-500/10 text-yellow-600"><Clock className="h-3 w-3 mr-1" />Pending</Badge>;
      case "approved":
        return <Badge variant="outline" className="bg-green-500/10 text-green-600"><CheckCircle className="h-3 w-3 mr-1" />Approved</Badge>;
      case "completed":
        return <Badge variant="outline" className="bg-blue-500/10 text-blue-600"><CheckCircle className="h-3 w-3 mr-1" />Completed</Badge>;
      case "rejected":
        return <Badge variant="outline" className="bg-red-500/10 text-red-600"><XCircle className="h-3 w-3 mr-1" />Rejected</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  if (loadingData) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center p-8">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Bank Details Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Banknote className="h-5 w-5" />
            Bank Details
          </CardTitle>
          <CardDescription>Your bank account for withdrawals</CardDescription>
        </CardHeader>
        <CardContent>
          {showBankForm || !profile?.bank_account_number ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Account Holder Name</Label>
                  <Input
                    value={bankDetails.bank_account_holder}
                    onChange={(e) => setBankDetails({ ...bankDetails, bank_account_holder: e.target.value })}
                    placeholder="As per bank records"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Bank Name</Label>
                  <Input
                    value={bankDetails.bank_name}
                    onChange={(e) => setBankDetails({ ...bankDetails, bank_name: e.target.value })}
                    placeholder="e.g., State Bank of India"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Account Number</Label>
                  <Input
                    value={bankDetails.bank_account_number}
                    onChange={(e) => setBankDetails({ ...bankDetails, bank_account_number: e.target.value })}
                    placeholder="Your account number"
                  />
                </div>
                <div className="space-y-2">
                  <Label>IFSC Code</Label>
                  <IfscInput
                    value={bankDetails.bank_ifsc}
                    onChange={(v) => setBankDetails((d) => ({ ...d, bank_ifsc: v }))}
                    onVerified={(details) => {
                      setIfscVerified(!!details);
                      if (details?.bank) setBankDetails((d) => ({ ...d, bank_name: details.bank }));
                    }}
                  />
                </div>

              </div>
              <div className="flex gap-2">
                <Button onClick={handleSaveBankDetails} disabled={loading}>
                  {loading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                  Save Bank Details
                </Button>
                {profile?.bank_account_number && (
                  <Button variant="outline" onClick={() => setShowBankForm(false)}>Cancel</Button>
                )}
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">{profile.bank_account_holder}</p>
                <p className="text-sm text-muted-foreground">{profile.bank_name} - A/C: {profile.bank_account_number}</p>
                <p className="text-sm text-muted-foreground">IFSC: {profile.bank_ifsc}</p>
              </div>
              <Button variant="outline" onClick={() => setShowBankForm(true)}>Edit</Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Request Withdrawal Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ArrowDownToLine className="h-5 w-5" />
            Request Withdrawal
          </CardTitle>
          <CardDescription>
            Available for withdrawal: <span className="font-semibold text-primary">₹{withdrawableBalance.toFixed(2)}</span>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4">
            <div className="flex-1">
              <Input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="Enter amount"
                min="1"
                max={withdrawableBalance}
              />
            </div>
            <Button onClick={() => setAmount(withdrawableBalance.toString())} variant="outline">
              Max
            </Button>
            <Button onClick={handleRequestWithdrawal} disabled={loading || withdrawableBalance === 0}>
              {loading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Request
            </Button>
          </div>
          {withdrawableBalance === 0 && (
            <p className="text-sm text-muted-foreground mt-2">
              No withdrawable balance available
            </p>
          )}
        </CardContent>
      </Card>

      {/* Withdrawal History */}
      <Card>
        <CardHeader>
          <CardTitle>Withdrawal History</CardTitle>
        </CardHeader>
        <CardContent>
          {requests.length === 0 ? (
            <p className="text-muted-foreground text-center py-4">No withdrawal requests yet</p>
          ) : (
            <div className="space-y-3">
              {requests.map((request) => (
                <div key={request.id} className="flex items-center justify-between p-3 rounded-lg border">
                  <div>
                    <p className="font-medium">₹{Number(request.amount).toFixed(2)}</p>
                    <p className="text-sm text-muted-foreground">
                      {format(new Date(request.created_at), "MMM dd, yyyy")}
                    </p>
                    {request.notes && (
                      <p className="text-xs text-muted-foreground mt-1">{request.notes}</p>
                    )}
                  </div>
                  {getStatusBadge(request.status)}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
