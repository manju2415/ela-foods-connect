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
}

export function MobileHeader({ 
  title, 
  showBack = false, 
  rightAction,
  className,
  showLogin = false,
}: MobileHeaderProps) {
  const navigate = useNavigate();
  const { user } = useAuth();

  return (
    <header className={cn(
      "sticky top-0 z-40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b",
      className
    )}>
      <div className="flex items-center justify-between h-14 px-4">
        <div className="flex items-center gap-2">
          {showBack && (
            <button
              onClick={() => navigate(-1)}
              className="p-1 -ml-1 rounded-full hover:bg-muted"
            >
              <ChevronLeft className="h-6 w-6" />
            </button>
          )}
          <h1 className="text-lg font-semibold">{title}</h1>
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
