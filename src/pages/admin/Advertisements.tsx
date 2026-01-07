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
import { Plus, Pencil, Trash2, Megaphone, Upload, X } from "lucide-react";
import { toast } from "sonner";

interface Advertisement {
  id: string;
  title: string;
  description: string | null;
  image_url: string | null;
  link_url: string | null;
  link_text: string | null;
  is_active: boolean;
  display_order: number;
  placement: string;
  starts_at: string | null;
  ends_at: string | null;
  created_at: string;
}

interface AdFormData {
  title: string;
  description: string;
  link_url: string;
  link_text: string;
  is_active: boolean;
  display_order: string;
  placement: string;
  starts_at: string;
  ends_at: string;
}

const initialFormData: AdFormData = {
  title: "",
  description: "",
  link_url: "",
  link_text: "Learn More",
  is_active: true,
  display_order: "0",
  placement: "home_sidebar",
  starts_at: "",
  ends_at: "",
};

const placementOptions = [
  { value: "home_sidebar", label: "Home Page Sidebar" },
  { value: "home_banner", label: "Home Page Banner" },
  { value: "products_sidebar", label: "Products Page Sidebar" },
  { value: "products_banner", label: "Products Page Banner" },
  { value: "checkout_banner", label: "Checkout Page Banner" },
  { value: "footer", label: "Footer Section" },
];

