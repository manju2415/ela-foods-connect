import { Loader2 } from "lucide-react";

interface InfiniteScrollLoaderProps {
  isLoading: boolean;
  hasMore: boolean;
  error?: Error | null;
  onRetry?: () => void;
}

export function InfiniteScrollLoader({
  isLoading,
  hasMore,
  error,
  onRetry,
}: InfiniteScrollLoaderProps) {
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-6 gap-2">
        <p className="text-sm text-destructive">Failed to load more</p>
        {onRetry && (
          <button
            onClick={onRetry}
            className="text-sm text-primary underline"
          >
            Tap to retry
          </button>
        )}
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-6">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!hasMore) {
    return (
      <div className="flex items-center justify-center py-6">
        <p className="text-sm text-muted-foreground">No more items</p>
      </div>
    );
  }

  return null;
}
