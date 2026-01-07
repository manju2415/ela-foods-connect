import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AdminLayout } from "@/components/admin/AdminLayout";
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
import { Plus, Pencil, Trash2, Image, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { compressImage } from "@/utils/imageCompression";

interface Banner {
  id: string;
  title: string;
  subtitle: string | null;
  cta_text: string | null;
  cta_link: string | null;
  image_url: string | null;
  badge_text: string | null;
  is_active: boolean;
  display_order: number;
  location: string;
  starts_at: string | null;
  ends_at: string | null;
  created_at: string;
}

interface BannerFormData {
  title: string;
  subtitle: string;
  cta_text: string;
  cta_link: string;
  badge_text: string;
  is_active: boolean;
  display_order: string;
  location: string;
  starts_at: string;
  ends_at: string;
}

const initialFormData: BannerFormData = {
  title: "",
  subtitle: "",
  cta_text: "Shop Now",
  cta_link: "/products",
  badge_text: "",
  is_active: true,
  display_order: "0",
  location: "home_hero",
  starts_at: "",
  ends_at: "",
};

const locationOptions = [
  { value: "home_hero", label: "Home Page Hero" },
  { value: "home_secondary", label: "Home Page Secondary" },
  { value: "products_top", label: "Products Page Top" },
];

export default function Banners() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [editingBanner, setEditingBanner] = useState<Banner | null>(null);
  const [deletingBanner, setDeletingBanner] = useState<Banner | null>(null);
  const [formData, setFormData] = useState<BannerFormData>(initialFormData);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [existingImage, setExistingImage] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const queryClient = useQueryClient();

  const { data: banners = [], isLoading } = useQuery({
    queryKey: ["admin-banners"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("banners")
        .select("*")
        .order("display_order", { ascending: true });
      if (error) throw error;
      return data as Banner[];
    },
  });

  const uploadImage = async (file: File): Promise<string> => {
    const compressedFile = await compressImage(file, { maxWidthOrHeight: 2560 }); // Higher for banners
    const fileExt = compressedFile.name.split(".").pop();
    const fileName = `banner-${crypto.randomUUID()}.${fileExt}`;
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
    mutationFn: async (data: BannerFormData) => {
      setIsUploading(true);
      let imageUrl: string | null = null;
      if (imageFile) {
        imageUrl = await uploadImage(imageFile);
      }
      const { error } = await supabase.from("banners").insert({
        title: data.title,
        subtitle: data.subtitle || null,
        cta_text: data.cta_text || null,
        cta_link: data.cta_link || null,
        badge_text: data.badge_text || null,
        is_active: data.is_active,
        display_order: parseInt(data.display_order) || 0,
        location: data.location,
        starts_at: data.starts_at || null,
        ends_at: data.ends_at || null,
        image_url: imageUrl,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-banners"] });
      toast.success("Banner created successfully");
      closeDialog();
    },
    onError: (error) => {
      toast.error("Failed to create banner: " + error.message);
    },
    onSettled: () => setIsUploading(false),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: BannerFormData }) => {
      setIsUploading(true);
      let imageUrl = existingImage;
      if (imageFile) {
        imageUrl = await uploadImage(imageFile);
      }
      const { error } = await supabase
        .from("banners")
        .update({
          title: data.title,
          subtitle: data.subtitle || null,
          cta_text: data.cta_text || null,
          cta_link: data.cta_link || null,
          badge_text: data.badge_text || null,
          is_active: data.is_active,
          display_order: parseInt(data.display_order) || 0,
          location: data.location,
          starts_at: data.starts_at || null,
          ends_at: data.ends_at || null,
          image_url: imageUrl,
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-banners"] });
      toast.success("Banner updated successfully");
      closeDialog();
    },
    onError: (error) => {
      toast.error("Failed to update banner: " + error.message);
    },
    onSettled: () => setIsUploading(false),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("banners").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-banners"] });
      toast.success("Banner deleted successfully");
      setIsDeleteDialogOpen(false);
      setDeletingBanner(null);
    },
    onError: () => {
      toast.error("Failed to delete banner");
    },
  });

  const openCreateDialog = () => {
    setEditingBanner(null);
    setFormData(initialFormData);
    setImageFile(null);
    setExistingImage(null);
    setIsDialogOpen(true);
  };

  const openEditDialog = (banner: Banner) => {
    setEditingBanner(banner);
    setFormData({
      title: banner.title,
      subtitle: banner.subtitle || "",
      cta_text: banner.cta_text || "Shop Now",
      cta_link: banner.cta_link || "/products",
      badge_text: banner.badge_text || "",
      is_active: banner.is_active,
      display_order: banner.display_order.toString(),
      location: banner.location,
      starts_at: banner.starts_at ? banner.starts_at.split("T")[0] : "",
      ends_at: banner.ends_at ? banner.ends_at.split("T")[0] : "",
    });
    setExistingImage(banner.image_url);
    setImageFile(null);
    setIsDialogOpen(true);
  };

  const closeDialog = () => {
    setIsDialogOpen(false);
    setEditingBanner(null);
    setFormData(initialFormData);
    setImageFile(null);
    setExistingImage(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title) {
      toast.error("Title is required");
      return;
    }
    if (editingBanner) {
      updateMutation.mutate({ id: editingBanner.id, data: formData });
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

  const getLocationLabel = (location: string) => {
    return locationOptions.find((l) => l.value === location)?.label || location;
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Banners</h1>
            <p className="text-muted-foreground">Manage promotional banners and hero sections</p>
          </div>
          <Button onClick={openCreateDialog}>
            <Plus className="mr-2 h-4 w-4" /> Add Banner
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Image className="h-5 w-5" />
              All Banners ({banners.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
              </div>
            ) : banners.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">No banners found</div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Order</TableHead>
                      <TableHead>Image</TableHead>
                      <TableHead>Title</TableHead>
                      <TableHead>Location</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {banners.map((banner) => (
                      <TableRow key={banner.id}>
                        <TableCell>{banner.display_order}</TableCell>
                        <TableCell>
                          {banner.image_url ? (
                            <img
                              src={banner.image_url}
                              alt={banner.title}
                              className="h-12 w-20 rounded object-cover"
                            />
                          ) : (
                            <div className="h-12 w-20 rounded bg-muted flex items-center justify-center">
                              <Image className="h-6 w-6 text-muted-foreground" />
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="font-medium">{banner.title}</div>
                          <div className="text-sm text-muted-foreground line-clamp-1">
                            {banner.subtitle}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{getLocationLabel(banner.location)}</Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant={banner.is_active ? "default" : "secondary"}>
                            {banner.is_active ? "Active" : "Inactive"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="sm" onClick={() => openEditDialog(banner)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setDeletingBanner(banner);
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
            )}
          </CardContent>
        </Card>

        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingBanner ? "Edit Banner" : "Add Banner"}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="title">Title *</Label>
                  <Input
                    id="title"
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    required
                    placeholder="e.g., Experience the Mother's Touch"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="badge_text">Badge Text</Label>
                  <Input
                    id="badge_text"
                    value={formData.badge_text}
                    onChange={(e) => setFormData({ ...formData, badge_text: e.target.value })}
                    placeholder="e.g., Premium Quality Snacks"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="subtitle">Subtitle</Label>
                <Textarea
                  id="subtitle"
                  value={formData.subtitle}
                  onChange={(e) => setFormData({ ...formData, subtitle: e.target.value })}
                  rows={2}
                  placeholder="e.g., Discover authentic homemade snacks crafted with love..."
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="cta_text">Button Text</Label>
                  <Input
                    id="cta_text"
                    value={formData.cta_text}
                    onChange={(e) => setFormData({ ...formData, cta_text: e.target.value })}
                    placeholder="e.g., Shop Now"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cta_link">Button Link</Label>
                  <Input
                    id="cta_link"
                    value={formData.cta_link}
                    onChange={(e) => setFormData({ ...formData, cta_link: e.target.value })}
                    placeholder="e.g., /products"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="location">Location</Label>
                  <Select
                    value={formData.location}
                    onValueChange={(value) => setFormData({ ...formData, location: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select location" />
                    </SelectTrigger>
                    <SelectContent>
                      {locationOptions.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
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
                <div className="space-y-2 flex items-end">
                  <div className="flex items-center gap-2">
                    <Switch
                      id="is_active"
                      checked={formData.is_active}
                      onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
                    />
                    <Label htmlFor="is_active">Active</Label>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="starts_at">Start Date (Optional)</Label>
                  <Input
                    id="starts_at"
                    type="date"
                    value={formData.starts_at}
                    onChange={(e) => setFormData({ ...formData, starts_at: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ends_at">End Date (Optional)</Label>
                  <Input
                    id="ends_at"
                    type="date"
                    value={formData.ends_at}
                    onChange={(e) => setFormData({ ...formData, ends_at: e.target.value })}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Banner Image</Label>
                {(existingImage || imageFile) && (
                  <div className="relative inline-block mb-2">
                    <img
                      src={imageFile ? URL.createObjectURL(imageFile) : existingImage!}
                      alt="Banner preview"
                      className="h-32 w-auto rounded object-cover"
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
                <div className="flex items-center gap-2">
                  <Input
                    type="file"
                    accept="image/*"
                    onChange={handleFileChange}
                    className="hidden"
                    id="banner-image-upload"
                  />
                  <Label
                    htmlFor="banner-image-upload"
                    className="cursor-pointer inline-flex items-center gap-2 px-4 py-2 border rounded-md hover:bg-muted"
                  >
                    <Upload className="h-4 w-4" /> Upload Image
                  </Label>
                </div>
              </div>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={closeDialog}>
                  Cancel
                </Button>
                <Button type="submit" disabled={isUploading || createMutation.isPending || updateMutation.isPending}>
                  {isUploading ? "Uploading..." : editingBanner ? "Update" : "Create"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Banner</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete "{deletingBanner?.title}"? This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => deletingBanner && deleteMutation.mutate(deletingBanner.id)}
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
