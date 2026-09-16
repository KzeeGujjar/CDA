import type { LucideIcon } from "lucide-react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/utils";

export function StatCard({
  label,
  value,
  delta,
  icon: Icon,
  className,
}: {
  label: string;
  value: string;
  delta?: number;
  icon?: LucideIcon;
  className?: string;
}) {
  const isPositive = (delta ?? 0) >= 0;
  return (
    <Card className={cn("border-0", className)}>
      <CardContent className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <span className="truncate text-sm text-muted-foreground">{label}</span>
          <span className="truncate font-mono text-2xl font-semibold tabular-nums" title={value}>
            {value}
          </span>
          {delta !== undefined && (
            <span
              className={cn(
                "inline-flex w-fit items-center gap-1 text-xs font-medium",
                isPositive ? "text-primary" : "text-destructive"
              )}
            >
              {isPositive ? <ArrowUpRight className="size-3.5" /> : <ArrowDownRight className="size-3.5" />}
              {Math.abs(delta).toFixed(1)}%
            </span>
          )}
        </div>
        {Icon && (
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Icon className="size-4.5" />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
