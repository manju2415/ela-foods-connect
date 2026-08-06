import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { AdminMobileCard, AdminMobileField } from "@/components/admin/AdminMobileCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
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
import { Search, Plus, Pencil, Trash2, Package, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { compressImages } from "@/utils/imageCompression";
import { VariantsEditor, VariantDraft, emptyVariant } from "@/components/admin/VariantsEditor";

interface Product {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  short_description: string | null;
  price: number;
  compare_at_price: number | null;
  member_price: number | null;
  sku: string | null;
  stock_quantity: number;
  weight_grams: number | null;
  unit_type: string | null;
  unit_value: number | null;
  images: string[];
  category_id: string | null;
  is_active: boolean;
  is_featured: boolean;
  created_at: string;
  gst_percentage: number | null;
  gst_inclusive: boolean | null;
  hsn_code: string | null;
}

interface Category {
  id: string;
  name: string;
  parent_id: string | null;
}

interface ProductFormData {
  name: string;
  slug: string;
  description: string;
  short_description: string;
  price: string;
  compare_at_price: string;
  member_price: string;
  sku: string;
  stock_quantity: string;
  weight_grams: string;
  unit_type: string;
  unit_value: string;
  category_id: string;
  is_active: boolean;
  is_featured: boolean;
  gst_percentage: string;
  gst_inclusive: boolean;
  hsn_code: string;
}

const initialFormData: ProductFormData = {
  name: "",
  slug: "",
  description: "",
  short_description: "",
  price: "",
  compare_at_price: "",
  member_price: "",
  sku: "",
  stock_quantity: "0",
  weight_grams: "",
  unit_type: "g",
  unit_value: "",
  category_id: "",
  is_active: true,
  is_featured: false,
  gst_percentage: "0",
  gst_inclusive: true,
  hsn_code: "",
};

export default function Products() {
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [deletingProduct, setDeletingProduct] = useState<Product | null>(null);
  const [formData, setFormData] = useState<ProductFormData>(initialFormData);
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [existingImages, setExistingImages] = useState<string[]>([]);
  const [variantDrafts, setVariantDrafts] = useState<VariantDraft[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const queryClient = useQueryClient();

  const { data: products = [], isLoading } = useQuery({
    queryKey: ["admin-products"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Product[];
    },
  });

  const { data: categories = [] } = useQuery({
    queryKey: ["categories"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("categories")
        .select("id, name, parent_id")
        .order("name");
      if (error) throw error;
      return data as Category[];
    },
  });

  // Build hierarchical category options
  const getCategoryOptions = () => {
    const parentCategories = categories.filter(c => !c.parent_id);
    const options: { id: string; name: string; level: number }[] = [];
    parentCategories.forEach(parent => {
      options.push({ id: parent.id, name: parent.name, level: 0 });
      const children = categories.filter(c => c.parent_id === parent.id);
      children.forEach(child => {
        options.push({ id: child.id, name: child.name, level: 1 });
      });
    });
    // Add uncategorized categories (no parent but not parents themselves)
    categories.filter(c => !c.parent_id && !parentCategories.includes(c)).forEach(cat => {
      if (!options.find(o => o.id === cat.id)) {
        options.push({ id: cat.id, name: cat.name, level: 0 });
      }
    });
    return options;
  };

  const uploadImages = async (files: File[]): Promise<string[]> => {
    const compressedFiles = await compressImages(files);
    const urls: string[] = [];
    for (const file of compressedFiles) {
      const fileExt = file.name.split(".").pop();
      const fileName = `${crypto.randomUUID()}.${fileExt}`;
      const { error } = await supabase.storage
        .from("product-images")
        .upload(fileName, file);
      if (error) throw error;
      const { data: urlData } = supabase.storage
        .from("product-images")
        .getPublicUrl(fileName);
      urls.push(urlData.publicUrl);
    }
    return urls;
  };

  const saveVariants = async (productId: string) => {
    // Delete existing then insert current drafts (simple approach)
    await (supabase as any).from("product_variants").delete().eq("product_id", productId);
    const rows = variantDrafts
      .filter((v) => v.label.trim() && v.price)
      .map((v, i) => ({
        product_id: productId,
        label: v.label.trim(),
        unit_value: parseFloat(v.unit_value) || 0,
        unit_type: v.unit_type || "g",
        price: parseFloat(v.price),
        member_price: v.member_price ? parseFloat(v.member_price) : null,
        stock_quantity: parseInt(v.stock_quantity) || 0,
        sku: v.sku || null,
        is_default: v.is_default,
        is_active: v.is_active,
        display_order: i,
      }));
    if (rows.length > 0) {
      const { error } = await (supabase as any).from("product_variants").insert(rows);
      if (error) throw error;
    }
  };

  const createMutation = useMutation({
    mutationFn: async (data: ProductFormData) => {
      setIsUploading(true);
      let imageUrls: string[] = [];
      if (imageFiles.length > 0) {
        imageUrls = await uploadImages(imageFiles);
      }
      const { data: created, error } = await supabase.from("products").insert({
        name: data.name,
        slug: data.slug || data.name.toLowerCase().replace(/\s+/g, "-"),
        description: data.description || null,
        short_description: data.short_description || null,
        price: parseFloat(data.price),
        compare_at_price: data.compare_at_price ? parseFloat(data.compare_at_price) : null,
        member_price: data.member_price ? parseFloat(data.member_price) : null,
        sku: data.sku || null,
        stock_quantity: parseInt(data.stock_quantity) || 0,
        weight_grams: data.weight_grams ? parseInt(data.weight_grams) : null,
        unit_type: data.unit_type || "g",
        unit_value: data.unit_value ? parseFloat(data.unit_value) : null,
        category_id: data.category_id || null,
        is_active: data.is_active,
        is_featured: data.is_featured,
        images: imageUrls,
        gst_percentage: data.gst_percentage ? parseFloat(data.gst_percentage) : 0,
        gst_inclusive: data.gst_inclusive,
        hsn_code: data.hsn_code.trim(),
      }).select("id").single();
      if (error) throw error;
      if (created) await saveVariants(created.id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-products"] });
      toast.success("Product created successfully");
      closeDialog();
    },
    onError: (error) => {
      toast.error("Failed to create product: " + error.message);
    },
    onSettled: () => setIsUploading(false),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: ProductFormData }) => {
      setIsUploading(true);
      let imageUrls = [...existingImages];
      if (imageFiles.length > 0) {
        const newUrls = await uploadImages(imageFiles);
        imageUrls = [...imageUrls, ...newUrls];
      }
      const { error } = await supabase
        .from("products")
        .update({
          name: data.name,
          slug: data.slug || data.name.toLowerCase().replace(/\s+/g, "-"),
          description: data.description || null,
          short_description: data.short_description || null,
          price: parseFloat(data.price),
          compare_at_price: data.compare_at_price ? parseFloat(data.compare_at_price) : null,
          member_price: data.member_price ? parseFloat(data.member_price) : null,
          sku: data.sku || null,
          stock_quantity: parseInt(data.stock_quantity) || 0,
          weight_grams: data.weight_grams ? parseInt(data.weight_grams) : null,
          unit_type: data.unit_type || "g",
          unit_value: data.unit_value ? parseFloat(data.unit_value) : null,
          category_id: data.category_id || null,
          is_active: data.is_active,
          is_featured: data.is_featured,
          images: imageUrls,
          gst_percentage: data.gst_percentage ? parseFloat(data.gst_percentage) : 0,
          gst_inclusive: data.gst_inclusive,
          hsn_code: data.hsn_code.trim(),
        })
        .eq("id", id);
      if (error) throw error;
      await saveVariants(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-products"] });
      toast.success("Product updated successfully");
      closeDialog();
    },
    onError: (error) => {
      toast.error("Failed to update product: " + error.message);
    },
    onSettled: () => setIsUploading(false),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("products").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-products"] });
      toast.success("Product deleted successfully");
      setIsDeleteDialogOpen(false);
      setDeletingProduct(null);
    },
    onError: () => {
      toast.error("Failed to delete product");
    },
  });

  const openCreateDialog = () => {
    setEditingProduct(null);
    setFormData(initialFormData);
    setImageFiles([]);
    setExistingImages([]);
    setVariantDrafts([]);
    setIsDialogOpen(true);
  };

  const openEditDialog = async (product: Product) => {
    setEditingProduct(product);
    setFormData({
      name: product.name,
      slug: product.slug,
      description: product.description || "",
      short_description: product.short_description || "",
      price: product.price.toString(),
      compare_at_price: product.compare_at_price?.toString() || "",
      member_price: product.member_price?.toString() || "",
      sku: product.sku || "",
      stock_quantity: product.stock_quantity.toString(),
      weight_grams: product.weight_grams?.toString() || "",
      unit_type: product.unit_type || "g",
      unit_value: product.unit_value?.toString() || "",
      category_id: product.category_id || "",
      is_active: product.is_active,
      is_featured: product.is_featured,
      gst_percentage: (product.gst_percentage || 0).toString(),
      hsn_code: product.hsn_code || "",
      gst_inclusive: product.gst_inclusive !== false,
    });
    setExistingImages(product.images || []);
    setImageFiles([]);
    // Load variants
    const { data } = await (supabase as any)
      .from("product_variants")
      .select("*")
      .eq("product_id", product.id)
      .order("display_order", { ascending: true });
    setVariantDrafts(
      (data || []).map((v: any) => ({
        id: v.id,
        label: v.label || "",
        unit_value: v.unit_value?.toString() || "",
        unit_type: v.unit_type || "g",
        price: v.price?.toString() || "",
        member_price: v.member_price?.toString() || "",
        stock_quantity: v.stock_quantity?.toString() || "0",
        sku: v.sku || "",
        is_default: !!v.is_default,
        is_active: v.is_active !== false,
        display_order: v.display_order || 0,
      }))
    );
    setIsDialogOpen(true);
  };

  const closeDialog = () => {
    setIsDialogOpen(false);
    setEditingProduct(null);
    setFormData(initialFormData);
    setImageFiles([]);
    setExistingImages([]);
    setVariantDrafts([]);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^\d{4,8}$/.test(formData.hsn_code.trim())) {
      toast.error("HSN Code is required and must be 4-8 digits");
      return;
    }
    if (!formData.name || !formData.price) {
      toast.error("Name and price are required");
      return;
    }
    if (editingProduct) {
      updateMutation.mutate({ id: editingProduct.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setImageFiles([...imageFiles, ...Array.from(e.target.files)]);
    }
  };

  const removeNewImage = (index: number) => {
    setImageFiles(imageFiles.filter((_, i) => i !== index));
  };

  const removeExistingImage = (url: string) => {
    setExistingImages(existingImages.filter((img) => img !== url));
  };

  const filteredProducts = products.filter((product) => {
    const matchesSearch = product.name.toLowerCase().includes(search.toLowerCase());
    const matchesCategory = categoryFilter === "all" || product.category_id === categoryFilter;
    return matchesSearch && matchesCategory;
  });

  const getCategoryName = (categoryId: string | null) => {
    if (!categoryId) return "Uncategorized";
    return categories.find((c) => c.id === categoryId)?.name || "Unknown";
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Products</h1>
            <p className="text-muted-foreground">Manage your product catalog</p>
          </div>
          <Button onClick={openCreateDialog} className="w-full sm:w-auto">
            <Plus className="mr-2 h-4 w-4" /> Add Product
          </Button>
        </div>

        <Card className="max-w-full overflow-hidden">
          <CardHeader className="p-4 sm:p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <CardTitle className="flex items-center gap-2">
                <Package className="h-5 w-5" />
                All Products ({filteredProducts.length})
              </CardTitle>
              <div className="flex flex-col gap-2 sm:flex-row">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Search products..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-9 w-full sm:w-64"
                  />
                </div>
                <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                  <SelectTrigger className="w-full sm:w-40">
                    <SelectValue placeholder="Category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Categories</SelectItem>
                    {categories.map((cat) => (
                      <SelectItem key={cat.id} value={cat.id}>
                        {cat.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
              </div>
            ) : filteredProducts.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">No products found</div>
            ) : (
              <>
              <div className="hidden md:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Image</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>HSN</TableHead>
                      <TableHead>Price</TableHead>
                      <TableHead>Stock</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredProducts.map((product) => (
                      <TableRow key={product.id}>
                        <TableCell>
                          {product.images?.[0] ? (
                            <img
                              src={product.images[0]}
                              alt={product.name}
                              className="h-12 w-12 rounded object-cover"
                            />
                          ) : (
                            <div className="h-12 w-12 rounded bg-muted flex items-center justify-center">
                              <Package className="h-6 w-6 text-muted-foreground" />
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="font-medium">{product.name}</div>
                          <div className="text-sm text-muted-foreground">{product.sku}</div>
                        </TableCell>
                        <TableCell>{getCategoryName(product.category_id)}</TableCell>
                        <TableCell className="text-sm">{product.hsn_code || "—"}</TableCell>

                        <TableCell>
                          <div>₹{Number(product.price).toFixed(2)}</div>
                          {product.compare_at_price && (
                            <div className="text-sm text-muted-foreground line-through">
                              ₹{Number(product.compare_at_price).toFixed(2)}
                            </div>
                          )}
                        </TableCell>
                        <TableCell>{product.stock_quantity}</TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Badge variant={product.is_active ? "default" : "secondary"}>
                              {product.is_active ? "Active" : "Inactive"}
                            </Badge>
                            {product.is_featured && <Badge variant="outline">Featured</Badge>}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="sm" onClick={() => openEditDialog(product)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setDeletingProduct(product);
                              setIsDeleteDialogOpen(true);
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
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
                    <div className="flex gap-3">
                      {product.images?.[0] ? (
                        <img src={product.images[0]} alt={product.name} className="h-14 w-14 shrink-0 rounded object-cover" />
                      ) : (
                        <div className="h-14 w-14 shrink-0 rounded bg-muted flex items-center justify-center">
                          <Package className="h-6 w-6 text-muted-foreground" />
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="font-medium break-words">{product.name}</div>
                        <div className="text-sm text-muted-foreground break-all">{product.sku || "No SKU"}</div>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <AdminMobileField label="Category">{getCategoryName(product.category_id)}</AdminMobileField>
                      <AdminMobileField label="Stock">{product.stock_quantity}</AdminMobileField>
                      <AdminMobileField label="Price">
                        ₹{Number(product.price).toFixed(2)}
                        {product.compare_at_price && <span className="ml-2 text-muted-foreground line-through">₹{Number(product.compare_at_price).toFixed(2)}</span>}
                      </AdminMobileField>
                      <AdminMobileField label="Status">
                        <div className="flex flex-wrap gap-1">
                          <Badge variant={product.is_active ? "default" : "secondary"}>{product.is_active ? "Active" : "Inactive"}</Badge>
                          {product.is_featured && <Badge variant="outline">Featured</Badge>}
                        </div>
                      </AdminMobileField>
                    </div>
                    <div className="flex justify-end gap-2 pt-1">
                      <Button variant="outline" size="sm" onClick={() => openEditDialog(product)}><Pencil className="h-4 w-4" /></Button>
                      <Button variant="outline" size="sm" onClick={() => { setDeletingProduct(product); setIsDeleteDialogOpen(true); }}><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  </AdminMobileCard>
                ))}
              </div>
              </>
            )}
          </CardContent>
        </Card>

        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingProduct ? "Edit Product" : "Add Product"}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Name *</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="slug">Slug</Label>
                  <Input
                    id="slug"
                    value={formData.slug}
                    onChange={(e) => setFormData({ ...formData, slug: e.target.value })}
                    placeholder="auto-generated-from-name"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="short_description">Short Description</Label>
                <Input
                  id="short_description"
                  value={formData.short_description}
                  onChange={(e) => setFormData({ ...formData, short_description: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  rows={3}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="price">MRP Price *</Label>
                  <Input
                    id="price"
                    type="number"
                    step="0.01"
                    value={formData.price}
                    onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="member_price">Member Price</Label>
                  <Input
                    id="member_price"
                    type="number"
                    step="0.01"
                    value={formData.member_price}
                    onChange={(e) => setFormData({ ...formData, member_price: e.target.value })}
                    placeholder="Discounted price for members"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="compare_at_price">Compare at Price</Label>
                  <Input
                    id="compare_at_price"
                    type="number"
                    step="0.01"
                    value={formData.compare_at_price}
                    onChange={(e) => setFormData({ ...formData, compare_at_price: e.target.value })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="sku">SKU</Label>
                  <Input
                    id="sku"
                    value={formData.sku}
                    onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="hsn_code">HSN Code *</Label>
                  <Input
                    id="hsn_code"
                    inputMode="numeric"
                    maxLength={8}
                    placeholder="e.g. 210690"
                    value={formData.hsn_code}
                    onChange={(e) =>
                      setFormData({ ...formData, hsn_code: e.target.value.replace(/\D/g, "").slice(0, 8) })
                    }
                  />
                  <p className="text-xs text-muted-foreground">4-8 digits, required for GST filing</p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="stock_quantity">Stock</Label>
                  <Input
                    id="stock_quantity"
                    type="number"
                    value={formData.stock_quantity}
                    onChange={(e) => setFormData({ ...formData, stock_quantity: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="weight_grams">Weight (g)</Label>
                  <Input
                    id="weight_grams"
                    type="number"
                    value={formData.weight_grams}
                    onChange={(e) => setFormData({ ...formData, weight_grams: e.target.value })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="unit_type">Unit Type</Label>
                  <Select
                    value={formData.unit_type}
                    onValueChange={(value) => setFormData({ ...formData, unit_type: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select unit" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="g">Grams (g)</SelectItem>
                      <SelectItem value="kg">Kilograms (kg)</SelectItem>
                      <SelectItem value="ml">Millilitres (ml)</SelectItem>
                      <SelectItem value="litre">Litres (L)</SelectItem>
                      <SelectItem value="packet">Packet</SelectItem>
                      <SelectItem value="piece">Piece</SelectItem>
                      <SelectItem value="box">Box</SelectItem>
                      <SelectItem value="dozen">Dozen</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="unit_value">Unit Value</Label>
                  <Input
                    id="unit_value"
                    type="number"
                    step="0.01"
                    value={formData.unit_value}
                    onChange={(e) => setFormData({ ...formData, unit_value: e.target.value })}
                    placeholder="e.g. 500 for 500g"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="category">Category / Subcategory *</Label>
                <Select
                  value={formData.category_id}
                  onValueChange={(value) => setFormData({ ...formData, category_id: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    {getCategoryOptions().map((cat) => (
                      <SelectItem key={cat.id} value={cat.id}>
                        {cat.level === 1 ? `  └ ${cat.name}` : cat.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="gst_percentage">GST Percentage (%)</Label>
                  <Input
                    id="gst_percentage"
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    value={formData.gst_percentage}
                    onChange={(e) => setFormData({ ...formData, gst_percentage: e.target.value })}
                    placeholder="e.g. 18"
                  />
                </div>
                <div className="space-y-2 flex items-end">
                  <div className="flex items-center gap-2 pb-2">
                    <Switch
                      id="gst_inclusive"
                      checked={formData.gst_inclusive}
                      onCheckedChange={(checked) => setFormData({ ...formData, gst_inclusive: checked })}
                    />
                    <Label htmlFor="gst_inclusive">GST Inclusive in Price</Label>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Images</Label>
                <div className="flex flex-wrap gap-2 mb-2">
                  {existingImages.map((url) => (
                    <div key={url} className="relative">
                      <img src={url} alt="" className="h-20 w-20 object-cover rounded" />
                      <Button
                        type="button"
                        variant="destructive"
                        size="icon"
                        className="absolute -top-2 -right-2 h-6 w-6"
                        onClick={() => removeExistingImage(url)}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                  {imageFiles.map((file, index) => (
                    <div key={index} className="relative">
                      <img
                        src={URL.createObjectURL(file)}
                        alt=""
                        className="h-20 w-20 object-cover rounded"
                      />
                      <Button
                        type="button"
                        variant="destructive"
                        size="icon"
                        className="absolute -top-2 -right-2 h-6 w-6"
                        onClick={() => removeNewImage(index)}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <Input
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={handleFileChange}
                    className="hidden"
                    id="image-upload"
                  />
                  <Label
                    htmlFor="image-upload"
                    className="cursor-pointer inline-flex items-center gap-2 px-4 py-2 border rounded-md hover:bg-muted"
                  >
                    <Upload className="h-4 w-4" /> Upload Images
                  </Label>
                </div>
              </div>

              <div className="flex gap-6">
                <div className="flex items-center gap-2">
                  <Switch
                    id="is_active"
                    checked={formData.is_active}
                    onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
                  />
                  <Label htmlFor="is_active">Active</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    id="is_featured"
                    checked={formData.is_featured}
                    onCheckedChange={(checked) => setFormData({ ...formData, is_featured: checked })}
                  />
                  <Label htmlFor="is_featured">Featured</Label>
                </div>
              </div>

              <VariantsEditor variants={variantDrafts} onChange={setVariantDrafts} />

              <DialogFooter>
                <Button type="button" variant="outline" onClick={closeDialog}>
                  Cancel
                </Button>
                <Button type="submit" disabled={isUploading || createMutation.isPending || updateMutation.isPending}>
                  {isUploading ? "Uploading..." : editingProduct ? "Update" : "Create"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Product</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete "{deletingProduct?.name}"? This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => deletingProduct && deleteMutation.mutate(deletingProduct.id)}
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </AdminLayout>
  );
}
