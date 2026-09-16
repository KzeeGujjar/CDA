"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, Calendar as CalendarIcon, Car, Mail, MessageCircle, Phone, StickyNote, User } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { StatusBadge } from "@/components/shared/status-badge";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorState } from "@/components/shared/error-state";
import { formatMoney } from "@/components/shared/currency";
import { LeadAiScoringCard } from "@/components/leads/lead-ai-scoring-card";
import { leadScoreTone, leadStageOrder, leadStageTone } from "@/components/leads/lead-stage";
import { getLeadById, updateLeadStage, updateLeadFollowUp, addLeadInteraction } from "@/services/leads";
import { leadNoteSchema, type LeadNoteValues } from "@/lib/validation/lead-schema";
import { useTranslation } from "@/lib/i18n/LanguageProvider";

const interactionIcon = { call: Phone, whatsapp: MessageCircle, email: Mail, visit: Car, note: StickyNote };

export default function LeadDetailPage({ params }: { params: Promise<{ leadId: string }> }) {
  const { leadId } = use(params);
  const { t, locale } = useTranslation();
  const queryClient = useQueryClient();
  const [followUpDate, setFollowUpDate] = useState<Date | undefined>();

  const {
    data: lead,
    isLoading,
    isError,
    refetch,
  } = useQuery({ queryKey: ["lead", leadId], queryFn: () => getLeadById(leadId) });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["lead", leadId] });
    queryClient.invalidateQueries({ queryKey: ["leads"] });
  };

  const stageMutation = useMutation({
    mutationFn: (stage: (typeof leadStageOrder)[number]) => updateLeadStage(leadId, stage),
    onSuccess: (updated) => {
      invalidate();
      toast.success(`Stage changed to ${t(`leads.stages.${updated.stage}`)}`);
    },
  });

  const followUpMutation = useMutation({
    mutationFn: (date: Date) => updateLeadFollowUp(leadId, date.toISOString()),
    onSuccess: () => {
      invalidate();
      toast.success(t("leads.scheduleFollowUp"));
    },
  });

  const noteMutation = useMutation({
    mutationFn: (summary: string) => addLeadInteraction(leadId, { type: "note", summary, authorName: "Sales Manager" }),
    onSuccess: () => {
      invalidate();
      reset();
      toast.success(t("common.saveChanges"));
    },
  });

  const { register, handleSubmit, reset } = useForm<LeadNoteValues>({ resolver: zodResolver(leadNoteSchema) });

  if (isLoading) {
    return (
      <div className="flex flex-col gap-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-80 w-full" />
      </div>
    );
  }

  if (isError) return <ErrorState onRetry={() => refetch()} />;

  if (!lead) return <EmptyState icon={StickyNote} title={t("common.noResults")} />;

  return (
    <>
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon-sm" asChild aria-label={t("common.back")}>
          <Link href="/leads">
            <ArrowLeft className="size-4" />
          </Link>
        </Button>
        <PageHeader
          title={lead.customerName}
          actions={
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                  {t("leads.changeStage")}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {leadStageOrder.map((stage) => (
                  <DropdownMenuItem key={stage} disabled={stage === lead.stage} onClick={() => stageMutation.mutate(stage)}>
                    {t(`leads.stages.${stage}`)}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          }
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-4 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>{t("leads.interactions")}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <form
                onSubmit={handleSubmit((values) => noteMutation.mutate(values.summary))}
                className="flex flex-col gap-2"
              >
                <Textarea placeholder={t("leads.addNote")} rows={2} {...register("summary")} />
                <div className="flex justify-end">
                  <Button type="submit" size="sm" disabled={noteMutation.isPending}>
                    {t("leads.addNote")}
                  </Button>
                </div>
              </form>

              <div className="flex flex-col gap-3 border-t border-border pt-4">
                {lead.interactions.map((interaction) => {
                  const Icon = interactionIcon[interaction.type];
                  return (
                    <div key={interaction.id} className="flex gap-3">
                      <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                        <Icon className="size-3.5" />
                      </div>
                      <div className="flex flex-col gap-0.5">
                        <p className="text-sm text-foreground">{interaction.summary}</p>
                        <span className="text-xs text-muted-foreground">
                          {interaction.authorName} · {new Date(interaction.createdAt).toLocaleDateString(locale)}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col gap-4">
          <LeadAiScoringCard lead={lead} />

          <Card>
            <CardContent className="flex flex-col gap-3">
              <div className="flex items-center gap-3">
                <Avatar className="size-11">
                  <AvatarImage src={lead.customerAvatarUrl} alt={lead.customerName} />
                  <AvatarFallback>{lead.customerName.slice(0, 2)}</AvatarFallback>
                </Avatar>
                <div className="flex flex-col">
                  <span className="text-sm font-medium text-foreground">{lead.customerName}</span>
                  <StatusBadge label={t(`leads.stages.${lead.stage}`)} tone={leadStageTone(lead.stage)} />
                </div>
              </div>
              <div className="flex flex-col gap-2 border-t border-border pt-3 text-sm">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Phone className="size-3.5" />
                  <span className="text-foreground">{lead.customerPhone}</span>
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Mail className="size-3.5" />
                  <span className="truncate text-foreground">{lead.customerEmail}</span>
                </div>
                <Button variant="link" size="sm" className="h-auto justify-start gap-1.5 p-0" asChild>
                  <Link href={`/customers/${lead.customerId}`}>
                    <User className="size-3.5" />
                    {t("leads.viewCustomerProfile")}
                  </Link>
                </Button>
              </div>
              <div className="flex flex-col gap-2 border-t border-border pt-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">{t("leads.interestedIn")}</span>
                  <span className="font-medium text-foreground">{lead.interestedVehicleLabel ?? "—"}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">{t("leads.fields.budget")}</span>
                  <span className="font-medium text-foreground">{lead.budget ? formatMoney(lead.budget) : "—"}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">{t("leads.fields.source")}</span>
                  <StatusBadge label={t(`leads.sources.${lead.source}`)} tone="neutral" />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">{t("leads.assignedTo")}</span>
                  <span className="font-medium text-foreground">{lead.assignedToName}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">{t("leads.fields.lastContact")}</span>
                  <span className="font-medium text-foreground">
                    {lead.lastContactAt ? new Date(lead.lastContactAt).toLocaleDateString(locale, { month: "short", day: "numeric" }) : "—"}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">{t("leads.fields.score")}</span>
                  <StatusBadge label={String(lead.score)} tone={leadScoreTone(lead.score)} />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("leads.nextFollowUp")}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {lead.nextFollowUpAt && (
                <p className="text-sm font-medium text-primary">
                  {new Date(lead.nextFollowUpAt).toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" })}
                </p>
              )}
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-1.5">
                    <CalendarIcon className="size-3.5" />
                    {t("leads.scheduleFollowUp")}
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="start" className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={followUpDate}
                    onSelect={(date) => {
                      setFollowUpDate(date);
                      if (date) followUpMutation.mutate(date);
                    }}
                  />
                </PopoverContent>
              </Popover>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
