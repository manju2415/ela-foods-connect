import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, LayoutGrid, Save } from "lucide-react";
import { toast } from "sonner";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";

type SectionKey = "featured" | "bestSellers" | "newArrivals";

interface DisplaySetting {
  section_key: SectionKey;
  is_enabled: boolean;
  display_order: number;
  product_limit: number;
  new_arrival_days: number | null;
}

const labels: Record<SectionKey, { title: string; description: string }> = {
  featured: { title: "Featured Products", description: "Products manually marked as Featured in the product manager." },
  bestSellers: { title: "Best Sellers", description: "Automatically ranked by quantities sold in successful orders." },
  newArrivals: { title: "New Arrivals", description: "Recently created products within the selected time window." },
};

export default function ProductDisplaySettings() {
  const queryClient = useQueryClient();
  const [settings, setSettings] = useState<DisplaySetting[]>([]);
  const { data, isLoading, error } = useQuery({
    queryKey: ["product-display-settings"],
    queryFn: async () => {
      const { data: rows, error } = await supabase
        .from("product_display_settings")
        .select("section_key,is_enabled,display_order,product_limit,new_arrival_days")
        .order("display_order");
      if (error) throw error;
      return rows as DisplaySetting[];
    },
  });

  useEffect(() => {
    if (data) setSettings(data);
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const rows = settings.map((setting, index) => ({
        ...setting,
        display_order: index,
        product_limit: Math.min(24, Math.max(1, Number(setting.product_limit) || 1)),
        new_arrival_days: setting.section_key === "newArrivals"
          ? Math.min(365, Math.max(1, Number(setting.new_arrival_days) || 30))
          : null,
      }));
      const { error } = await supabase
        .from("product_display_settings")
        .upsert(rows, { onConflict: "section_key" });
      if (error) throw error;
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["product-display-settings"] }),
        queryClient.invalidateQueries({ queryKey: ["homepage-product-sections"] }),
      ]);
      toast.success("Product display settings saved");
    },
    onError: (error: Error) => toast.error(`Could not save settings: ${error.message}`),
  });

  const update = (key: SectionKey, patch: Partial<DisplaySetting>) => {
    setSettings((current) => current.map((item) => item.section_key === key ? { ...item, ...patch } : item));
  };

  const move = (index: number, direction: -1 | 1) => {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= settings.length) return;
    setSettings((current) => {
      const next = [...current];
      [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
      return next;
    });
  };

  return (
    <AdminLayout>
      <div className="mx-auto w-full max-w-5xl space-y-6 px-3 py-4 sm:px-6 sm:py-6">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold sm:text-3xl">
            <LayoutGrid className="h-6 w-6" /> Product Display Settings
          </h1>
          <p className="mt-1 text-sm text-muted-foreground sm:text-base">
            Choose which product sections appear on the homepage and arrange their order.
          </p>
        </div>

        {isLoading ? (
          <Card><CardContent className="py-12 text-center text-muted-foreground">Loading settings…</CardContent></Card>
        ) : error ? (
          <Card>
            <CardContent className="py-12 text-center text-destructive">
              Could not load display settings: {error.message}
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {settings.map((setting, index) => (
              <Card key={setting.section_key}>
                <CardHeader className="p-4 sm:p-6">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <CardTitle className="text-lg sm:text-xl">{labels[setting.section_key].title}</CardTitle>
                      <CardDescription className="mt-1">{labels[setting.section_key].description}</CardDescription>
                    </div>
                    <Switch
                      aria-label={`Enable ${labels[setting.section_key].title}`}
                      checked={setting.is_enabled}
                      onCheckedChange={(is_enabled) => update(setting.section_key, { is_enabled })}
                    />
                  </div>
                </CardHeader>
                <CardContent className="grid gap-4 p-4 pt-0 sm:grid-cols-[1fr_1fr_auto] sm:items-end sm:p-6 sm:pt-0">
                  <div className="space-y-2">
                    <Label htmlFor={`${setting.section_key}-limit`}>Product limit</Label>
                    <Input
                      id={`${setting.section_key}-limit`}
                      type="number"
                      min={1}
                      max={24}
                      value={setting.product_limit}
                      onChange={(event) => update(setting.section_key, { product_limit: Number(event.target.value) })}
                    />
                  </div>
                  {setting.section_key === "newArrivals" ? (
                    <div className="space-y-2">
                      <Label htmlFor="new-arrival-days">New arrival window (days)</Label>
                      <Input
                        id="new-arrival-days"
                        type="number"
                        min={1}
                        max={365}
                        value={setting.new_arrival_days ?? 30}
                        onChange={(event) => update(setting.section_key, { new_arrival_days: Number(event.target.value) })}
                      />
                    </div>
                  ) : <div />}
                  <div className="flex gap-2">
                    <Button type="button" variant="outline" size="icon" disabled={index === 0} onClick={() => move(index, -1)} aria-label="Move section up">
                      <ArrowUp className="h-4 w-4" />
                    </Button>
                    <Button type="button" variant="outline" size="icon" disabled={index === settings.length - 1} onClick={() => move(index, 1)} aria-label="Move section down">
                      <ArrowDown className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        <div className="sticky bottom-3 flex justify-end">
          <Button className="w-full shadow-lg sm:w-auto" disabled={isLoading || saveMutation.isPending} onClick={() => saveMutation.mutate()}>
            <Save className="mr-2 h-4 w-4" />
            {saveMutation.isPending ? "Saving…" : "Save settings"}
          </Button>
        </div>
      </div>
    </AdminLayout>
  );
}
