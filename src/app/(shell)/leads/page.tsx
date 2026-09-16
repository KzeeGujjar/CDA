"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Search, Users } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { LeadPipeline } from "@/components/leads/lead-pipeline";
import { NewLeadDialog } from "@/components/leads/new-lead-dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/shared/error-state";
import { EmptyState } from "@/components/shared/empty-state";
import { getLeads, updateLeadStage } from "@/services/leads";
import { useTranslation } from "@/lib/i18n/LanguageProvider";
import type { LeadStage } from "@/types/lead";

export default function LeadsPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [newLeadOpen, setNewLeadOpen] = useState(false);
  const {
    data: leads,
    isLoading,
    isError,
    refetch,
  } = useQuery({ queryKey: ["leads", search], queryFn: () => getLeads({ search: search || undefined }) });

  const stageMutation = useMutation({
    mutationFn: ({ id, stage }: { id: string; stage: LeadStage }) => updateLeadStage(id, stage),
    onSuccess: (lead) => {
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      toast.success(`${lead.customerName} moved to ${t(`leads.stages.${lead.stage}`)}`);
    },
  });

  return (
    <>
      <PageHeader
        title={t("leads.title")}
        subtitle={t("leads.subtitle")}
        actions={
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute start-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("common.search")}
                className="w-56 ps-8"
              />
            </div>
            <Button size="sm" className="gap-1.5" onClick={() => setNewLeadOpen(true)}>
              <Plus className="size-3.5" />
              {t("leads.newLead")}
            </Button>
          </div>
        }
      />

      {isError ? (
        <ErrorState onRetry={() => refetch()} />
      ) : !isLoading && (leads ?? []).length === 0 ? (
        <EmptyState icon={Users} title={t("common.noResults")} />
      ) : (
        <LeadPipeline
          leads={leads ?? []}
          loading={isLoading}
          onStageChange={(id, s) => stageMutation.mutate({ id, stage: s })}
        />
      )}

      <NewLeadDialog open={newLeadOpen} onOpenChange={setNewLeadOpen} />
    </>
  );
}
