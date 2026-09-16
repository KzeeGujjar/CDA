import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/utils";

export function LoadingState({
  variant = "rows",
  rows = 4,
  className,
}: {
  variant?: "rows" | "block";
  rows?: number;
  className?: string;
}) {
  if (variant === "block") {
    return <Skeleton className={cn("w-full", className)} />;
  }

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-10 w-full" />
      ))}
    </div>
  );
}
