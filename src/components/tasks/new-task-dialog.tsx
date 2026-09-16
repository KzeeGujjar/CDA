"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CalendarIcon } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { FormField } from "@/components/forms/form-field";
import { taskCategories, taskCategoryMeta } from "@/lib/task-category-meta";
import { createTask } from "@/services/tasks";
import { getVehicles } from "@/services/vehicles";
import { getCustomers } from "@/services/customers";
import { salespeople } from "@/lib/salespeople";
import { useTranslation } from "@/lib/i18n/LanguageProvider";
import type { TaskCategory, TaskPriority } from "@/types/task";

export function NewTaskDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { t, locale } = useTranslation();
  const queryClient = useQueryClient();

  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<TaskCategory>("follow_up");
  const [priority, setPriority] = useState<TaskPriority>("medium");
  const [dueDate, setDueDate] = useState<Date | undefined>(new Date());
  const [assignedToName, setAssignedToName] = useState(salespeople[0]);
  const [vehicleId, setVehicleId] = useState("");
  const [customerId, setCustomerId] = useState("");

  const { data: vehicles = [] } = useQuery({ queryKey: ["vehicles"], queryFn: () => getVehicles(), enabled: open });
  const { data: customers = [] } = useQuery({ queryKey: ["customers"], queryFn: () => getCustomers(), enabled: open });

  function reset() {
    setTitle("");
    setCategory("follow_up");
    setPriority("medium");
    setDueDate(new Date());
    setAssignedToName(salespeople[0]);
    setVehicleId("");
    setCustomerId("");
  }

  const mutation = useMutation({
    mutationFn: () => {
      const vehicle = vehicles.find((v) => v.id === vehicleId);
      const customer = customers.find((c) => c.id === customerId);
      return createTask({
        title: title.trim(),
        category,
        priority,
        dueAt: (dueDate ?? new Date()).toISOString(),
        assignedToName,
        vehicleId: vehicle?.id,
        vehicleLabel: vehicle ? `${vehicle.year} ${vehicle.make} ${vehicle.model} ${vehicle.trim}` : undefined,
        customerId: customer?.id,
        customerName: customer?.name,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      toast.success(t("tasks.createdToast"));
      reset();
      onOpenChange(false);
    },
  });

  const canSave = title.trim().length > 0 && Boolean(dueDate);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("tasks.newTask")}</DialogTitle>
          <DialogDescription>{t("tasks.newTaskDescription")}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <FormField label={t("tasks.fields.title")} htmlFor="task-title">
            <Input id="task-title" value={title} onChange={(e) => setTitle(e.target.value)} />
          </FormField>

          <div className="grid grid-cols-2 gap-3">
            <FormField label={t("tasks.fields.category")} htmlFor="task-category">
              <Select value={category} onValueChange={(v) => setCategory(v as TaskCategory)}>
                <SelectTrigger id="task-category" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {taskCategories.map((c) => (
                    <SelectItem key={c} value={c}>
                      {t(`tasks.categories.${taskCategoryMeta[c].labelKey}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>

            <FormField label={t("tasks.fields.priority")} htmlFor="task-priority">
              <Select value={priority} onValueChange={(v) => setPriority(v as TaskPriority)}>
                <SelectTrigger id="task-priority" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">{t("tasks.priorities.low")}</SelectItem>
                  <SelectItem value="medium">{t("tasks.priorities.medium")}</SelectItem>
                  <SelectItem value="high">{t("tasks.priorities.high")}</SelectItem>
                </SelectContent>
              </Select>
            </FormField>
          </div>

          <FormField label={t("tasks.fields.dueDate")} htmlFor="task-due">
            <Popover>
              <PopoverTrigger asChild>
                <Button id="task-due" type="button" variant="outline" className="w-full justify-start gap-2 font-normal">
                  <CalendarIcon className="size-3.5" />
                  {dueDate ? dueDate.toLocaleDateString(locale, { dateStyle: "medium" }) : t("tasks.fields.dueDate")}
                </Button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-auto p-0">
                <Calendar mode="single" selected={dueDate} onSelect={setDueDate} />
              </PopoverContent>
            </Popover>
          </FormField>

          <FormField label={t("tasks.fields.assignee")} htmlFor="task-assignee">
            <Select value={assignedToName} onValueChange={setAssignedToName}>
              <SelectTrigger id="task-assignee" className="w-full">
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
          </FormField>

          <div className="grid grid-cols-2 gap-3">
            <FormField label={t("tasks.fields.vehicle")} htmlFor="task-vehicle">
              <Select value={vehicleId} onValueChange={setVehicleId}>
                <SelectTrigger id="task-vehicle" className="w-full">
                  <SelectValue placeholder={t("tasks.fields.vehicle")} />
                </SelectTrigger>
                <SelectContent>
                  {vehicles.map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.year} {v.make} {v.model}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>

            <FormField label={t("tasks.fields.customer")} htmlFor="task-customer">
              <Select value={customerId} onValueChange={setCustomerId}>
                <SelectTrigger id="task-customer" className="w-full">
                  <SelectValue placeholder={t("tasks.fields.customer")} />
                </SelectTrigger>
                <SelectContent>
                  {customers.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
          </div>
        </div>

        <DialogFooter>
          <Button disabled={!canSave || mutation.isPending} onClick={() => mutation.mutate()}>
            {t("common.create")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
