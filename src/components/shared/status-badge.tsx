import { Badge } from "@/components/ui/badge";
import { cn } from "@/utils";

export type StatusTone = "neutral" | "success" | "warning" | "danger" | "info";

const toneClasses: Record<StatusTone, string> = {
  neutral: "bg-muted text-muted-foreground",
  success: "bg-primary/10 text-primary",
  warning: "bg-accent/15 text-accent",
  danger: "bg-destructive/10 text-destructive",
  info: "bg-info/10 text-info",
};

export function StatusBadge({ label, tone = "neutral" }: { label: string; tone?: StatusTone }) {
  return (
    <Badge variant="secondary" className={cn("border-0 font-medium", toneClasses[tone])}>
      {label}
    </Badge>
  );
}
