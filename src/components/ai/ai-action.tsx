import type { LucideIcon } from "lucide-react";
import { Zap } from "lucide-react";
import { Button } from "@/components/ui/button";

export function AIAction({
  icon: Icon = Zap,
  label,
  description,
  actionLabel,
  onAction,
}: {
  icon?: LucideIcon;
  label: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-primary/30 bg-primary/10 px-3 py-2.5">
      <Icon className="mt-0.5 size-3.5 shrink-0 text-primary" />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        {description && <span className="text-sm text-foreground">{description}</span>}
      </div>
      {actionLabel && onAction && (
        <Button size="sm" variant="outline" className="h-7 shrink-0 text-xs" onClick={onAction}>
          {actionLabel}
        </Button>
      )}
    </div>
  );
}
