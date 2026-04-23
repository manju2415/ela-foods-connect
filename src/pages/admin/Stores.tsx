import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { AdminMobileCard, AdminMobileField } from "@/components/admin/AdminMobileCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Store, Plus, Pencil, Boxes, Search, MapPin, Phone, Clock } from "lucide-react";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";

interface StoreData {
  id: string;
  name: string;
  slug: string;
  phone: string | null;
  email: string | null;
  address_line1: string;
  address_line2: string | null;
  city: string;
  state: string;
  postal_code: string;
  latitude: number | null;
  longitude: number | null;
  is_active: boolean;
  opening_time: string | null;
  closing_time: string | null;
  manager_name: string | null;
  manager_phone: string | null;
  display_order: number;
  image_url: string | null;
}

const emptyForm = {
  name: "", slug: "", phone: "", email: "",
  address_line1: "", address_line2: "", city: "", state: "", postal_code: "",
  latitude: "", longitude: "",
  opening_time: "09:00", closing_time: "21:00",
  manager_name: "", manager_phone: "",
  display_order: "0", image_url: "", is_active: true,
};

const Stores = () => {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingStore, setEditingStore] = useState<StoreData | null>(null);
  const [form, setForm] = useState(emptyForm);

  const { data: stores = [], isLoading } = useQuery({
    queryKey: ["admin-stores"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stores")
        .select("*")
        .order("display_order", { ascending: true });
      if (error) throw error;
      return data as StoreData[];
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (values: typeof form) => {
      const payload = {
        name: values.name,
        slug: values.slug || values.name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, ""),
        phone: values.phone || null,
        email: values.email || null,
        address_line1: values.address_line1,
        address_line2: values.address_line2 || null,
        city: values.city,
        state: values.state,
        postal_code: values.postal_code,
        latitude: values.latitude ? parseFloat(values.latitude) : null,
        longitude: values.longitude ? parseFloat(values.longitude) : null,
        opening_time: values.opening_time || null,
        closing_time: values.closing_time || null,
        manager_name: values.manager_name || null,
        manager_phone: values.manager_phone || null,
        display_order: parseInt(values.display_order) || 0,
        image_url: values.image_url || null,
        is_active: values.is_active,
      };

      if (editingStore) {
        const { error } = await supabase.from("stores").update(payload).eq("id", editingStore.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("stores").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-stores"] });
      toast.success(editingStore ? "Store updated" : "Store created");
      setDialogOpen(false);
      resetForm();
    },
    onError: (err: any) => toast.error(err.message),
  });

  const toggleActive = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase.from("stores").update({ is_active }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-stores"] }),
  });

  const resetForm = () => { setForm(emptyForm); setEditingStore(null); };

  const openEdit = (s: StoreData) => {
    setEditingStore(s);
    setForm({
      name: s.name, slug: s.slug, phone: s.phone || "", email: s.email || "",
      address_line1: s.address_line1, address_line2: s.address_line2 || "",
      city: s.city, state: s.state, postal_code: s.postal_code,
      latitude: s.latitude?.toString() || "", longitude: s.longitude?.toString() || "",
      opening_time: s.opening_time || "09:00", closing_time: s.closing_time || "21:00",
      manager_name: s.manager_name || "", manager_phone: s.manager_phone || "",
      display_order: s.display_order.toString(), image_url: s.image_url || "",
      is_active: s.is_active,
    });
    setDialogOpen(true);
  };

  const filtered = stores.filter(s =>
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    s.city.toLowerCase().includes(search.toLowerCase())
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.address_line1 || !form.city || !form.state || !form.postal_code) {
      toast.error("Please fill all required fields");
      return;
    }
    saveMutation.mutate(form);
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold">Stores</h1>
            <p className="text-muted-foreground">Manage your physical retail locations</p>
          </div>
          <Dialog open={dialogOpen} onOpenChange={(o) => { setDialogOpen(o); if (!o) resetForm(); }}>
            <DialogTrigger asChild>
              <Button className="w-full sm:w-auto"><Plus className="h-4 w-4 mr-2" />Add Store</Button>
            </DialogTrigger>
            <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{editingStore ? "Edit Store" : "Add New Store"}</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Store Name *</Label>
                    <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Slug</Label>
                    <Input value={form.slug} onChange={e => setForm({ ...form, slug: e.target.value })} placeholder="auto-generated" />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Phone</Label>
                    <Input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Email</Label>
                    <Input value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Address Line 1 *</Label>
                  <Input value={form.address_line1} onChange={e => setForm({ ...form, address_line1: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Address Line 2</Label>
                  <Input value={form.address_line2} onChange={e => setForm({ ...form, address_line2: e.target.value })} />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label>City *</Label>
                    <Input value={form.city} onChange={e => setForm({ ...form, city: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>State *</Label>
                    <Input value={form.state} onChange={e => setForm({ ...form, state: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Postal Code *</Label>
                    <Input value={form.postal_code} onChange={e => setForm({ ...form, postal_code: e.target.value })} />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Opening Time</Label>
                    <Input type="time" value={form.opening_time} onChange={e => setForm({ ...form, opening_time: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Closing Time</Label>
                    <Input type="time" value={form.closing_time} onChange={e => setForm({ ...form, closing_time: e.target.value })} />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Manager Name</Label>
                    <Input value={form.manager_name} onChange={e => setForm({ ...form, manager_name: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Manager Phone</Label>
                    <Input value={form.manager_phone} onChange={e => setForm({ ...form, manager_phone: e.target.value })} />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Latitude</Label>
                    <Input value={form.latitude} onChange={e => setForm({ ...form, latitude: e.target.value })} placeholder="e.g. 28.6139" />
                  </div>
                  <div className="space-y-2">
                    <Label>Longitude</Label>
                    <Input value={form.longitude} onChange={e => setForm({ ...form, longitude: e.target.value })} placeholder="e.g. 77.2090" />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Display Order</Label>
                    <Input type="number" value={form.display_order} onChange={e => setForm({ ...form, display_order: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Image URL</Label>
                    <Input value={form.image_url} onChange={e => setForm({ ...form, image_url: e.target.value })} />
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Switch checked={form.is_active} onCheckedChange={v => setForm({ ...form, is_active: v })} />
                  <Label>Active</Label>
                </div>

                <Button type="submit" className="w-full" disabled={saveMutation.isPending}>
                  {saveMutation.isPending ? "Saving..." : editingStore ? "Update Store" : "Create Store"}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <div className="flex items-center gap-2">
          <Search className="h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search stores..." value={search} onChange={e => setSearch(e.target.value)} className="w-full sm:max-w-sm" />
        </div>

        <Card className="max-w-full overflow-hidden">
          <CardContent className="p-0">
            <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Store</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>Hours</TableHead>
                  <TableHead>Manager</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-8">Loading...</TableCell></TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No stores found</TableCell></TableRow>
                ) : filtered.map(s => (
                  <TableRow key={s.id}>
                    <TableCell>
                      <div className="font-medium">{s.name}</div>
                      <div className="text-xs text-muted-foreground flex items-center gap-1">
                        {s.phone && <><Phone className="h-3 w-3" />{s.phone}</>}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-start gap-1">
                        <MapPin className="h-3 w-3 mt-0.5 text-muted-foreground" />
                        <div className="text-sm">
                          {s.address_line1}, {s.city}, {s.state} {s.postal_code}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      {s.opening_time && s.closing_time ? (
                        <div className="flex items-center gap-1 text-sm">
                          <Clock className="h-3 w-3" />
                          {s.opening_time.slice(0, 5)} - {s.closing_time.slice(0, 5)}
                        </div>
                      ) : <span className="text-muted-foreground text-sm">Not set</span>}
                    </TableCell>
                    <TableCell>
                      {s.manager_name ? (
                        <div className="text-sm">{s.manager_name}</div>
                      ) : <span className="text-muted-foreground text-sm">—</span>}
                    </TableCell>
                    <TableCell>
                      <Switch checked={s.is_active} onCheckedChange={v => toggleActive.mutate({ id: s.id, is_active: v })} />
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" onClick={() => openEdit(s)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => navigate(`/admin/stores/${s.id}/inventory`)}>
                          <Boxes className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            </div>
            <div className="space-y-3 p-4 md:hidden">
              {isLoading ? (
                <div className="text-center py-8">Loading...</div>
              ) : filtered.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">No stores found</div>
              ) : filtered.map(s => (
                <AdminMobileCard key={s.id}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-medium break-words">{s.name}</div>
                      <div className="text-sm text-muted-foreground break-all">{s.phone || "No phone"}</div>
                    </div>
                    <Switch checked={s.is_active} onCheckedChange={v => toggleActive.mutate({ id: s.id, is_active: v })} />
                  </div>
                  <AdminMobileField label="Location">{s.address_line1}, {s.city}, {s.state} {s.postal_code}</AdminMobileField>
                  <div className="grid grid-cols-2 gap-3">
                    <AdminMobileField label="Hours">{s.opening_time && s.closing_time ? `${s.opening_time.slice(0, 5)} - ${s.closing_time.slice(0, 5)}` : "Not set"}</AdminMobileField>
                    <AdminMobileField label="Manager">{s.manager_name || "—"}</AdminMobileField>
                  </div>
                  <div className="flex gap-2 pt-1">
                    <Button variant="outline" size="sm" onClick={() => openEdit(s)} className="flex-1"><Pencil className="h-4 w-4 mr-2" />Edit</Button>
                    <Button variant="outline" size="sm" onClick={() => navigate(`/admin/stores/${s.id}/inventory`)} className="flex-1"><Boxes className="h-4 w-4 mr-2" />Inventory</Button>
                  </div>
                </AdminMobileCard>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
};

export default Stores;
