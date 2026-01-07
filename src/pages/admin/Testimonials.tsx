import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
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
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Check, X, Star, Trash2, Eye } from "lucide-react";
import { format } from "date-fns";

interface Testimonial {
  id: string;
  title: string;
  content: string;
  rating: number | null;
  is_approved: boolean;
  is_featured: boolean;
  created_at: string;
  user_id: string;
  product_id: string | null;
  profiles?: {
    full_name: string | null;
    email: string;
  };
  products?: {
    name: string;
  } | null;
}

const TestimonialsPage = () => {
  const queryClient = useQueryClient();
  const [selectedTestimonial, setSelectedTestimonial] = useState<Testimonial | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [viewContent, setViewContent] = useState<Testimonial | null>(null);

  const { data: testimonials, isLoading } = useQuery({
    queryKey: ["admin-testimonials"],
    queryFn: async () => {
      const { data: testimonialData, error } = await supabase
        .from("testimonials")
        .select(`
          *,
          products:product_id (name)
        `)
        .order("created_at", { ascending: false });

      if (error) throw error;

      // Fetch profile data separately for each testimonial
      const userIds = [...new Set(testimonialData.map(t => t.user_id))];
      const { data: profilesData } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", userIds);

      const profilesMap = new Map(profilesData?.map(p => [p.id, p]) || []);

      return testimonialData.map(t => ({
        ...t,
        profiles: profilesMap.get(t.user_id) || { full_name: null, email: '' }
      })) as Testimonial[];
    },
  });

  const approveMutation = useMutation({
    mutationFn: async ({ id, approve }: { id: string; approve: boolean }) => {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase
        .from("testimonials")
        .update({ 
          is_approved: approve,
          approved_by: approve ? user?.id : null,
          approved_at: approve ? new Date().toISOString() : null
        })
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: (_, { approve }) => {
      toast.success(approve ? "Testimonial approved" : "Testimonial rejected");
      queryClient.invalidateQueries({ queryKey: ["admin-testimonials"] });
    },
    onError: () => {
      toast.error("Failed to update testimonial");
    },
  });

  const featureMutation = useMutation({
    mutationFn: async ({ id, featured }: { id: string; featured: boolean }) => {
      const { error } = await supabase
        .from("testimonials")
        .update({ is_featured: featured })
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: (_, { featured }) => {
      toast.success(featured ? "Testimonial featured" : "Testimonial unfeatured");
      queryClient.invalidateQueries({ queryKey: ["admin-testimonials"] });
    },
    onError: () => {
      toast.error("Failed to update testimonial");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("testimonials")
        .delete()
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Testimonial deleted");
      queryClient.invalidateQueries({ queryKey: ["admin-testimonials"] });
      setDeleteId(null);
    },
    onError: () => {
      toast.error("Failed to delete testimonial");
    },
  });

  const pendingTestimonials = testimonials?.filter(t => !t.is_approved) || [];
  const approvedTestimonials = testimonials?.filter(t => t.is_approved) || [];

  const renderStars = (rating: number | null) => {
    if (!rating) return null;
    return (
      <div className="flex gap-0.5">
        {[1, 2, 3, 4, 5].map((star) => (
          <Star
            key={star}
            className={`h-4 w-4 ${star <= rating ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground"}`}
          />
        ))}
      </div>
    );
  };

  const TestimonialTable = ({ items, showApproveActions }: { items: Testimonial[]; showApproveActions: boolean }) => (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>User</TableHead>
          <TableHead>Product</TableHead>
          <TableHead>Title</TableHead>
          <TableHead>Rating</TableHead>
          <TableHead>Date</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.length === 0 ? (
          <TableRow>
            <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
              No testimonials found
            </TableCell>
          </TableRow>
        ) : (
          items.map((testimonial) => (
            <TableRow key={testimonial.id}>
              <TableCell>
                <div>
                  <p className="font-medium">{testimonial.profiles?.full_name || "Unknown"}</p>
                  <p className="text-xs text-muted-foreground">{testimonial.profiles?.email}</p>
                </div>
              </TableCell>
              <TableCell>
                {testimonial.products?.name || (
                  <Badge variant="outline">General</Badge>
                )}
              </TableCell>
              <TableCell className="max-w-[200px] truncate">{testimonial.title}</TableCell>
              <TableCell>{renderStars(testimonial.rating)}</TableCell>
              <TableCell>{format(new Date(testimonial.created_at), "MMM d, yyyy")}</TableCell>
              <TableCell>
                <div className="flex gap-1">
                  {testimonial.is_approved ? (
                    <Badge className="bg-green-100 text-green-800">Approved</Badge>
                  ) : (
                    <Badge variant="secondary">Pending</Badge>
                  )}
                  {testimonial.is_featured && (
                    <Badge className="bg-yellow-100 text-yellow-800">Featured</Badge>
                  )}
                </div>
              </TableCell>
              <TableCell className="text-right">
                <div className="flex gap-1 justify-end">
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => setViewContent(testimonial)}
                    title="View content"
                  >
                    <Eye className="h-4 w-4" />
                  </Button>
                  {showApproveActions ? (
                    <>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="text-green-600 hover:text-green-700"
                        onClick={() => approveMutation.mutate({ id: testimonial.id, approve: true })}
                        disabled={approveMutation.isPending}
                        title="Approve"
                      >
                        <Check className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="text-red-600 hover:text-red-700"
                        onClick={() => setDeleteId(testimonial.id)}
                        title="Reject & Delete"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button
                        size="sm"
                        variant={testimonial.is_featured ? "secondary" : "outline"}
                        onClick={() => featureMutation.mutate({ id: testimonial.id, featured: !testimonial.is_featured })}
                        disabled={featureMutation.isPending}
                      >
                        {testimonial.is_featured ? "Unfeature" : "Feature"}
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="text-muted-foreground hover:text-red-600"
                        onClick={() => setDeleteId(testimonial.id)}
                        title="Delete"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </>
                  )}
                </div>
              </TableCell>
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  );

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold">Testimonials</h2>
            <p className="text-muted-foreground">Manage customer testimonials and reviews</p>
          </div>
          <div className="flex gap-2">
            <Badge variant="outline" className="text-lg px-3 py-1">
              {pendingTestimonials.length} Pending
            </Badge>
            <Badge variant="outline" className="text-lg px-3 py-1 bg-green-50">
              {approvedTestimonials.length} Approved
            </Badge>
          </div>
        </div>

        <Tabs defaultValue="pending">
          <TabsList>
            <TabsTrigger value="pending">
              Pending Approval ({pendingTestimonials.length})
            </TabsTrigger>
            <TabsTrigger value="approved">
              Approved ({approvedTestimonials.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="pending" className="mt-4">
            <Card>
              <CardContent className="pt-6">
                {isLoading ? (
                  <div className="text-center py-8 text-muted-foreground">Loading...</div>
                ) : (
                  <TestimonialTable items={pendingTestimonials} showApproveActions />
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="approved" className="mt-4">
            <Card>
              <CardContent className="pt-6">
                {isLoading ? (
                  <div className="text-center py-8 text-muted-foreground">Loading...</div>
                ) : (
                  <TestimonialTable items={approvedTestimonials} showApproveActions={false} />
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* View Content Dialog */}
      <AlertDialog open={!!viewContent} onOpenChange={() => setViewContent(null)}>
        <AlertDialogContent className="max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle>{viewContent?.title}</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  {renderStars(viewContent?.rating || null)}
                  <span className="text-sm text-muted-foreground">
                    by {viewContent?.profiles?.full_name || "Unknown"}
                  </span>
                </div>
                {viewContent?.products?.name && (
                  <Badge variant="outline">{viewContent.products.name}</Badge>
                )}
                <p className="text-foreground whitespace-pre-wrap">{viewContent?.content}</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Close</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Testimonial</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this testimonial? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteId && deleteMutation.mutate(deleteId)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AdminLayout>
  );
};

export default TestimonialsPage;