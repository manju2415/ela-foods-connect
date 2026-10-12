import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { SuperAdminGuard } from "@/components/admin/SuperAdminGuard";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Store, Truck, Receipt, Save, Gift, Wallet, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { Json } from "@/integrations/supabase/types";
import { REGISTRATION_ENABLED_QUERY_KEY } from "@/hooks/useRegistrationEnabled";
import { REFERRAL_SCHEME_QUERY_KEY } from "@/hooks/useReferralScheme";
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

interface StoreSettings {
  store_name: string;
  store_email: string;
  store_phone: string;
  store_address: string;
  currency: string;
  currency_symbol: string;
}

interface ShippingSettings {
  free_shipping_threshold: number;
  flat_rate: number;
  enable_free_shipping: boolean;
  shipping_zones: Array<{ name: string; rate: number }>;
}

interface TaxSettings {
  enable_tax: boolean;
  tax_rate: number;
  tax_name: string;
  tax_included_in_price: boolean;
}

interface ReferralSchemeSettings {
  scheme: "simple" | "mlm";
  referrer_bonus: number;
  welcome_bonus: number;
}

interface WalletSettings {
  min_wallet_topup: number;
  max_wallet_balance: number;
  enable_wallet_payments: boolean;
}

const defaultStoreSettings: StoreSettings = {
  store_name: "ELA FOODS AND SNACKS PRIVATE LIMITED",
  store_email: "elabazar6@gmail.com",
  store_phone: "+919659108119",
  store_address: "No 195 And 196, 1st Cross, Singapura Garden, Abbigere, Bangalore Karnataka 560090",
  currency: "INR",
  currency_symbol: "₹",
};

const defaultShippingSettings: ShippingSettings = {
  free_shipping_threshold: 500,
  flat_rate: 50,
  enable_free_shipping: true,
  shipping_zones: [],
};

const defaultTaxSettings: TaxSettings = {
  enable_tax: true,
  tax_rate: 18,
  tax_name: "GST",
  tax_included_in_price: true,
};

// No row means the MLM scheme — the same default the server uses.
const defaultReferralSchemeSettings: ReferralSchemeSettings = {
  scheme: "mlm",
  referrer_bonus: 99,
  welcome_bonus: 99,
};

const defaultWalletSettings: WalletSettings = {
  min_wallet_topup: 100,
  max_wallet_balance: 10000,
  enable_wallet_payments: true,
};

