import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { AdminMobileCard, AdminMobileField } from "@/components/admin/AdminMobileCard";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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
import { Label } from "@/components/ui/label";
import { Search, Package, AlertTriangle, Plus, Minus } from "lucide-react";
import { toast } from "sonner";

interface Product {
  id: string;
  name: string;
  sku: string | null;
  stock_quantity: number;
  price: number;
  is_active: boolean;
}

export default function Inventory() {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "low" | "out">("all");
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [adjustAmount, setAdjustAmount] = useState("");
  const [adjustType, setAdjustType] = useState<"add" | "remove">("add");
  const queryClient = useQueryClient();

  const { data: products = [], isLoading } = useQuery({
    queryKey: ["inventory-products"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, sku, stock_quantity, price, is_active")
        .order("stock_quantity", { ascending: true });

      if (error) throw error;
      return data as Product[];
    },
  });

  const updateStockMutation = useMutation({
    mutationFn: async ({ productId, newQuantity }: { productId: string; newQuantity: number }) => {
      const { error } = await supabase
        .from("products")
        .update({ stock_quantity: Math.max(0, newQuantity) })
        .eq("id", productId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inventory-products"] });
      toast.success("Stock updated successfully");
      setSelectedProduct(null);
      setAdjustAmount("");
    },
    onError: () => {
      toast.error("Failed to update stock");
    },
  });

  const handleAdjustStock = () => {
    if (!selectedProduct || !adjustAmount) return;

    const amount = parseInt(adjustAmount);
    if (isNaN(amount) || amount <= 0) {
      toast.error("Please enter a valid amount");
      return;
    }

    const newQuantity = adjustType === "add" 
      ? selectedProduct.stock_quantity + amount 
      : selectedProduct.stock_quantity - amount;

    updateStockMutation.mutate({ productId: selectedProduct.id, newQuantity });
  };

  const filteredProducts = products.filter((product) => {
    const matchesSearch = 
      product.name.toLowerCase().includes(search.toLowerCase()) ||
      product.sku?.toLowerCase().includes(search.toLowerCase());
    
    if (filter === "low") return matchesSearch && product.stock_quantity > 0 && product.stock_quantity < 10;
    if (filter === "out") return matchesSearch && product.stock_quantity === 0;
    return matchesSearch;
  });

  const lowStockCount = products.filter(p => p.stock_quantity > 0 && p.stock_quantity < 10).length;
  const outOfStockCount = products.filter(p => p.stock_quantity === 0).length;

  const getStockBadge = (quantity: number) => {
    if (quantity === 0) {
      return <Badge variant="destructive">Out of Stock</Badge>;
    }
    if (quantity < 10) {
      return <Badge className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200">Low Stock</Badge>;
    }
    return <Badge variant="secondary" className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">In Stock</Badge>;
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Inventory Management</h1>
          <p className="text-muted-foreground">Track and manage product stock levels</p>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card 
            className={`cursor-pointer transition-colors ${filter === "all" ? "ring-2 ring-primary" : ""}`}
            onClick={() => setFilter("all")}
          >
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Package className="h-4 w-4" />
                Total Products
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{products.length}</p>
            </CardContent>
          </Card>
          
          <Card 
            className={`cursor-pointer transition-colors ${filter === "low" ? "ring-2 ring-primary" : ""}`}
            onClick={() => setFilter("low")}
          >
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2 text-yellow-600">
                <AlertTriangle className="h-4 w-4" />
                Low Stock
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-yellow-600">{lowStockCount}</p>
            </CardContent>
          </Card>
          
          <Card 
            className={`cursor-pointer transition-colors ${filter === "out" ? "ring-2 ring-primary" : ""}`}
            onClick={() => setFilter("out")}
          >
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2 text-destructive">
                <AlertTriangle className="h-4 w-4" />
                Out of Stock
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-destructive">{outOfStockCount}</p>
            </CardContent>
          </Card>
        </div>

        {/* Products Table */}
        <Card className="max-w-full overflow-hidden">
          <CardHeader className="p-4 sm:p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <CardTitle>Product Inventory</CardTitle>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search products..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9 w-full sm:w-64"
                />
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
              </div>
            ) : filteredProducts.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No products found
              </div>
            ) : (
              <>
              <div className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead>SKU</TableHead>
                    <TableHead>Price</TableHead>
                    <TableHead>Stock</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredProducts.map((product) => (
                    <TableRow key={product.id}>
                      <TableCell className="font-medium">{product.name}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {product.sku || "N/A"}
                      </TableCell>
                      <TableCell>₹{Number(product.price).toFixed(2)}</TableCell>
                      <TableCell>
                        <span className={product.stock_quantity < 10 ? "font-bold text-destructive" : ""}>
                          {product.stock_quantity}
                        </span>
                      </TableCell>
                      <TableCell>{getStockBadge(product.stock_quantity)}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setSelectedProduct(product)}
                        >
                          Adjust Stock
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              </div>
              <div className="space-y-3 md:hidden">
                {filteredProducts.map((product) => (
                  <AdminMobileCard key={product.id}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="font-medium break-words">{product.name}</div>
                        <div className="text-sm text-muted-foreground break-all">{product.sku || "N/A"}</div>
                      </div>
                      {getStockBadge(product.stock_quantity)}
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <AdminMobileField label="Price">₹{Number(product.price).toFixed(2)}</AdminMobileField>
                      <AdminMobileField label="Stock"><span className={product.stock_quantity < 10 ? "font-bold text-destructive" : ""}>{product.stock_quantity}</span></AdminMobileField>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => setSelectedProduct(product)} className="w-full">
                      Adjust Stock
                    </Button>
                  </AdminMobileCard>
                ))}
              </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Adjust Stock Dialog */}
        <Dialog open={!!selectedProduct} onOpenChange={() => setSelectedProduct(null)}>
          <DialogContent className="max-w-[calc(100vw-2rem)]">
            <DialogHeader>
              <DialogTitle>Adjust Stock: {selectedProduct?.name}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="flex items-center justify-center gap-4 p-4 bg-muted rounded-lg">
                <span className="text-muted-foreground">Current Stock:</span>
                <span className="text-2xl font-bold">{selectedProduct?.stock_quantity}</span>
              </div>
              
              <div className="flex gap-2">
                <Button
                  variant={adjustType === "add" ? "default" : "outline"}
                  onClick={() => setAdjustType("add")}
                  className="flex-1"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add Stock
                </Button>
                <Button
                  variant={adjustType === "remove" ? "default" : "outline"}
                  onClick={() => setAdjustType("remove")}
                  className="flex-1"
                >
                  <Minus className="h-4 w-4 mr-2" />
                  Remove Stock
                </Button>
              </div>
              
              <div className="space-y-2">
                <Label>Quantity</Label>
                <Input
                  type="number"
                  min="1"
                  placeholder="Enter amount"
                  value={adjustAmount}
                  onChange={(e) => setAdjustAmount(e.target.value)}
                />
              </div>
              
              {adjustAmount && !isNaN(parseInt(adjustAmount)) && (
                <div className="p-3 bg-muted rounded-lg text-center">
                  <span className="text-muted-foreground">New Stock: </span>
                  <span className="font-bold">
                    {Math.max(0, adjustType === "add" 
                      ? (selectedProduct?.stock_quantity || 0) + parseInt(adjustAmount)
                      : (selectedProduct?.stock_quantity || 0) - parseInt(adjustAmount)
                    )}
                  </span>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setSelectedProduct(null)}>
                Cancel
              </Button>
              <Button 
                onClick={handleAdjustStock} 
                disabled={updateStockMutation.isPending || !adjustAmount}
              >
                {updateStockMutation.isPending ? "Updating..." : "Update Stock"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AdminLayout>
  );
}
