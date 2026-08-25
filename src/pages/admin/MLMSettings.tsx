import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { SuperAdminGuard } from "@/components/admin/SuperAdminGuard";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Save, DollarSign, Users, Percent, Gift, TrendingUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface MLMSetting {
  id: string;
  key: string;
  value: Record<string, unknown>;
  description: string;
}

const MLMSettings = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [settings, setSettings] = useState<Record<string, Record<string, unknown>>>({
    registration_fee: { total: 2000, non_refundable: 1000, wallet_credit: 1000 },
    founder_registration_fee: { total: 5000, non_refundable: 2000, wallet_credit: 3000 },
    referral_bonus_first_10: { amount: 200, is_withdrawable: true },
    referral_bonus_beyond_10: { amount: 100, is_withdrawable: false },
    founder_referral_bonus: { amount: 300, is_withdrawable: true },
    purchase_commission_rate: { percentage: 5 },
    welcome_bonus: { amount: 50, is_withdrawable: false },
    max_withdrawable_referrals: { count: 10 },
    founder_purchase_commission: { enabled: false, percentage: 5 },
    founder_level_commissions: {
      enabled: true,
      levels: [
        { depth: 1, amount: 100, description: "Direct referral" },
        { depth: 2, amount: 75, description: "Level 2" },
        { depth: 3, amount: 50, description: "Level 3" },
        { depth: 4, amount: 40, description: "Level 4" },
        { depth: 5, amount: 30, description: "Level 5" },
      ],
    },
  });

  const { data: mlmSettings, isLoading } = useQuery({
    queryKey: ["mlm-settings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("mlm_settings")
        .select("*");
      if (error) throw error;
      return data as MLMSetting[];
    },
  });

  useEffect(() => {
    if (mlmSettings) {
      const settingsMap: Record<string, Record<string, unknown>> = {};
      mlmSettings.forEach((s) => {
        settingsMap[s.key] = s.value as Record<string, unknown>;
      });
      setSettings((prev) => ({ ...prev, ...settingsMap }));
    }
  }, [mlmSettings]);

  // History of setting versions (each save creates a new immutable snapshot)
  const { data: versions = [] } = useQuery({
    queryKey: ["mlm-settings-versions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("mlm_settings_versions")
        .select("id, effective_from, note")
        .order("effective_from", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data as { id: string; effective_from: string; note: string | null }[];
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      for (const [key, value] of Object.entries(settings)) {
        const { error } = await supabase
          .from("mlm_settings")
          .upsert({
            key,
            value: value as unknown as Record<string, never>,
            updated_at: new Date().toISOString(),
          }, { onConflict: "key" });
        if (error) throw error;
      }

      // Create a new immutable version snapshot. Existing users stay pinned to
      // the version active at their registration, so their wallets never change.
      const { data: userData } = await supabase.auth.getUser();
      const { error: versionError } = await supabase
        .from("mlm_settings_versions")
        .insert({
          settings: settings as unknown as Record<string, never>,
          created_by: userData?.user?.id ?? null,
          note: "Saved from MLM Settings",
        });
      if (versionError) throw versionError;
    },
    onSuccess: () => {
      toast({ title: "Settings saved", description: "A new settings version was created. Existing members keep their original version." });
      queryClient.invalidateQueries({ queryKey: ["mlm-settings"] });
      queryClient.invalidateQueries({ queryKey: ["mlm-settings-versions"] });
    },
    onError: (error) => {
      toast({ title: "Error", description: "Failed to save settings. " + error.message, variant: "destructive" });
    },
  });


  const updateSetting = (key: string, field: string, value: unknown) => {
    setSettings((prev) => ({
      ...prev,
      [key]: { ...prev[key], [field]: value },
    }));
  };

  if (isLoading) {
    return (
      <SuperAdminGuard>
        <AdminLayout>
          <div className="flex items-center justify-center h-64">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        </AdminLayout>
      </SuperAdminGuard>
    );
  }

  return (
    <SuperAdminGuard>
      <AdminLayout>
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold">MLM Settings</h1>
              <p className="text-muted-foreground">Configure referral bonuses, commissions, and registration fees</p>
            </div>
            <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
              {saveMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
              Save All Settings
            </Button>
          </div>

          {/* Registration Fees */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <DollarSign className="h-5 w-5" />
                Registration Fees
              </CardTitle>
              <CardDescription>Configure the fees users pay when registering</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-6 md:grid-cols-2">
                <div className="space-y-4 p-4 border rounded-lg">
                  <h4 className="font-medium">Regular User Registration</h4>
                  <div className="space-y-3">
                    <div className="space-y-2">
                      <Label>Total Fee (₹)</Label>
                      <Input
                        type="number"
                        value={settings.registration_fee?.total as number || 0}
                        onChange={(e) => updateSetting("registration_fee", "total", Number(e.target.value))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Non-Refundable Amount (₹)</Label>
                      <Input
                        type="number"
                        value={settings.registration_fee?.non_refundable as number || 0}
                        onChange={(e) => updateSetting("registration_fee", "non_refundable", Number(e.target.value))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Wallet Credit (₹)</Label>
                      <Input
                        type="number"
                        value={settings.registration_fee?.wallet_credit as number || 0}
                        onChange={(e) => updateSetting("registration_fee", "wallet_credit", Number(e.target.value))}
                      />
                      <p className="text-xs text-muted-foreground">Amount credited to user's wallet (purchase only)</p>
                    </div>
                  </div>
                </div>

                <div className="space-y-4 p-4 border rounded-lg bg-primary/5">
                  <h4 className="font-medium">Founder Registration</h4>
                  <div className="space-y-3">
                    <div className="space-y-2">
                      <Label>Total Fee (₹)</Label>
                      <Input
                        type="number"
                        value={settings.founder_registration_fee?.total as number || 0}
                        onChange={(e) => updateSetting("founder_registration_fee", "total", Number(e.target.value))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Non-Refundable Amount (₹)</Label>
                      <Input
                        type="number"
                        value={settings.founder_registration_fee?.non_refundable as number || 0}
                        onChange={(e) => updateSetting("founder_registration_fee", "non_refundable", Number(e.target.value))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Wallet Credit (₹)</Label>
                      <Input
                        type="number"
                        value={settings.founder_registration_fee?.wallet_credit as number || 0}
                        onChange={(e) => updateSetting("founder_registration_fee", "wallet_credit", Number(e.target.value))}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Referral Bonuses */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Gift className="h-5 w-5" />
                Referral Bonuses
              </CardTitle>
              <CardDescription>Configure bonuses for referring new users</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-6 md:grid-cols-3">
                <div className="space-y-4 p-4 border rounded-lg">
                  <h4 className="font-medium">First {settings.max_withdrawable_referrals?.count as number || 10} Referrals</h4>
                  <div className="space-y-3">
                    <div className="space-y-2">
                      <Label>Bonus Amount (₹)</Label>
                      <Input
                        type="number"
                        value={settings.referral_bonus_first_10?.amount as number || 0}
                        onChange={(e) => updateSetting("referral_bonus_first_10", "amount", Number(e.target.value))}
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <Label>Withdrawable</Label>
                      <Switch
                        checked={settings.referral_bonus_first_10?.is_withdrawable as boolean || false}
                        onCheckedChange={(checked) => updateSetting("referral_bonus_first_10", "is_withdrawable", checked)}
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-4 p-4 border rounded-lg">
                  <h4 className="font-medium">Beyond {settings.max_withdrawable_referrals?.count as number || 10} Referrals</h4>
                  <div className="space-y-3">
                    <div className="space-y-2">
                      <Label>Bonus Amount (₹)</Label>
                      <Input
                        type="number"
                        value={settings.referral_bonus_beyond_10?.amount as number || 0}
                        onChange={(e) => updateSetting("referral_bonus_beyond_10", "amount", Number(e.target.value))}
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <Label>Withdrawable</Label>
                      <Switch
                        checked={settings.referral_bonus_beyond_10?.is_withdrawable as boolean || false}
                        onCheckedChange={(checked) => updateSetting("referral_bonus_beyond_10", "is_withdrawable", checked)}
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-4 p-4 border rounded-lg bg-primary/5">
                  <h4 className="font-medium">Founder Referral Bonus</h4>
                  <div className="space-y-3">
                    <div className="space-y-2">
                      <Label>Bonus Amount (₹)</Label>
                      <Input
                        type="number"
                        value={settings.founder_referral_bonus?.amount as number || 0}
                        onChange={(e) => updateSetting("founder_referral_bonus", "amount", Number(e.target.value))}
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <Label>Withdrawable</Label>
                      <Switch
                        checked={settings.founder_referral_bonus?.is_withdrawable as boolean || false}
                        onCheckedChange={(checked) => updateSetting("founder_referral_bonus", "is_withdrawable", checked)}
                      />
                    </div>
                  </div>
                </div>
              </div>

              <Separator />

              <div className="grid gap-6 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Max Withdrawable Referrals</Label>
                  <Input
                    type="number"
                    value={settings.max_withdrawable_referrals?.count as number || 10}
                    onChange={(e) => updateSetting("max_withdrawable_referrals", "count", Number(e.target.value))}
                  />
                  <p className="text-xs text-muted-foreground">Number of referrals eligible for withdrawable bonus</p>
                </div>

                <div className="space-y-4 p-4 border rounded-lg">
                  <h4 className="font-medium">Welcome Bonus</h4>
                  <div className="space-y-3">
                    <div className="space-y-2">
                      <Label>Bonus Amount (₹)</Label>
                      <Input
                        type="number"
                        value={settings.welcome_bonus?.amount as number || 0}
                        onChange={(e) => updateSetting("welcome_bonus", "amount", Number(e.target.value))}
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <Label>Withdrawable</Label>
                      <Switch
                        checked={settings.welcome_bonus?.is_withdrawable as boolean || false}
                        onCheckedChange={(checked) => updateSetting("welcome_bonus", "is_withdrawable", checked)}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Purchase Commission */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Percent className="h-5 w-5" />
                Purchase Commission
              </CardTitle>
              <CardDescription>Commission earned from associate/member purchases</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-6 md:grid-cols-2">
                <div className="space-y-4 p-4 border rounded-lg">
                  <div className="flex items-center justify-between">
                    <h4 className="font-medium">Master Commission</h4>
                    <Switch
                      checked={settings.purchase_commission_rate?.enabled !== false}
                      onCheckedChange={(checked) => updateSetting("purchase_commission_rate", "enabled", checked)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Commission Rate (%)</Label>
                    <Input
                      type="number"
                      min="0"
                      max="100"
                      step="0.5"
                      disabled={settings.purchase_commission_rate?.enabled === false}
                      value={settings.purchase_commission_rate?.percentage as number || 5}
                      onChange={(e) => updateSetting("purchase_commission_rate", "percentage", Number(e.target.value))}
                    />
                    <p className="text-xs text-muted-foreground">
                      {settings.purchase_commission_rate?.enabled === false
                        ? "Purchase commission is disabled — no commission is credited on associate purchases."
                        : "Percentage of purchase amount credited to master's wallet (purchase only)"}
                    </p>
                  </div>
                </div>


                <div className="space-y-4 p-4 border rounded-lg bg-primary/5">
                  <div className="flex items-center justify-between">
                    <h4 className="font-medium">Founder Commission</h4>
                    <Switch
                      checked={settings.founder_purchase_commission?.enabled as boolean || false}
                      onCheckedChange={(checked) => updateSetting("founder_purchase_commission", "enabled", checked)}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Enable to give founders a commission from purchases made by members in their network
                  </p>
                  
                  {settings.founder_purchase_commission?.enabled && (
                    <div className="space-y-2 pt-2 border-t">
                      <Label>Commission Rate (%)</Label>
                      <Input
                        type="number"
                        min="0"
                        max="100"
                        step="0.5"
                        value={settings.founder_purchase_commission?.percentage as number || 5}
                        onChange={(e) => updateSetting("founder_purchase_commission", "percentage", Number(e.target.value))}
                      />
                      <p className="text-xs text-muted-foreground">
                        Percentage of purchase amount credited to founder's wallet
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Multi-Level Founder Commissions */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5" />
                Multi-Level Network Commission Rates
              </CardTitle>
              <CardDescription>
                All upline members (Founders, Masters, Associates) earn these commissions when new users are added at each level depth in their network.
                Add or remove levels and set variable amounts.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <Label>Enable Multi-Level Commissions</Label>
                <Switch
                  checked={(settings.founder_level_commissions?.enabled as boolean) ?? true}
                  onCheckedChange={(checked) => updateSetting("founder_level_commissions", "enabled", checked)}
                />
              </div>

              {(settings.founder_level_commissions?.enabled as boolean) !== false && (
                <>
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {((settings.founder_level_commissions?.levels as Array<{ depth: number; amount: number; description: string; enabled?: boolean; is_withdrawable?: boolean }>) || []).map((level, index) => (
                      <div key={index} className={`p-4 border rounded-lg space-y-3 ${level.enabled === false ? 'opacity-60 bg-muted/30' : ''}`}>
                        <div className="flex items-center justify-between">
                          <Badge variant={level.depth <= 3 ? "default" : "secondary"}>
                            Level {level.depth}
                          </Badge>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              const levels = [...((settings.founder_level_commissions?.levels as Array<{ depth: number; amount: number; description: string; enabled?: boolean; is_withdrawable?: boolean }>) || [])];
                              levels.splice(index, 1);
                              updateSetting("founder_level_commissions", "levels", levels);
                            }}
                            disabled={((settings.founder_level_commissions?.levels as unknown[]) || []).length <= 1}
                          >
                            <span className="text-xs text-destructive">Remove</span>
                          </Button>
                        </div>
                        <div className="flex items-center justify-between">
                          <Label className="text-xs">Enable Level</Label>
                          <Switch
                            checked={level.enabled !== false}
                            onCheckedChange={(checked) => {
                              const levels = [...((settings.founder_level_commissions?.levels as Array<{ depth: number; amount: number; description: string; enabled?: boolean; is_withdrawable?: boolean }>) || [])];
                              levels[index] = { ...levels[index], enabled: checked };
                              updateSetting("founder_level_commissions", "levels", levels);
                            }}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Amount (₹)</Label>
                          <Input
                            type="number"
                            min="0"
                            value={level.amount}
                            onChange={(e) => {
                              const levels = [...((settings.founder_level_commissions?.levels as Array<{ depth: number; amount: number; description: string; enabled?: boolean; is_withdrawable?: boolean }>) || [])];
                              levels[index] = { ...levels[index], amount: Number(e.target.value) };
                              updateSetting("founder_level_commissions", "levels", levels);
                            }}
                            className="h-8"
                            disabled={level.enabled === false}
                          />
                        </div>
                        <div className="flex items-center justify-between">
                          <Label className="text-xs">Withdrawable</Label>
                          <Switch
                            checked={level.is_withdrawable !== false}
                            onCheckedChange={(checked) => {
                              const levels = [...((settings.founder_level_commissions?.levels as Array<{ depth: number; amount: number; description: string; enabled?: boolean; is_withdrawable?: boolean }>) || [])];
                              levels[index] = { ...levels[index], is_withdrawable: checked };
                              updateSetting("founder_level_commissions", "levels", levels);
                            }}
                            disabled={level.enabled === false}
                          />
                        </div>
                        <p className="text-[10px] text-muted-foreground">
                          {level.is_withdrawable !== false ? "Credits to withdrawable wallet" : "Credits to purchase-only wallet"}
                        </p>
                        <div className="space-y-1">
                          <Label className="text-xs">Description</Label>
                          <Input
                            value={level.description}
                            onChange={(e) => {
                              const levels = [...((settings.founder_level_commissions?.levels as Array<{ depth: number; amount: number; description: string; enabled?: boolean; is_withdrawable?: boolean }>) || [])];
                              levels[index] = { ...levels[index], description: e.target.value };
                              updateSetting("founder_level_commissions", "levels", levels);
                            }}
                            className="h-8"
                            disabled={level.enabled === false}
                          />
                        </div>
                      </div>
                    ))}
                  </div>

                  <Button
                    variant="outline"
                    onClick={() => {
                      const levels = [...((settings.founder_level_commissions?.levels as Array<{ depth: number; amount: number; description: string; enabled?: boolean; is_withdrawable?: boolean }>) || [])];
                      const nextDepth = levels.length > 0 ? Math.max(...levels.map(l => l.depth)) + 1 : 1;
                      levels.push({ depth: nextDepth, amount: 0, description: `Level ${nextDepth}`, enabled: true, is_withdrawable: true });
                      updateSetting("founder_level_commissions", "levels", levels);
                    }}
                  >
                    + Add Level
                  </Button>
                </>
              )}
            </CardContent>
          </Card>

          {/* User Levels Info */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                User Level Hierarchy
              </CardTitle>
              <CardDescription>Understanding the MLM structure</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-3">
                <div className="p-4 border rounded-lg bg-primary/10">
                  <h4 className="font-semibold text-primary">Founder</h4>
                  <p className="text-sm text-muted-foreground mt-1">
                    Top-level users who pay the founder registration fee. All referrals get withdrawable bonuses.
                  </p>
                </div>
                <div className="p-4 border rounded-lg bg-blue-500/10">
                  <h4 className="font-semibold text-blue-600">Master</h4>
                  <p className="text-sm text-muted-foreground mt-1">
                    Users who have referred at least one person. Earn commission from associate purchases.
                  </p>
                </div>
                <div className="p-4 border rounded-lg bg-green-500/10">
                  <h4 className="font-semibold text-green-600">Associate</h4>
                  <p className="text-sm text-muted-foreground mt-1">
                    New users who haven't referred anyone yet. Become master after first referral.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Settings Version History */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5" />
                Settings Version History
              </CardTitle>
              <CardDescription>
                Each save creates a new version. Members are tagged with the version active at registration,
                and all their wallet/commission calculations keep using that version.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {versions.length === 0 ? (
                <p className="text-sm text-muted-foreground">No versions recorded yet.</p>
              ) : (
                <div className="space-y-2">
                  {versions.map((v, i) => (
                    <div key={v.id} className="flex items-center justify-between border rounded-md p-3">
                      <div>
                        <p className="font-medium text-sm">
                          {new Date(v.effective_from).toLocaleString()}
                        </p>
                        <p className="text-xs text-muted-foreground">{v.note || "Settings snapshot"}</p>
                      </div>
                      {i === 0 && <Badge>Current</Badge>}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

      </AdminLayout>
    </SuperAdminGuard>
  );
};

export default MLMSettings;