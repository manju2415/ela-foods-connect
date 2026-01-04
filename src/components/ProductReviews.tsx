import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Star, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface ProductReviewsProps {
  productId: string;
}

interface Review {
  id: string;
  user_id: string;
  rating: number;
  title: string | null;
  review_text: string | null;
  is_verified_purchase: boolean;
  created_at: string;
  profile?: {
    full_name: string | null;
  };
}

const StarRating = ({
  rating,
  onRate,
  interactive = false,
  size = "md",
}: {
  rating: number;
  onRate?: (rating: number) => void;
  interactive?: boolean;
  size?: "sm" | "md" | "lg";
}) => {
  const [hovered, setHovered] = useState(0);
  const sizeClasses = { sm: "h-4 w-4", md: "h-5 w-5", lg: "h-6 w-6" };

  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          disabled={!interactive}
          onClick={() => onRate?.(star)}
          onMouseEnter={() => interactive && setHovered(star)}
          onMouseLeave={() => interactive && setHovered(0)}
          className={interactive ? "cursor-pointer" : "cursor-default"}
        >
          <Star
            className={`${sizeClasses[size]} ${
              star <= (hovered || rating)
                ? "fill-primary text-primary"
                : "text-muted-foreground"
            }`}
          />
        </button>
      ))}
    </div>
  );
};

