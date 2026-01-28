import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { SuperAdminGuard } from "@/components/admin/SuperAdminGuard";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { FileText, Save, Loader2, Eye, Pencil } from "lucide-react";

interface Policy {
  id: string;
  policy_type: string;
  title: string;
  content: string;
  is_active: boolean;
  updated_at: string;
}

export default function Policies() {
  const [selectedPolicy, setSelectedPolicy] = useState<Policy | null>(null);
  const [editContent, setEditContent] = useState("");
  const [editTitle, setEditTitle] = useState("");
  const [previewMode, setPreviewMode] = useState(false);
  const queryClient = useQueryClient();

  const { data: policies = [], isLoading } = useQuery({
    queryKey: ["site-policies"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("site_policies")
        .select("*")
        .order("policy_type");
      
      if (error) {
        console.error("Error fetching policies:", error);
        // Return default policies as fallback
        return [
          { id: "1", policy_type: "return", title: "Return Policy", content: "## Return Policy\n\nProducts must be returned within the specified return window.", is_active: true, updated_at: new Date().toISOString() },
          { id: "2", policy_type: "cancellation", title: "Cancellation Policy", content: "## Cancellation Policy\n\nOrders can be cancelled anytime before dispatch.", is_active: true, updated_at: new Date().toISOString() },
          { id: "3", policy_type: "refund", title: "Refund Policy", content: "## Refund Policy\n\nRefunds are processed within 5-7 business days.", is_active: true, updated_at: new Date().toISOString() },
        ] as Policy[];
      }
      
      return (data || []) as Policy[];
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, title, content }: { 
      id: string; 
      title: string; 
      content: string;
    }) => {
      const { error } = await supabase
        .from("site_policies" as any)
        .update({ 
          title, 
          content, 
          updated_at: new Date().toISOString() 
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["site-policies"] });
      toast.success("Policy updated successfully");
      setSelectedPolicy(null);
    },
    onError: (error) => {
      toast.error("Failed to update: " + error.message);
    },
  });

  const toggleActiveMutation = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase
        .from("site_policies" as any)
        .update({ is_active, updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["site-policies"] });
      toast.success("Policy status updated");
    },
    onError: (error) => {
      toast.error("Failed to update: " + error.message);
    },
  });

  const openEditor = (policy: Policy) => {
    setSelectedPolicy(policy);
    setEditTitle(policy.title);
    setEditContent(policy.content);
    setPreviewMode(false);
  };

  const handleSave = () => {
    if (!selectedPolicy) return;
    updateMutation.mutate({
      id: selectedPolicy.id,
      title: editTitle,
      content: editContent,
    });
  };

  const getPolicyIcon = (type: string) => {
    switch (type) {
      case "return":
        return "🔄";
      case "cancellation":
        return "❌";
      case "refund":
        return "💰";
      case "privacy":
        return "🔒";
      case "terms":
        return "📋";
      default:
        return "📄";
    }
  };

  return (
    <SuperAdminGuard>
      <AdminLayout>
        <div className="space-y-6">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2">
              <FileText className="h-8 w-8" />
              Site Policies
            </h1>
            <p className="text-muted-foreground">
              Manage return, cancellation, refund, and other policies
            </p>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {policies.map((policy) => (
                <Card key={policy.id} className={!policy.is_active ? "opacity-60" : ""}>
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle className="flex items-center gap-2">
                          <span className="text-2xl">{getPolicyIcon(policy.policy_type)}</span>
                          {policy.title}
                        </CardTitle>
                        <CardDescription className="mt-1">
                          Type: {policy.policy_type}
                        </CardDescription>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={policy.is_active ? "default" : "secondary"}>
                          {policy.is_active ? "Active" : "Inactive"}
                        </Badge>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="text-sm text-muted-foreground line-clamp-3">
                      {policy.content.substring(0, 150)}...
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={policy.is_active}
                          onCheckedChange={(checked) =>
                            toggleActiveMutation.mutate({ id: policy.id, is_active: checked })
                          }
                        />
                        <span className="text-sm text-muted-foreground">Active</span>
                      </div>
                      <Button variant="outline" size="sm" onClick={() => openEditor(policy)}>
                        <Pencil className="h-4 w-4 mr-1" />
                        Edit
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>

        {/* Edit Dialog */}
        <Dialog open={!!selectedPolicy} onOpenChange={() => setSelectedPolicy(null)}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
            <DialogHeader>
              <DialogTitle>Edit Policy: {selectedPolicy?.title}</DialogTitle>
            </DialogHeader>

            <Tabs value={previewMode ? "preview" : "edit"} className="flex-1 flex flex-col overflow-hidden">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="edit" onClick={() => setPreviewMode(false)}>
                  <Pencil className="h-4 w-4 mr-2" />
                  Edit
                </TabsTrigger>
                <TabsTrigger value="preview" onClick={() => setPreviewMode(true)}>
                  <Eye className="h-4 w-4 mr-2" />
                  Preview
                </TabsTrigger>
              </TabsList>

              <TabsContent value="edit" className="flex-1 overflow-auto space-y-4 mt-4">
                <div className="space-y-2">
                  <Label>Title</Label>
                  <Input
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Content (Markdown supported)</Label>
                  <Textarea
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    className="min-h-[400px] font-mono text-sm"
                  />
                </div>
              </TabsContent>

              <TabsContent value="preview" className="flex-1 overflow-auto mt-4">
                <div className="prose prose-sm max-w-none dark:prose-invert p-4 border rounded-lg">
                  <h1>{editTitle}</h1>
                  {editContent.split("\n").map((line, i) => {
                    if (line.startsWith("## ")) {
                      return <h2 key={i}>{line.replace("## ", "")}</h2>;
                    }
                    if (line.startsWith("### ")) {
                      return <h3 key={i}>{line.replace("### ", "")}</h3>;
                    }
                    if (line.startsWith("- ")) {
                      return <li key={i}>{line.replace("- ", "")}</li>;
                    }
                    if (line.match(/^\d+\. /)) {
                      return <li key={i}>{line.replace(/^\d+\. /, "")}</li>;
                    }
                    if (line.startsWith("**") && line.endsWith("**")) {
                      return <p key={i}><strong>{line.replace(/\*\*/g, "")}</strong></p>;
                    }
                    if (line.trim() === "") {
                      return <br key={i} />;
                    }
                    return <p key={i}>{line}</p>;
                  })}
                </div>
              </TabsContent>
            </Tabs>

            <DialogFooter>
              <Button variant="outline" onClick={() => setSelectedPolicy(null)}>
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={updateMutation.isPending}>
                {updateMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Save className="h-4 w-4 mr-2" />
                )}
                Save Changes
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </AdminLayout>
    </SuperAdminGuard>
  );
}
