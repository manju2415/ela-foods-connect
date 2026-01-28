import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { AddDeliveryPartnerDialog } from "@/components/admin/AddDeliveryPartnerDialog";
import { Search, Plus, Truck, UserCheck, UserX } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

interface DeliveryPartner {
  id: string;
  user_id: string;
  vehicle_type: string | null;
  vehicle_number: string | null;
  is_available: boolean;
  created_at: string;
  profile?: { email: string; full_name: string | null; phone: string | null } | null;
}

export default function DeliveryPartners() {
  const [search, setSearch] = useState("");
  const [showAddDialog, setShowAddDialog] = useState(false);
  const queryClient = useQueryClient();

  const { data: partners = [], isLoading } = useQuery({
    queryKey: ["delivery-partners"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("delivery_partners")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;

      const userIds = data.map(p => p.user_id);
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, email, full_name, phone")
        .in("id", userIds);

      const profilesMap = new Map(profiles?.map(p => [p.id, p]) || []);

      return data.map(partner => ({
        ...partner,
        profile: profilesMap.get(partner.user_id) || null,
      })) as DeliveryPartner[];
    },
  });

  const toggleAvailability = useMutation({
    mutationFn: async ({ id, isAvailable }: { id: string; isAvailable: boolean }) => {
      const { error } = await supabase
        .from("delivery_partners")
        .update({ is_available: isAvailable })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["delivery-partners"] });
      toast.success("Availability updated");
    },
    onError: () => {
      toast.error("Failed to update availability");
    },
  });

  const filteredPartners = partners.filter(partner =>
    partner.profile?.email?.toLowerCase().includes(search.toLowerCase()) ||
    partner.profile?.full_name?.toLowerCase().includes(search.toLowerCase()) ||
    partner.vehicle_number?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Delivery Partners</h1>
            <p className="text-muted-foreground">Manage delivery personnel</p>
          </div>
          <Button onClick={() => setShowAddDialog(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Add Partner
          </Button>
        </div>

        <Card>
          <CardHeader>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <CardTitle className="flex items-center gap-2">
                <Truck className="h-5 w-5" />
                All Partners ({filteredPartners.length})
              </CardTitle>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search partners..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9 w-full sm:w-64"
                />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
              </div>
            ) : filteredPartners.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No delivery partners found
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Contact</TableHead>
                    <TableHead>Vehicle</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Joined</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredPartners.map((partner) => (
                    <TableRow key={partner.id}>
                      <TableCell className="font-medium">
                        {partner.profile?.full_name || "N/A"}
                      </TableCell>
                      <TableCell>
                        <div>
                          <div className="text-sm">{partner.profile?.email}</div>
                          <div className="text-sm text-muted-foreground">
                            {partner.profile?.phone || "No phone"}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div>
                          <div className="text-sm">{partner.vehicle_type || "N/A"}</div>
                          <div className="text-sm text-muted-foreground">
                            {partner.vehicle_number || "No number"}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={partner.is_available ? "default" : "secondary"}>
                          {partner.is_available ? "Available" : "Unavailable"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {format(new Date(partner.created_at), "MMM d, yyyy")}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            toggleAvailability.mutate({
                              id: partner.id,
                              isAvailable: !partner.is_available,
                            })
                          }
                        >
                          {partner.is_available ? (
                            <UserX className="h-4 w-4" />
                          ) : (
                            <UserCheck className="h-4 w-4" />
                          )}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <AddDeliveryPartnerDialog open={showAddDialog} onOpenChange={setShowAddDialog} />
      </div>
    </AdminLayout>
  );
}
