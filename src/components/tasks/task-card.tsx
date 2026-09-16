"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { StatusBadge, type StatusTone } from "@/components/shared/status-badge";
import { taskCategoryMeta } from "@/lib/task-category-meta";
import { useTranslation } from "@/lib/i18n/LanguageProvider";
import { cn } from "@/utils";
import type { DealershipTask, TaskStatus } from "@/types/task";

const priorityTone: Record<DealershipTask["priority"], StatusTone> = { low: "neutral", medium: "warning", high: "danger" };

export function TaskCard({ task, onToggle }: { task: DealershipTask; onToggle: (status: TaskStatus) => void }) {
  const { t, locale } = useTranslation();
  const meta = taskCategoryMeta[task.category];
  const Icon = meta.icon;
  const isCompleted = task.status === "completed";
  const isOverdue = !isCompleted && new Date(task.dueAt) < new Date(new Date().toDateString());

  return (
    <Card>
      <CardContent className="flex items-center gap-3 py-3.5">
        <Checkbox
          checked={isCompleted}
          onCheckedChange={(checked) => onToggle(checked ? "completed" : "open")}
        />
        <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="size-4" />
        </div>
        <div className="flex min-w-0 flex-1 flex-col">
          <span className={cn("truncate text-sm font-medium text-foreground", isCompleted && "text-muted-foreground line-through")}>
            {task.title}
          </span>
          <span className="truncate text-xs text-muted-foreground">
            {t(`tasks.categories.${meta.labelKey}`)}
            {task.vehicleLabel && ` · ${task.vehicleLabel}`}
            {task.customerName && ` · ${task.customerName}`}
          </span>
        </div>
        <StatusBadge label={t(`tasks.priorities.${task.priority}`)} tone={priorityTone[task.priority]} />
        <div className="flex shrink-0 flex-col items-end gap-0.5">
          <span className={cn("text-xs font-medium", isOverdue ? "text-destructive" : "text-foreground")}>
            {new Date(task.dueAt).toLocaleDateString(locale, { month: "short", day: "numeric" })}
          </span>
          <span className="text-xs text-muted-foreground">{task.assignedToName}</span>
        </div>
      </CardContent>
    </Card>
  );
}
