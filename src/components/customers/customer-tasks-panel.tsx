"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ListChecks, Plus } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import { cn } from "@/utils";
import { createCustomerTask, getCustomerTasks, updateCustomerTaskStatus } from "@/services/customers";
import { salespeople } from "@/lib/salespeople";
import { useTranslation } from "@/lib/i18n/LanguageProvider";

export function CustomerTasksPanel({ customerId }: { customerId: string }) {
  const { t, locale } = useTranslation();
  const queryClient = useQueryClient();
  const [title, setTitle] = useState("");
  const [assignedToName, setAssignedToName] = useState(salespeople[0]);

  const { data: tasks, isLoading } = useQuery({
    queryKey: ["customer-tasks", customerId],
    queryFn: () => getCustomerTasks(customerId),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["customer-tasks", customerId] });

  const createMutation = useMutation({
    mutationFn: () => createCustomerTask(customerId, title, assignedToName),
    onSuccess: () => {
      invalidate();
      setTitle("");
      toast.success(t("customers.taskAdded"));
    },
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: "open" | "completed" }) => updateCustomerTaskStatus(id, status),
    onSuccess: invalidate,
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          placeholder={t("customers.newTaskPlaceholder")}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="flex-1"
        />
        <Select value={assignedToName} onValueChange={setAssignedToName}>
          <SelectTrigger className="w-full sm:w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {salespeople.map((name) => (
              <SelectItem key={name} value={name}>
                {name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          size="sm"
          className="gap-1.5"
          disabled={title.trim().length < 3 || createMutation.isPending}
          onClick={() => createMutation.mutate()}
        >
          <Plus className="size-3.5" /> {t("common.create")}
        </Button>
      </div>

      {isLoading ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : !tasks || tasks.length === 0 ? (
        <EmptyState icon={ListChecks} title={t("common.noResults")} />
      ) : (
        <div className="flex flex-col gap-2 border-t border-border pt-4">
          {tasks.map((task) => (
            <label key={task.id} className="flex items-center gap-3 rounded-lg border border-border px-3 py-2">
              <Checkbox
                checked={task.status === "completed"}
                onCheckedChange={(checked) => toggleMutation.mutate({ id: task.id, status: checked ? "completed" : "open" })}
              />
              <div className="flex flex-1 flex-col">
                <span className={cn("text-sm text-foreground", task.status === "completed" && "text-muted-foreground line-through")}>
                  {task.title}
                </span>
                <span className="text-xs text-muted-foreground">
                  {task.assignedToName}
                  {task.dueAt && ` · ${t("customers.due")} ${new Date(task.dueAt).toLocaleDateString(locale)}`}
                </span>
              </div>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
