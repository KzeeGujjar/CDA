"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ListChecks, Plus } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorState } from "@/components/shared/error-state";
import { TaskCard } from "@/components/tasks/task-card";
import { NewTaskDialog } from "@/components/tasks/new-task-dialog";
import { getTasks, updateTaskStatus } from "@/services/tasks";
import { groupTasksByBucket } from "@/lib/task-buckets";
import { useTranslation } from "@/lib/i18n/LanguageProvider";
import type { TaskStatus } from "@/types/task";

const bucketKeys = ["today", "upcoming", "overdue", "completed"] as const;

export default function TasksPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [newTaskOpen, setNewTaskOpen] = useState(false);

  const {
    data: tasks,
    isLoading,
    isError,
    refetch,
  } = useQuery({ queryKey: ["tasks"], queryFn: () => getTasks() });

  const toggleMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: TaskStatus }) => updateTaskStatus(id, status),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["tasks"] }),
  });

  const buckets = groupTasksByBucket(tasks ?? []);

  return (
    <>
      <PageHeader
        title={t("tasks.title")}
        subtitle={t("tasks.subtitle")}
        actions={
          <Button size="sm" className="gap-1.5" onClick={() => setNewTaskOpen(true)}>
            <Plus className="size-3.5" />
            {t("tasks.newTask")}
          </Button>
        }
      />

      {isLoading ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : isError ? (
        <ErrorState onRetry={() => refetch()} />
      ) : (
        <Tabs defaultValue="today">
          <TabsList>
            {bucketKeys.map((bucket) => (
              <TabsTrigger key={bucket} value={bucket}>
                {t(`tasks.buckets.${bucket}`)} ({buckets[bucket].length})
              </TabsTrigger>
            ))}
          </TabsList>
          {bucketKeys.map((bucket) => (
            <TabsContent key={bucket} value={bucket} className="flex flex-col gap-2">
              {buckets[bucket].length === 0 ? (
                <EmptyState icon={ListChecks} title={t("common.noResults")} />
              ) : (
                buckets[bucket].map((task) => (
                  <TaskCard key={task.id} task={task} onToggle={(status) => toggleMutation.mutate({ id: task.id, status })} />
                ))
              )}
            </TabsContent>
          ))}
        </Tabs>
      )}

      <NewTaskDialog open={newTaskOpen} onOpenChange={setNewTaskOpen} />
    </>
  );
}