export default function Settings() {
  const [storeSettings, setStoreSettings] = useState<StoreSettings>(defaultStoreSettings);
  const [shippingSettings, setShippingSettings] = useState<ShippingSettings>(defaultShippingSettings);
  const [taxSettings, setTaxSettings] = useState<TaxSettings>(defaultTaxSettings);
  const [referralScheme, setReferralScheme] = useState<ReferralSchemeSettings>(defaultReferralSchemeSettings);
  const [walletSettings, setWalletSettings] = useState<WalletSettings>(defaultWalletSettings);
  const [registrationEnabled, setRegistrationEnabled] = useState(true);
  const [withdrawalsEnabled, setWithdrawalsEnabled] = useState(true);
  const [confirmWithdrawalsOff, setConfirmWithdrawalsOff] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const queryClient = useQueryClient();

  const { data: settings, isLoading } = useQuery({
    queryKey: ["platform-settings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("platform_settings")
        .select("key, value");
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    if (settings) {
      settings.forEach((setting) => {
        if (setting.key === "store_settings" && setting.value) {
          setStoreSettings({ ...defaultStoreSettings, ...(setting.value as unknown as StoreSettings) });
        } else if (setting.key === "shipping_settings" && setting.value) {
          setShippingSettings({ ...defaultShippingSettings, ...(setting.value as unknown as ShippingSettings) });
        } else if (setting.key === "tax_settings" && setting.value) {
          setTaxSettings({ ...defaultTaxSettings, ...(setting.value as unknown as TaxSettings) });
        } else if (setting.key === "referral_scheme_settings" && setting.value) {
          setReferralScheme({ ...defaultReferralSchemeSettings, ...(setting.value as unknown as ReferralSchemeSettings) });
        } else if (setting.key === "withdrawal_settings" && setting.value) {
          setWithdrawalsEnabled((setting.value as { withdrawals_enabled?: unknown }).withdrawals_enabled !== false);
        } else if (setting.key === "wallet_settings" && setting.value) {
          setWalletSettings({ ...defaultWalletSettings, ...(setting.value as unknown as WalletSettings) });
        } else if (setting.key === "registration_settings" && setting.value) {
          setRegistrationEnabled((setting.value as { registration_enabled?: unknown }).registration_enabled !== false);
        }
      });
    }
  }, [settings]);

  const saveSetting = async (key: string, value: Json, description: string) => {
    const { data: existing } = await supabase
      .from("platform_settings")
      .select("id")
      .eq("key", key)
      .maybeSingle();

    if (existing) {
      const { error } = await supabase
        .from("platform_settings")
        .update({ value, description })
        .eq("key", key);
      if (error) throw error;
    } else {
      const { error } = await supabase
        .from("platform_settings")
        .insert({ key, value, description });
      if (error) throw error;
    }
  };

  const saveMutation = useMutation({
    mutationFn: async (settingsToSave: { key: string; value: Json; description: string; label: string }[]) => {
      // Each group is saved independently — one group failing must not block
      // (or hide the fact that it blocked) the others from saving, and the
      // caller needs to know exactly which groups did and didn't save.
      const results = await Promise.allSettled(
        settingsToSave.map((setting) => saveSetting(setting.key, setting.value, setting.description))
      );
      const saved = settingsToSave.filter((_, i) => results[i].status === "fulfilled").map((s) => s.label);
      const failed = settingsToSave.filter((_, i) => results[i].status === "rejected").map((s) => s.label);
      return { saved, failed };
    },
    onSuccess: ({ saved, failed }) => {
      queryClient.invalidateQueries({ queryKey: ["platform-settings"] });
      if (failed.length === 0) {
        toast.success("Settings saved successfully");
      } else if (saved.length === 0) {
        toast.error("Failed to save settings: " + failed.join(", "));
      } else {
        toast.warning(`Saved: ${saved.join(", ")}. Failed to save: ${failed.join(", ")}.`);
      }
    },
    onError: (error) => {
      toast.error("Failed to save settings: " + error.message);
    },
  });

  // Saved the moment it is flipped (not via "Save All") — it changes what
  // every new visitor sees, so it should never wait on an unrelated save.
  const registrationMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      await saveSetting(
        "registration_settings",
        { registration_enabled: enabled },
        "Member registration on/off (super admin)",
      );
      return enabled;
    },
    onMutate: (enabled) => setRegistrationEnabled(enabled),
    onSuccess: (enabled) => {
      queryClient.invalidateQueries({ queryKey: ["platform-settings"] });
      queryClient.invalidateQueries({ queryKey: REGISTRATION_ENABLED_QUERY_KEY });
      toast.success(enabled ? "Registration turned ON" : "Registration turned OFF");
    },
    onError: (error, enabled) => {
      setRegistrationEnabled(!enabled);
      toast.error("Failed to update registration: " + error.message);
    },
  });

  // Saved the moment it is flipped, like the registration switch: it decides
  // which payouts run on the next paid order.
  const schemeMutation = useMutation({
    mutationFn: async (next: ReferralSchemeSettings) => {
      await saveSetting(
        "referral_scheme_settings",
        next as unknown as Json,
        "Referral scheme: simple (flat bonus on first order) or mlm (super admin)",
      );
      return next;
    },
    onMutate: (next) => setReferralScheme(next),
    onSuccess: (next) => {
      queryClient.invalidateQueries({ queryKey: ["platform-settings"] });
      queryClient.invalidateQueries({ queryKey: REFERRAL_SCHEME_QUERY_KEY });
      toast.success(next.scheme === "simple" ? "Simple referral scheme turned ON" : "MLM scheme turned ON");
    },
    onError: (error, next) => {
      setReferralScheme({ ...next, scheme: next.scheme === "simple" ? "mlm" : "simple" });
      toast.error("Failed to update referral scheme: " + error.message);
    },
  });

  // Goes through an RPC: turning withdrawals off also moves every withdrawable
  // balance to the purchase wallet and cancels pending requests.
  const withdrawalsMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      const { data, error } = await supabase.rpc("set_withdrawals_enabled", { p_enabled: enabled });
      if (error) throw error;
      const result = data as { success?: boolean; error?: string; cancelled_requests?: number; wallets_moved?: number } | null;
      if (!result?.success) throw new Error(result?.error || "Unknown error");
      return { enabled, result };
    },
    onSuccess: ({ enabled, result }) => {
      setWithdrawalsEnabled(enabled);
      queryClient.invalidateQueries({ queryKey: ["platform-settings"] });
      queryClient.invalidateQueries({ queryKey: REFERRAL_SCHEME_QUERY_KEY });
      toast.success(
        enabled
          ? "Cash withdrawals turned ON"
          : `Cash withdrawals turned OFF. ${result.wallets_moved ?? 0} wallet(s) moved to purchase balance, ${result.cancelled_requests ?? 0} pending request(s) cancelled.`,
      );
    },
    onError: (error) => {
      toast.error("Failed to update withdrawals: " + error.message);
    },
  });

  const handleSaveAll = async () => {
    setIsSaving(true);
    await saveMutation.mutateAsync([
      { key: "store_settings", value: storeSettings as unknown as Json, description: "General store information", label: "Store" },
      { key: "shipping_settings", value: shippingSettings as unknown as Json, description: "Shipping rates and zones", label: "Shipping" },
      { key: "tax_settings", value: taxSettings as unknown as Json, description: "Tax configuration", label: "Tax" },
      { key: "referral_scheme_settings", value: referralScheme as unknown as Json, description: "Referral scheme: simple (flat bonus on first order) or mlm (super admin)", label: "Referral" },
      { key: "wallet_settings", value: walletSettings as unknown as Json, description: "Wallet configuration", label: "Wallet" },
    ]);
    setIsSaving(false);
  };

  if (isLoading) {
    return (
      <SuperAdminGuard>
        <AdminLayout>
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          </div>
        </AdminLayout>
      </SuperAdminGuard>
    );
  }

  return (
    <SuperAdminGuard>
      <AdminLayout>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Platform Settings</h1>
            <p className="text-sm text-muted-foreground sm:text-base">Configure your store, referral incentives, and wallet settings (Super Admin only)</p>
          </div>
          <Button className="w-full shrink-0 sm:w-auto" onClick={handleSaveAll} disabled={isSaving || saveMutation.isPending}>
            <Save className="mr-2 h-4 w-4" />
            {isSaving ? "Saving..." : "Save All Settings"}
          </Button>
        </div>

        <Tabs defaultValue="store" className="space-y-6">
          <TabsList className="grid h-auto w-full grid-cols-2 gap-1 sm:flex sm:w-auto sm:flex-wrap sm:justify-start">
            <TabsTrigger value="store" className="flex items-center gap-2">
              <Store className="h-4 w-4" /> Store Info
            </TabsTrigger>
            <TabsTrigger value="shipping" className="flex items-center gap-2">
              <Truck className="h-4 w-4" /> Shipping
            </TabsTrigger>
            <TabsTrigger value="tax" className="flex items-center gap-2">
              <Receipt className="h-4 w-4" /> Tax
            </TabsTrigger>
            <TabsTrigger value="referral" className="flex items-center gap-2">
              <Gift className="h-4 w-4" /> Referrals
            </TabsTrigger>
            <TabsTrigger value="wallet" className="flex items-center gap-2">
              <Wallet className="h-4 w-4" /> Wallet
            </TabsTrigger>
            <TabsTrigger value="registration" className="flex items-center gap-2">
              <UserPlus className="h-4 w-4" /> Registration
            </TabsTrigger>
          </TabsList>

          <TabsContent value="store">
            <Card>
              <CardHeader>
                <CardTitle>Store Information</CardTitle>
                <CardDescription>Basic information about your store</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="store_name">Store Name</Label>
                    <Input
                      id="store_name"
                      value={storeSettings.store_name}
                      onChange={(e) => setStoreSettings({ ...storeSettings, store_name: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="store_email">Store Email</Label>
                    <Input
                      id="store_email"
                      type="email"
                      value={storeSettings.store_email}
                      onChange={(e) => setStoreSettings({ ...storeSettings, store_email: e.target.value })}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="store_phone">Store Phone</Label>
                    <Input
                      id="store_phone"
                      value={storeSettings.store_phone}
                      onChange={(e) => setStoreSettings({ ...storeSettings, store_phone: e.target.value })}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-2">
                      <Label htmlFor="currency">Currency</Label>
                      <Input
                        id="currency"
                        value={storeSettings.currency}
                        onChange={(e) => setStoreSettings({ ...storeSettings, currency: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="currency_symbol">Symbol</Label>
                      <Input
                        id="currency_symbol"
                        value={storeSettings.currency_symbol}
                        onChange={(e) => setStoreSettings({ ...storeSettings, currency_symbol: e.target.value })}
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="store_address">Store Address</Label>
                  <Textarea
                    id="store_address"
                    value={storeSettings.store_address}
                    onChange={(e) => setStoreSettings({ ...storeSettings, store_address: e.target.value })}
                    rows={3}
                  />
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="shipping">
            <Card>
              <CardHeader>
                <CardTitle>Shipping Settings</CardTitle>
                <CardDescription>Configure shipping rates and free shipping thresholds</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center justify-between gap-4">
                  <div className="space-y-0.5">
                    <Label>Enable Free Shipping</Label>
                    <p className="text-sm text-muted-foreground">
                      Offer free shipping above a certain order value
                    </p>
                  </div>
                  <Switch
                    checked={shippingSettings.enable_free_shipping}
                    onCheckedChange={(checked) =>
                      setShippingSettings({ ...shippingSettings, enable_free_shipping: checked })
                    }
                  />
                </div>

                <Separator />

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="flat_rate">Flat Shipping Rate (₹)</Label>
                    <Input
                      id="flat_rate"
                      type="number"
                      value={shippingSettings.flat_rate}
                      onChange={(e) =>
                        setShippingSettings({ ...shippingSettings, flat_rate: parseFloat(e.target.value) || 0 })
                      }
                    />
                    <p className="text-sm text-muted-foreground">Default shipping charge per order</p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="free_shipping_threshold">Free Shipping Threshold (₹)</Label>
                    <Input
                      id="free_shipping_threshold"
                      type="number"
                      value={shippingSettings.free_shipping_threshold}
                      onChange={(e) =>
                        setShippingSettings({
                          ...shippingSettings,
                          free_shipping_threshold: parseFloat(e.target.value) || 0,
                        })
                      }
                      disabled={!shippingSettings.enable_free_shipping}
                    />
                    <p className="text-sm text-muted-foreground">
                      Orders above this amount get free shipping
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="tax">
            <Card>
              <CardHeader>
                <CardTitle>Tax Settings</CardTitle>
                <CardDescription>Configure tax rates and calculation methods</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center justify-between gap-4">
                  <div className="space-y-0.5">
                    <Label>Enable Tax</Label>
                    <p className="text-sm text-muted-foreground">Apply tax to orders</p>
                  </div>
                  <Switch
                    checked={taxSettings.enable_tax}
                    onCheckedChange={(checked) => setTaxSettings({ ...taxSettings, enable_tax: checked })}
                  />
                </div>

                <Separator />

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="tax_name">Tax Name</Label>
                    <Input
                      id="tax_name"
                      value={taxSettings.tax_name}
                      onChange={(e) => setTaxSettings({ ...taxSettings, tax_name: e.target.value })}
                      disabled={!taxSettings.enable_tax}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="tax_rate">Tax Rate (%)</Label>
                    <Input
                      id="tax_rate"
                      type="number"
                      step="0.01"
                      value={taxSettings.tax_rate}
                      onChange={(e) =>
                        setTaxSettings({ ...taxSettings, tax_rate: parseFloat(e.target.value) || 0 })
                      }
                      disabled={!taxSettings.enable_tax}
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between gap-4">
                  <div className="space-y-0.5">
                    <Label>Tax Included in Price</Label>
                    <p className="text-sm text-muted-foreground">
                      Product prices already include tax (no additional tax added at checkout)
                    </p>
                  </div>
                  <Switch
                    checked={taxSettings.tax_included_in_price}
                    onCheckedChange={(checked) =>
                      setTaxSettings({ ...taxSettings, tax_included_in_price: checked })
                    }
                    disabled={!taxSettings.enable_tax}
                  />
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Referral Settings Tab */}
          <TabsContent value="referral">
            <Card>
              <CardHeader>
                <CardTitle>Referral Scheme</CardTitle>
                <CardDescription>
                  Choose between the simple referral bonus and the full MLM scheme. The switch applies immediately.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center justify-between gap-4">
                  <div className="space-y-0.5">
                    <Label htmlFor="simple_referral_scheme">Simple Referral Scheme</Label>
                    <p className="text-sm text-muted-foreground">
                      {referralScheme.scheme === "simple"
                        ? "ON: MLM commissions are paused"
                        : "OFF: the MLM scheme from MLM Settings is active"}
                    </p>
                  </div>
                  <Switch
                    id="simple_referral_scheme"
                    checked={referralScheme.scheme === "simple"}
                    disabled={schemeMutation.isPending}
                    onCheckedChange={(checked) =>
                      schemeMutation.mutate({ ...referralScheme, scheme: checked ? "simple" : "mlm" })
                    }
                  />
                </div>

                <Separator />

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="referrer_bonus">Referral Bonus (₹)</Label>
                    <Input
                      id="referrer_bonus"
                      type="number"
                      min={0}
                      value={referralScheme.referrer_bonus}
                      onChange={(e) =>
                        setReferralScheme({
                          ...referralScheme,
                          referrer_bonus: Math.max(0, parseFloat(e.target.value) || 0),
                        })
                      }
                    />
                    <p className="text-sm text-muted-foreground">
                      Credited to the person who invited
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="welcome_bonus">Welcome Bonus (₹)</Label>
                    <Input
                      id="welcome_bonus"
                      type="number"
                      min={0}
                      value={referralScheme.welcome_bonus}
                      onChange={(e) =>
                        setReferralScheme({
                          ...referralScheme,
                          welcome_bonus: Math.max(0, parseFloat(e.target.value) || 0),
                        })
                      }
                    />
                    <p className="text-sm text-muted-foreground">
                      Credited to the new member who joined with the invite code
                    </p>
                  </div>
                </div>

                <p className="text-sm text-muted-foreground">
                  While the simple scheme is ON, both bonuses are paid once, when the invited person's first paid
                  order completes, as wallet credit usable only for purchases. The same amounts apply to every user,
                  including founders, and to earlier invites that have not ordered yet. Save amount changes with
                  "Save All Settings". Turning the simple scheme OFF restores the MLM scheme with its saved settings.
                </p>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Wallet Settings Tab */}
          <TabsContent value="wallet">
            <Card>
              <CardHeader>
                <CardTitle>Wallet Settings</CardTitle>
                <CardDescription>Configure wallet rules and limits</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center justify-between gap-4">
                  <div className="space-y-0.5">
                    <Label htmlFor="withdrawals_enabled">Cash Withdrawals</Label>
                    <p className="text-sm text-muted-foreground">
                      {withdrawalsEnabled
                        ? "ON: members can withdraw their withdrawable balance to bank"
                        : "OFF: wallet balance can be used only for purchases"}
                    </p>
                  </div>
                  <Switch
                    id="withdrawals_enabled"
                    checked={withdrawalsEnabled}
                    disabled={withdrawalsMutation.isPending}
                    onCheckedChange={(checked) => {
                      if (checked) withdrawalsMutation.mutate(true);
                      else setConfirmWithdrawalsOff(true);
                    }}
                  />
                </div>

                <AlertDialog open={confirmWithdrawalsOff} onOpenChange={setConfirmWithdrawalsOff}>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Turn off cash withdrawals?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Every member's withdrawable balance will be moved to their purchase wallet, and pending
                        withdrawal requests will be cancelled with the amount returned to the purchase wallet.
                        Approved or processing requests are left for you to handle. Turning withdrawals back on
                        later does not move the balances back.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={() => withdrawalsMutation.mutate(false)}>
                        Turn off withdrawals
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>

                <Separator />

                <div className="flex items-center justify-between gap-4">
                  <div className="space-y-0.5">
                    <Label>Enable Wallet Payments</Label>
                    <p className="text-sm text-muted-foreground">
                      Allow customers to pay using wallet balance
                    </p>
                  </div>
                  <Switch
                    checked={walletSettings.enable_wallet_payments}
                    onCheckedChange={(checked) =>
                      setWalletSettings({ ...walletSettings, enable_wallet_payments: checked })
                    }
                  />
                </div>

                <Separator />

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="min_wallet_topup">Minimum Top-up Amount (₹)</Label>
                    <Input
                      id="min_wallet_topup"
                      type="number"
                      value={walletSettings.min_wallet_topup}
                      onChange={(e) =>
                        setWalletSettings({
                          ...walletSettings,
                          min_wallet_topup: parseFloat(e.target.value) || 0,
                        })
                      }
                    />
                    <p className="text-sm text-muted-foreground">
                      Minimum amount to add money to wallet
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="max_wallet_balance">Maximum Wallet Balance (₹)</Label>
                    <Input
                      id="max_wallet_balance"
                      type="number"
                      value={walletSettings.max_wallet_balance}
                      onChange={(e) =>
                        setWalletSettings({
                          ...walletSettings,
                          max_wallet_balance: parseFloat(e.target.value) || 0,
                        })
                      }
                    />
                    <p className="text-sm text-muted-foreground">
                      Maximum balance a user can hold
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Registration Tab */}
          <TabsContent value="registration">
            <Card>
              <CardHeader>
                <CardTitle>Member Registration</CardTitle>
                <CardDescription>
                  Turn the member registration process on or off for new users. Changes apply immediately.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center justify-between gap-4">
                  <div className="space-y-0.5">
                    <Label htmlFor="registration_enabled">Registration</Label>
                    <p className="text-sm text-muted-foreground">
                      {registrationEnabled ? "ON" : "OFF"}
                    </p>
                  </div>
                  <Switch
                    id="registration_enabled"
                    checked={registrationEnabled}
                    disabled={registrationMutation.isPending}
                    onCheckedChange={(checked) => registrationMutation.mutate(checked)}
                  />
                </div>

                <Separator />

                <div className="space-y-3 text-sm">
                  <div>
                    <p className="font-medium">ON</p>
                    <p className="text-muted-foreground">
                      Mobile Login → OTP → Delivery Address → Registration Fee Payment → Browse Products → Cart → Checkout → Order Payment → Order Complete
                    </p>
                  </div>
                  <div>
                    <p className="font-medium">OFF</p>
                    <p className="text-muted-foreground">
                      Mobile Login → OTP → Browse Products → Cart → Checkout → Delivery Address → Payment → Order Complete
                    </p>
                  </div>
                  <p className="text-muted-foreground">
                    While OFF, any mobile number can log in and shop as a customer, signup pages are hidden and no
                    registration fee is taken. Existing members, founders, admins and delivery partners are not affected.
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AdminLayout>
  </SuperAdminGuard>
  );
}
