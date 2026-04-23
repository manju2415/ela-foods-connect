import { ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface AdminMobileCardProps {
  children: ReactNode;
  className?: string;
}

interface AdminMobileFieldProps {
  label: string;
  children: ReactNode;
  className?: string;
}

export function AdminMobileCard({ children, className }: AdminMobileCardProps) {
  return (
    <Card className={cn("overflow-hidden", className)}>
      <CardContent className="p-4 space-y-3">{children}</CardContent>
    </Card>
  );
}

export function AdminMobileField({ label, children, className }: AdminMobileFieldProps) {
  return (
    <div className={cn("min-w-0 space-y-1", className)}>
      <div className="text-xs font-medium uppercase text-muted-foreground">{label}</div>
      <div className="min-w-0 break-words text-sm">{children}</div>
    </div>
  );
}