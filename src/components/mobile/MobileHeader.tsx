import { ChevronLeft, LogIn } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface MobileHeaderProps {
  title: string;
  showBack?: boolean;
  rightAction?: React.ReactNode;
  className?: string;
  showLogin?: boolean;
  /** Custom back action; defaults to going back one step in history. */
  onBack?: () => void;
}

export function MobileHeader({
  title,
  showBack = false,
  rightAction,
  className,
  showLogin = false,
  onBack,
}: MobileHeaderProps) {
  const navigate = useNavigate();
  const { user } = useAuth();

  return (
    <header className={cn(
      "sticky top-0 z-40 safe-area-pt bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b",
      className
    )}>
      <div className="flex items-center justify-between h-14 px-4">
        <div className="flex min-w-0 items-center gap-2">
          {showBack && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => (onBack ? onBack() : navigate(-1))}
              className="-ml-2"
              aria-label="Go back"
            >
              <ChevronLeft className="h-6 w-6" />
            </Button>
          )}
          <h1 className="text-lg font-semibold truncate">{title}</h1>
        </div>
        <div className="flex items-center gap-2">
          {showLogin && !user && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate("/auth")}
              className="gap-1.5"
            >
              <LogIn className="h-4 w-4" />
              Login
            </Button>
          )}
          {rightAction}
        </div>
      </div>
    </header>
  );
}