export default function ProductReviews({ productId }: ProductReviewsProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingReview, setEditingReview] = useState<Review | null>(null);
  const [rating, setRating] = useState(5);
  const [title, setTitle] = useState("");
  const [reviewText, setReviewText] = useState("");

  const { data: reviews = [], isLoading } = useQuery({
    queryKey: ["product-reviews", productId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("product_reviews")
        .select("*")
        .eq("product_id", productId)
        .order("created_at", { ascending: false });

      if (error) throw error;

      // Fetch profiles separately to avoid RLS issues
      const userIds = [...new Set(data.map((r) => r.user_id))];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", userIds);

      const profileMap = new Map(profiles?.map((p) => [p.id, p]) || []);

      return data.map((review) => ({
        ...review,
        profile: profileMap.get(review.user_id) || { full_name: null },
      })) as Review[];
    },
  });

  const userReview = reviews.find((r) => r.user_id === user?.id);

  const averageRating =
    reviews.length > 0
      ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
      : 0;

  // Calculate rating distribution
  const ratingDistribution = [5, 4, 3, 2, 1].map((stars) => {
    const count = reviews.filter((r) => r.rating === stars).length;
    const percentage = reviews.length > 0 ? (count / reviews.length) * 100 : 0;
    return { stars, count, percentage };
  });

  const submitMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Must be logged in");

      if (editingReview) {
        const { error } = await supabase
          .from("product_reviews")
          .update({ rating, title: title || null, review_text: reviewText || null })
          .eq("id", editingReview.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("product_reviews").insert({
          product_id: productId,
          user_id: user.id,
          rating,
          title: title || null,
          review_text: reviewText || null,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["product-reviews", productId] });
      toast.success(editingReview ? "Review updated!" : "Review submitted!");
      resetForm();
      setIsDialogOpen(false);
    },
    onError: () => {
      toast.error("Failed to submit review");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (reviewId: string) => {
      const { error } = await supabase
        .from("product_reviews")
        .delete()
        .eq("id", reviewId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["product-reviews", productId] });
      toast.success("Review deleted");
    },
    onError: () => {
      toast.error("Failed to delete review");
    },
  });

  const resetForm = () => {
    setRating(5);
    setTitle("");
    setReviewText("");
    setEditingReview(null);
  };

  const handleEdit = (review: Review) => {
    setEditingReview(review);
    setRating(review.rating);
    setTitle(review.title || "");
    setReviewText(review.review_text || "");
    setIsDialogOpen(true);
  };

  const handleOpenChange = (open: boolean) => {
    setIsDialogOpen(open);
    if (!open) resetForm();
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString("en-IN", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  return (
    <div className="mt-16 border-t pt-12">
      <h2 className="text-2xl font-bold mb-6">Customer Reviews</h2>

      {/* Rating Summary */}
      {reviews.length > 0 && (
        <div className="grid md:grid-cols-[280px_1fr] gap-8 mb-8 p-6 border rounded-lg bg-muted/30">
          {/* Average Rating */}
          <div className="text-center md:border-r md:pr-8">
            <div className="text-5xl font-bold">{averageRating.toFixed(1)}</div>
            <StarRating rating={Math.round(averageRating)} size="lg" />
            <p className="text-muted-foreground mt-2">
              {reviews.length} {reviews.length === 1 ? "review" : "reviews"}
            </p>
          </div>

          {/* Rating Distribution */}
          <div className="space-y-2">
            {ratingDistribution.map(({ stars, count, percentage }) => (
              <div key={stars} className="flex items-center gap-3">
                <span className="text-sm w-12 text-muted-foreground">
                  {stars} star
                </span>
                <Progress value={percentage} className="flex-1 h-2" />
                <span className="text-sm w-8 text-right text-muted-foreground">
                  {count}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Write Review Button */}
      <div className="flex justify-end mb-6">
        {user && !userReview && (
          <Dialog open={isDialogOpen} onOpenChange={handleOpenChange}>
            <DialogTrigger asChild>
              <Button>Write a Review</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>
                  {editingReview ? "Edit Your Review" : "Write a Review"}
                </DialogTitle>
              </DialogHeader>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  submitMutation.mutate();
                }}
                className="space-y-4"
              >
                <div>
                  <label className="text-sm font-medium mb-2 block">Rating</label>
                  <StarRating rating={rating} onRate={setRating} interactive size="lg" />
                </div>
                <div>
                  <label className="text-sm font-medium mb-2 block">
                    Title (optional)
                  </label>
                  <Input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Summarize your experience"
                    maxLength={100}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium mb-2 block">
                    Your Review (optional)
                  </label>
                  <Textarea
                    value={reviewText}
                    onChange={(e) => setReviewText(e.target.value)}
                    placeholder="Tell others what you think about this product..."
                    rows={4}
                    maxLength={1000}
                  />
                </div>
                <Button
                  type="submit"
                  className="w-full"
                  disabled={submitMutation.isPending}
                >
                  {submitMutation.isPending ? "Submitting..." : "Submit Review"}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {/* Reviews List */}
      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="border rounded-lg p-4">
              <div className="flex items-center gap-3 mb-3">
                <Skeleton className="h-10 w-10 rounded-full" />
                <div className="space-y-2">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-3 w-16" />
                </div>
              </div>
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4 mt-2" />
            </div>
          ))}
        </div>
      ) : reviews.length === 0 ? (
        <div className="text-center py-12 border rounded-lg bg-muted/30">
          <Star className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
          <h3 className="font-semibold mb-1">No reviews yet</h3>
          <p className="text-muted-foreground text-sm">
            Be the first to review this product!
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {reviews.map((review) => (
            <div key={review.id} className="border rounded-lg p-4">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <Avatar>
                    <AvatarFallback>
                      {review.profile?.full_name?.[0]?.toUpperCase() || "U"}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">
                        {review.profile?.full_name || "Anonymous"}
                      </span>
                      {review.is_verified_purchase && (
                        <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded">
                          Verified Purchase
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <StarRating rating={review.rating} size="sm" />
                      <span className="text-xs text-muted-foreground">
                        {formatDate(review.created_at)}
                      </span>
                    </div>
                  </div>
                </div>

                {user?.id === review.user_id && (
                  <div className="flex gap-1">
                    <Dialog open={isDialogOpen && editingReview?.id === review.id} onOpenChange={handleOpenChange}>
                      <DialogTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleEdit(review)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Edit Your Review</DialogTitle>
                        </DialogHeader>
                        <form
                          onSubmit={(e) => {
                            e.preventDefault();
                            submitMutation.mutate();
                          }}
                          className="space-y-4"
                        >
                          <div>
                            <label className="text-sm font-medium mb-2 block">
                              Rating
                            </label>
                            <StarRating
                              rating={rating}
                              onRate={setRating}
                              interactive
                              size="lg"
                            />
                          </div>
                          <div>
                            <label className="text-sm font-medium mb-2 block">
                              Title (optional)
                            </label>
                            <Input
                              value={title}
                              onChange={(e) => setTitle(e.target.value)}
                              placeholder="Summarize your experience"
                              maxLength={100}
                            />
                          </div>
                          <div>
                            <label className="text-sm font-medium mb-2 block">
                              Your Review (optional)
                            </label>
                            <Textarea
                              value={reviewText}
                              onChange={(e) => setReviewText(e.target.value)}
                              placeholder="Tell others what you think..."
                              rows={4}
                              maxLength={1000}
                            />
                          </div>
                          <Button
                            type="submit"
                            className="w-full"
                            disabled={submitMutation.isPending}
                          >
                            {submitMutation.isPending ? "Updating..." : "Update Review"}
                          </Button>
                        </form>
                      </DialogContent>
                    </Dialog>

                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete Review?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This action cannot be undone. Your review will be permanently deleted.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => deleteMutation.mutate(review.id)}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          >
                            Delete
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                )}
              </div>

              {review.title && (
                <h4 className="font-semibold mt-3">{review.title}</h4>
              )}
              {review.review_text && (
                <p className="text-muted-foreground mt-2">{review.review_text}</p>
              )}
            </div>
          ))}
        </div>
      )}

      {!user && (
        <p className="text-center text-muted-foreground mt-6">
          <a href="/auth" className="text-primary hover:underline">
            Sign in
          </a>{" "}
          to leave a review
        </p>
      )}
    </div>
  );
}