export default function Advertisements() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [editingAd, setEditingAd] = useState<Advertisement | null>(null);
  const [deletingAd, setDeletingAd] = useState<Advertisement | null>(null);
  const [formData, setFormData] = useState<AdFormData>(initialFormData);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [existingImage, setExistingImage] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const queryClient = useQueryClient();

  const { data: ads = [], isLoading } = useQuery({
    queryKey: ["admin-advertisements"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("advertisements")
        .select("*")
        .order("display_order", { ascending: true });
      if (error) throw error;
      return data as Advertisement[];
    },
  });

  const uploadImage = async (file: File): Promise<string> => {
    const fileExt = file.name.split(".").pop();
    const fileName = `ad-${crypto.randomUUID()}.${fileExt}`;
    const { error } = await supabase.storage
      .from("product-images")
      .upload(fileName, file);
    if (error) throw error;
    const { data: urlData } = supabase.storage
      .from("product-images")
      .getPublicUrl(fileName);
    return urlData.publicUrl;
  };

  const createMutation = useMutation({
    mutationFn: async (data: AdFormData) => {
      setIsUploading(true);
      let imageUrl: string | null = null;
      if (imageFile) {
        imageUrl = await uploadImage(imageFile);
      }
      const { error } = await supabase.from("advertisements").insert({
        title: data.title,
        description: data.description || null,
        link_url: data.link_url || null,
        link_text: data.link_text || null,
        is_active: data.is_active,
        display_order: parseInt(data.display_order) || 0,
        placement: data.placement,
        starts_at: data.starts_at || null,
        ends_at: data.ends_at || null,
        image_url: imageUrl,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-advertisements"] });
      toast.success("Advertisement created successfully");
      closeDialog();
    },
    onError: (error) => {
      toast.error("Failed to create advertisement: " + error.message);
    },
    onSettled: () => setIsUploading(false),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: AdFormData }) => {
      setIsUploading(true);
      let imageUrl = existingImage;
      if (imageFile) {
        imageUrl = await uploadImage(imageFile);
      }
      const { error } = await supabase
        .from("advertisements")
        .update({
          title: data.title,
          description: data.description || null,
          link_url: data.link_url || null,
          link_text: data.link_text || null,
          is_active: data.is_active,
          display_order: parseInt(data.display_order) || 0,
          placement: data.placement,
          starts_at: data.starts_at || null,
          ends_at: data.ends_at || null,
          image_url: imageUrl,
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-advertisements"] });
      toast.success("Advertisement updated successfully");
      closeDialog();
    },
    onError: (error) => {
      toast.error("Failed to update advertisement: " + error.message);
    },
    onSettled: () => setIsUploading(false),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("advertisements").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-advertisements"] });
      toast.success("Advertisement deleted successfully");
      setIsDeleteDialogOpen(false);
      setDeletingAd(null);
    },
    onError: () => {
      toast.error("Failed to delete advertisement");
    },
  });

  const openCreateDialog = () => {
    setEditingAd(null);
    setFormData(initialFormData);
    setImageFile(null);
    setExistingImage(null);
    setIsDialogOpen(true);
  };

  const openEditDialog = (ad: Advertisement) => {
    setEditingAd(ad);
    setFormData({
      title: ad.title,
      description: ad.description || "",
      link_url: ad.link_url || "",
      link_text: ad.link_text || "Learn More",
      is_active: ad.is_active,
      display_order: ad.display_order.toString(),
      placement: ad.placement,
      starts_at: ad.starts_at ? ad.starts_at.split("T")[0] : "",
      ends_at: ad.ends_at ? ad.ends_at.split("T")[0] : "",
    });
    setExistingImage(ad.image_url);
    setImageFile(null);
    setIsDialogOpen(true);
  };

  const closeDialog = () => {
    setIsDialogOpen(false);
    setEditingAd(null);
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
    if (editingAd) {
      updateMutation.mutate({ id: editingAd.id, data: formData });
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

  const getPlacementLabel = (placement: string) => {
    return placementOptions.find((p) => p.value === placement)?.label || placement;
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Advertisements</h1>
            <p className="text-muted-foreground">Manage ads displayed across the site</p>
          </div>
          <Button onClick={openCreateDialog}>
            <Plus className="mr-2 h-4 w-4" /> Add Advertisement
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Megaphone className="h-5 w-5" />
              All Advertisements ({ads.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
              </div>
            ) : ads.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">No advertisements found</div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Order</TableHead>
                      <TableHead>Image</TableHead>
                      <TableHead>Title</TableHead>
                      <TableHead>Placement</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {ads.map((ad) => (
                      <TableRow key={ad.id}>
                        <TableCell>{ad.display_order}</TableCell>
                        <TableCell>
                          {ad.image_url ? (
                            <img
                              src={ad.image_url}
                              alt={ad.title}
                              className="h-12 w-20 rounded object-cover"
                            />
                          ) : (
                            <div className="h-12 w-20 rounded bg-muted flex items-center justify-center">
                              <Megaphone className="h-6 w-6 text-muted-foreground" />
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="font-medium">{ad.title}</div>
                          <div className="text-sm text-muted-foreground line-clamp-1">
                            {ad.description}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{getPlacementLabel(ad.placement)}</Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant={ad.is_active ? "default" : "secondary"}>
                            {ad.is_active ? "Active" : "Inactive"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="sm" onClick={() => openEditDialog(ad)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setDeletingAd(ad);
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
              <DialogTitle>{editingAd ? "Edit Advertisement" : "Add Advertisement"}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="title">Title *</Label>
                <Input
                  id="title"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  required
                  placeholder="e.g., Summer Sale - 20% Off"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  rows={2}
                  placeholder="Brief description of the advertisement"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="link_url">Link URL</Label>
                  <Input
                    id="link_url"
                    value={formData.link_url}
                    onChange={(e) => setFormData({ ...formData, link_url: e.target.value })}
                    placeholder="e.g., /products?category=summer"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="link_text">Link Text</Label>
                  <Input
                    id="link_text"
                    value={formData.link_text}
                    onChange={(e) => setFormData({ ...formData, link_text: e.target.value })}
                    placeholder="e.g., Shop Now"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="placement">Placement</Label>
                  <Select
                    value={formData.placement}
                    onValueChange={(value) => setFormData({ ...formData, placement: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select placement" />
                    </SelectTrigger>
                    <SelectContent>
                      {placementOptions.map((opt) => (
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
                <Label>Ad Image</Label>
                {(existingImage || imageFile) && (
                  <div className="relative inline-block mb-2">
                    <img
                      src={imageFile ? URL.createObjectURL(imageFile) : existingImage!}
                      alt="Ad preview"
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
                    id="ad-image-upload"
                  />
                  <Label
                    htmlFor="ad-image-upload"
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
                  {isUploading ? "Uploading..." : editingAd ? "Update" : "Create"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Advertisement</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete "{deletingAd?.title}"? This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => deletingAd && deleteMutation.mutate(deletingAd.id)}
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
