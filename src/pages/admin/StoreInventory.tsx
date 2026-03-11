import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { ArrowLeft, Search, Save } from "lucide-react";
import { toast } from "sonner";

const StoreInventory = () => {
  const { id: storeId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [changes, setChanges] = useState<Record<string, number>>({});

  const { data: store } = useQuery({
    queryKey: ["store", storeId],
    queryFn: async () => {
      const { data, error } = await supabase.from("stores").select("*").eq("id", storeId!).single();
      if (error) throw error;
      return data;
    },
    enabled: !!storeId,
  });

  const { data: products = [], isLoading } = useQuery({
    queryKey: ["store-inventory", storeId],
    queryFn: async () => {
      const { data: allProducts, error: pErr } = await supabase
        .from("products")
        .select("id, name, sku, stock_quantity, price")
        .eq("is_active", true)
        .order("name");
      if (pErr) throw pErr;

      const { data: inventory, error: iErr } = await supabase
        .from("store_inventory")
        .select("product_id, stock_quantity")
        .eq("store_id", storeId!);
      if (iErr) throw iErr;

      const invMap = new Map(inventory?.map(i => [i.product_id, i.stock_quantity]) || []);
      return (allProducts || []).map(p => ({
        ...p,
        store_stock: invMap.get(p.id) ?? 0,
      }));
    },
    enabled: !!storeId,
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const entries = Object.entries(changes);
      if (entries.length === 0) return;

      for (const [productId, qty] of entries) {
        const { error } = await supabase
          .from("store_inventory")
          .upsert(
            { store_id: storeId!, product_id: productId, stock_quantity: qty },
            { onConflict: "store_id,product_id" }
          );
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["store-inventory", storeId] });
      setChanges({});
      toast.success("Inventory updated");
    },
    onError: (err: any) => toast.error(err.message),
  });

  const filtered = products.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    (p.sku || "").toLowerCase().includes(search.toLowerCase())
  );

  const getStoreStock = (productId: string) =>
    changes[productId] !== undefined ? changes[productId] : products.find(p => p.id === productId)?.store_stock ?? 0;

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate("/admin/stores")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex-1">
            <h1 className="text-3xl font-bold">{store?.name || "Store"} — Inventory</h1>
            <p className="text-muted-foreground">Manage stock levels for this store</p>
          </div>
          {Object.keys(changes).length > 0 && (
            <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
              <Save className="h-4 w-4 mr-2" />
              Save {Object.keys(changes).length} Changes
            </Button>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Search className="h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search products..." value={search} onChange={e => setSearch(e.target.value)} className="max-w-sm" />
        </div>

        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead>Global Stock</TableHead>
                  <TableHead>Store Stock</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={4} className="text-center py-8">Loading...</TableCell></TableRow>
                ) : filtered.map(p => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{p.name}</TableCell>
                    <TableCell className="text-muted-foreground">{p.sku || "—"}</TableCell>
                    <TableCell>{p.stock_quantity}</TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        min={0}
                        className="w-24"
                        value={getStoreStock(p.id)}
                        onChange={e => setChanges(prev => ({ ...prev, [p.id]: parseInt(e.target.value) || 0 }))}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
};

export default StoreInventory;
