import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Store, Truck, Receipt, Save } from "lucide-react";
import { toast } from "sonner";
import { Json } from "@/integrations/supabase/types";

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

const defaultStoreSettings: StoreSettings = {
  store_name: "ELA Foods",
  store_email: "contact@elafoods.com",
  store_phone: "",
  store_address: "",
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

export default function Settings() {
  const [storeSettings, setStoreSettings] = useState<StoreSettings>(defaultStoreSettings);
  const [shippingSettings, setShippingSettings] = useState<ShippingSettings>(defaultShippingSettings);
  const [taxSettings, setTaxSettings] = useState<TaxSettings>(defaultTaxSettings);
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
    mutationFn: async (settingsToSave: { key: string; value: Json; description: string }[]) => {
      for (const setting of settingsToSave) {
        await saveSetting(setting.key, setting.value, setting.description);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["platform-settings"] });
      toast.success("Settings saved successfully");
    },
    onError: (error) => {
      toast.error("Failed to save settings: " + error.message);
    },
  });

  const handleSaveAll = async () => {
    setIsSaving(true);
    await saveMutation.mutateAsync([
      { key: "store_settings", value: storeSettings as unknown as Json, description: "General store information" },
      { key: "shipping_settings", value: shippingSettings as unknown as Json, description: "Shipping rates and zones" },
      { key: "tax_settings", value: taxSettings as unknown as Json, description: "Tax configuration" },
    ]);
    setIsSaving(false);
  };

  if (isLoading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
            <p className="text-muted-foreground">Configure your store settings</p>
          </div>
          <Button onClick={handleSaveAll} disabled={isSaving || saveMutation.isPending}>
            <Save className="mr-2 h-4 w-4" />
            {isSaving ? "Saving..." : "Save All Settings"}
          </Button>
        </div>

        <Tabs defaultValue="store" className="space-y-6">
          <TabsList>
            <TabsTrigger value="store" className="flex items-center gap-2">
              <Store className="h-4 w-4" /> Store Info
            </TabsTrigger>
            <TabsTrigger value="shipping" className="flex items-center gap-2">
              <Truck className="h-4 w-4" /> Shipping
            </TabsTrigger>
            <TabsTrigger value="tax" className="flex items-center gap-2">
              <Receipt className="h-4 w-4" /> Tax
            </TabsTrigger>
          </TabsList>

          <TabsContent value="store">
            <Card>
              <CardHeader>
                <CardTitle>Store Information</CardTitle>
                <CardDescription>Basic information about your store</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
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

                <div className="grid grid-cols-2 gap-4">
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
                <div className="flex items-center justify-between">
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

                <div className="grid grid-cols-2 gap-4">
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
                <div className="flex items-center justify-between">
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

                <div className="grid grid-cols-2 gap-4">
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

                <div className="flex items-center justify-between">
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
        </Tabs>
      </div>
    </AdminLayout>
  );
}
