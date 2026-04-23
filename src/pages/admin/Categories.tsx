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
import { Search, Plus, Pencil, Trash2, FolderTree, Upload, X, GripVertical } from "lucide-react";
import { toast } from "sonner";
import { compressImage } from "@/utils/imageCompression";

interface Category {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  image_url: string | null;
  parent_id: string | null;
  is_active: boolean;
  display_order: number;
  created_at: string;
  return_enabled?: boolean;
  return_window_days?: number;
  exchange_enabled?: boolean;
}

interface CategoryFormData {
  name: string;
  slug: string;
  description: string;
  parent_id: string;
  is_active: boolean;
  display_order: string;
  return_enabled: boolean;
  return_window_days: string;
  exchange_enabled: boolean;
}

const initialFormData: CategoryFormData = {
  name: "",
  slug: "",
  description: "",
  parent_id: "",
  is_active: true,
  display_order: "0",
  return_enabled: true,
  return_window_days: "7",
  exchange_enabled: true,
};

export default function Categories() {
  const [search, setSearch] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [deletingCategory, setDeletingCategory] = useState<Category | null>(null);
  const [formData, setFormData] = useState<CategoryFormData>(initialFormData);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [existingImage, setExistingImage] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const queryClient = useQueryClient();

  const { data: categories = [], isLoading } = useQuery({
    queryKey: ["admin-categories"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("categories")
        .select("*")
        .order("display_order", { ascending: true });
      if (error) throw error;
      return data as Category[];
    },
  });

  const uploadImage = async (file: File): Promise<string> => {
    const compressedFile = await compressImage(file);
    const fileExt = compressedFile.name.split(".").pop();
    const fileName = `category-${crypto.randomUUID()}.${fileExt}`;
    const { error } = await supabase.storage
      .from("product-images")
      .upload(fileName, compressedFile);
    if (error) throw error;
    const { data: urlData } = supabase.storage
      .from("product-images")
      .getPublicUrl(fileName);
    return urlData.publicUrl;
  };

  const createMutation = useMutation({
    mutationFn: async (data: CategoryFormData) => {
      setIsUploading(true);
      let imageUrl: string | null = null;
      if (imageFile) {
        imageUrl = await uploadImage(imageFile);
      }
      const { error } = await (supabase.from("categories") as any).insert({
        name: data.name,
        slug: data.slug || data.name.toLowerCase().replace(/\s+/g, "-"),
        description: data.description || null,
        parent_id: data.parent_id || null,
        is_active: data.is_active,
        display_order: parseInt(data.display_order) || 0,
        image_url: imageUrl,
        return_enabled: data.return_enabled,
        return_window_days: parseInt(data.return_window_days) || 7,
        exchange_enabled: data.exchange_enabled,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-categories"] });
      toast.success("Category created successfully");
      closeDialog();
    },
    onError: (error) => {
      toast.error("Failed to create category: " + error.message);
    },
    onSettled: () => setIsUploading(false),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: CategoryFormData }) => {
      setIsUploading(true);
      let imageUrl = existingImage;
      if (imageFile) {
        imageUrl = await uploadImage(imageFile);
      }
      const { error } = await (supabase
        .from("categories") as any)
        .update({
          name: data.name,
          slug: data.slug || data.name.toLowerCase().replace(/\s+/g, "-"),
          description: data.description || null,
          parent_id: data.parent_id || null,
          is_active: data.is_active,
          display_order: parseInt(data.display_order) || 0,
          image_url: imageUrl,
          return_enabled: data.return_enabled,
          return_window_days: parseInt(data.return_window_days) || 7,
          exchange_enabled: data.exchange_enabled,
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-categories"] });
      toast.success("Category updated successfully");
      closeDialog();
    },
    onError: (error) => {
      toast.error("Failed to update category: " + error.message);
    },
    onSettled: () => setIsUploading(false),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("categories").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-categories"] });
      toast.success("Category deleted successfully");
      setIsDeleteDialogOpen(false);
      setDeletingCategory(null);
    },
    onError: (error) => {
      toast.error("Failed to delete category: " + error.message);
    },
  });

  const openCreateDialog = () => {
    setEditingCategory(null);
    setFormData(initialFormData);
    setImageFile(null);
    setExistingImage(null);
    setIsDialogOpen(true);
  };

  const openEditDialog = (category: Category) => {
    setEditingCategory(category);
    setFormData({
      name: category.name,
      slug: category.slug,
      description: category.description || "",
      parent_id: category.parent_id || "",
      is_active: category.is_active,
      display_order: category.display_order?.toString() || "0",
      return_enabled: category.return_enabled !== false,
      return_window_days: (category.return_window_days || 7).toString(),
      exchange_enabled: category.exchange_enabled !== false,
    });
    setExistingImage(category.image_url);
    setImageFile(null);
    setIsDialogOpen(true);
  };

  const closeDialog = () => {
    setIsDialogOpen(false);
    setEditingCategory(null);
    setFormData(initialFormData);
    setImageFile(null);
    setExistingImage(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name) {
      toast.error("Name is required");
      return;
    }
    if (editingCategory) {
      updateMutation.mutate({ id: editingCategory.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
      setImageFile(e.target.files[0]);
    }
  };

  const removeImage = () => {
    setImageFile(null);
    setExistingImage(null);
  };

  const filteredCategories = categories.filter((cat) =>
    cat.name.toLowerCase().includes(search.toLowerCase())
  );

  const getParentName = (parentId: string | null) => {
    if (!parentId) return "—";
    return categories.find((c) => c.id === parentId)?.name || "Unknown";
  };

  const getChildCount = (categoryId: string) => {
    return categories.filter((c) => c.parent_id === categoryId).length;
  };

  // Only show parent categories (no parent_id) for parent selection
  const parentCategoryOptions = categories.filter(c => !c.parent_id);

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Categories</h1>
            <p className="text-muted-foreground">Organize your product catalog</p>
          </div>
          <Button onClick={openCreateDialog} className="w-full sm:w-auto">
            <Plus className="mr-2 h-4 w-4" /> Add Category
          </Button>
        </div>

        <Card className="max-w-full overflow-hidden">
          <CardHeader className="p-4 sm:p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <CardTitle className="flex items-center gap-2">
                <FolderTree className="h-5 w-5" />
                All Categories ({filteredCategories.length})
              </CardTitle>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search categories..."
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
            ) : filteredCategories.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">No categories found</div>
            ) : (
              <>
              <div className="hidden md:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">Order</TableHead>
                      <TableHead>Image</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Parent</TableHead>
                      <TableHead>Products</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredCategories.map((category) => (
                      <TableRow key={category.id}>
                        <TableCell>
                          <div className="flex items-center gap-1 text-muted-foreground">
                            <GripVertical className="h-4 w-4" />
                            {category.display_order}
                          </div>
                        </TableCell>
                        <TableCell>
                          {category.image_url ? (
                            <img
                              src={category.image_url}
                              alt={category.name}
                              className="h-10 w-10 rounded object-cover"
                            />
                          ) : (
                            <div className="h-10 w-10 rounded bg-muted flex items-center justify-center">
                              <FolderTree className="h-5 w-5 text-muted-foreground" />
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className={category.parent_id ? "pl-6" : ""}>
                            <div className="font-medium flex items-center gap-2">
                              {category.parent_id && <span className="text-muted-foreground">└</span>}
                              {category.name}
                            </div>
                            <div className="text-sm text-muted-foreground">{category.slug}</div>
                          </div>
                        </TableCell>
                        <TableCell>
                          {category.parent_id ? (
                            <Badge variant="outline">{getParentName(category.parent_id)}</Badge>
                          ) : (
                            <Badge>Parent Category</Badge>
                          )}
                        </TableCell>
                        <TableCell>{getChildCount(category.id)} subcategories</TableCell>
                        <TableCell>
                          <Badge variant={category.is_active ? "default" : "secondary"}>
                            {category.is_active ? "Active" : "Inactive"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="sm" onClick={() => openEditDialog(category)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setDeletingCategory(category);
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
                {filteredCategories.map((category) => (
                  <AdminMobileCard key={category.id}>
                    <div className="flex gap-3">
                      {category.image_url ? (
                        <img src={category.image_url} alt={category.name} className="h-12 w-12 shrink-0 rounded object-cover" />
                      ) : (
                        <div className="h-12 w-12 shrink-0 rounded bg-muted flex items-center justify-center"><FolderTree className="h-5 w-5 text-muted-foreground" /></div>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="font-medium break-words">{category.parent_id ? "└ " : ""}{category.name}</div>
                        <div className="text-sm text-muted-foreground break-all">{category.slug}</div>
                      </div>
                      <Badge variant={category.is_active ? "default" : "secondary"} className="shrink-0">{category.is_active ? "Active" : "Inactive"}</Badge>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <AdminMobileField label="Order">{category.display_order}</AdminMobileField>
                      <AdminMobileField label="Products">{getChildCount(category.id)} subcategories</AdminMobileField>
                      <AdminMobileField label="Parent" className="col-span-2">{category.parent_id ? <Badge variant="outline">{getParentName(category.parent_id)}</Badge> : <Badge>Parent Category</Badge>}</AdminMobileField>
                    </div>
                    <div className="flex justify-end gap-2 pt-1">
                      <Button variant="outline" size="sm" onClick={() => openEditDialog(category)}><Pencil className="h-4 w-4" /></Button>
                      <Button variant="outline" size="sm" onClick={() => { setDeletingCategory(category); setIsDeleteDialogOpen(true); }}><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  </AdminMobileCard>
                ))}
              </div>
              </>
            )}
          </CardContent>
        </Card>

        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-lg max-h-[85vh] flex flex-col">
            <DialogHeader className="flex-shrink-0">
              <DialogTitle>{editingCategory ? "Edit Category" : "Add Category"}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4 flex-1 overflow-y-auto pr-2">
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

              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  rows={3}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="parent">Parent Category</Label>
                  <Select
                    value={formData.parent_id || "none"}
                    onValueChange={(value) => setFormData({ ...formData, parent_id: value === "none" ? "" : value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="None (Top level)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None (Parent Category)</SelectItem>
                      {parentCategoryOptions
                        .filter((c) => c.id !== editingCategory?.id)
                        .map((cat) => (
                          <SelectItem key={cat.id} value={cat.id}>
                            {cat.name}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">Leave as "None" to create a parent category, or select a parent to create a subcategory</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="display_order">Display Order</Label>
                  <Input
                    id="display_order"
                    type="number"
                    value={formData.display_order}
                    onChange={(e) => setFormData({ ...formData, display_order: e.target.value })}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Image</Label>
                <div className="flex items-center gap-4">
                  {(existingImage || imageFile) && (
                    <div className="relative">
                      <img
                        src={imageFile ? URL.createObjectURL(imageFile) : existingImage!}
                        alt=""
                        className="h-20 w-20 object-cover rounded"
                      />
                      <Button
                        type="button"
                        variant="destructive"
                        size="icon"
                        className="absolute -top-2 -right-2 h-6 w-6"
                        onClick={removeImage}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  )}
                  {!existingImage && !imageFile && (
                    <>
                      <Input
                        type="file"
                        accept="image/*"
                        onChange={handleFileChange}
                        className="hidden"
                        id="category-image-upload"
                      />
                      <Label
                        htmlFor="category-image-upload"
                        className="cursor-pointer inline-flex items-center gap-2 px-4 py-2 border rounded-md hover:bg-muted"
                      >
                        <Upload className="h-4 w-4" /> Upload Image
                      </Label>
                    </>
                  )}
                </div>
              </div>

              {/* Return & Exchange Settings */}
              <div className="space-y-4 border-t pt-4">
                <h4 className="text-sm font-medium">Return & Exchange Settings</h4>
                
                <div className="flex items-center gap-2">
                  <Switch
                    id="return_enabled"
                    checked={formData.return_enabled}
                    onCheckedChange={(checked) => setFormData({ ...formData, return_enabled: checked })}
                  />
                  <Label htmlFor="return_enabled">Allow Returns</Label>
                </div>

                {formData.return_enabled && (
                  <div className="space-y-2 pl-6">
                    <Label htmlFor="return_window_days">Return Window (days)</Label>
                    <Input
                      id="return_window_days"
                      type="number"
                      min="1"
                      max="30"
                      value={formData.return_window_days}
                      onChange={(e) => setFormData({ ...formData, return_window_days: e.target.value })}
                      className="w-24"
                    />
                  </div>
                )}

                <div className="flex items-center gap-2">
                  <Switch
                    id="exchange_enabled"
                    checked={formData.exchange_enabled}
                    onCheckedChange={(checked) => setFormData({ ...formData, exchange_enabled: checked })}
                  />
                  <Label htmlFor="exchange_enabled">Allow Exchanges</Label>
                </div>
              </div>

              <DialogFooter className="flex-shrink-0 pt-4 border-t sticky bottom-0 bg-background">
                <Button type="button" variant="outline" onClick={closeDialog}>
                  Cancel
                </Button>
                <Button type="submit" disabled={isUploading || createMutation.isPending || updateMutation.isPending}>
                  {isUploading ? "Uploading..." : editingCategory ? "Update" : "Create"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>


        <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Category</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete "{deletingCategory?.name}"? Products in this category will become uncategorized.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => deletingCategory && deleteMutation.mutate(deletingCategory.id)}
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
