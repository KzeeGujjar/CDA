"use client";

import { use } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  Calendar,
  FileText,
  Handshake,
  ListChecks,
  Mail,
  MapPin,
  MessageSquare,
  Phone,
  Sparkles,
  StickyNote,
} from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorState } from "@/components/shared/error-state";
import { OptionalCurrency } from "@/components/shared/currency";
import { CustomerOverviewPanel } from "@/components/customers/customer-overview-panel";
import { CustomerMessagesPanel } from "@/components/customers/customer-messages-panel";
import { CustomerCallsPanel } from "@/components/customers/customer-calls-panel";
import { CustomerNotesPanel } from "@/components/customers/customer-notes-panel";
import { CustomerDocumentsPanel } from "@/components/customers/customer-documents-panel";
import { CustomerTasksPanel } from "@/components/customers/customer-tasks-panel";
import { CustomerTimelineList } from "@/components/customers/customer-timeline-list";
import { getCustomerById } from "@/services/customerService";
import { useTranslation } from "@/lib/i18n/LanguageProvider";

export default function CustomerDetailPage({ params }: { params: Promise<{ customerId: string }> }) {
  const { customerId } = use(params);
  const { t, locale } = useTranslation();

  const {
    data: customer,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ["customer", customerId],
    queryFn: () => getCustomerById(customerId),
  });

  if (isLoading) {
    return (
      <div className="flex flex-col gap-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-80 w-full" />
      </div>
    );
  }

  if (isError) return <ErrorState error={error} onRetry={() => refetch()} />;

  if (!customer) return <EmptyState icon={StickyNote} title={t("common.noResults")} />;

  return (
    <>
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon-sm" asChild aria-label={t("common.back")}>
          <Link href="/customers">
            <ArrowLeft className="size-4" />
          </Link>
        </Button>
        <PageHeader
          title={customer.name}
          actions={
            <Button asChild size="sm" variant="outline" className="gap-1.5">
              <Link href={`/deals/new?customerId=${customer.id}`}>
                <Handshake className="size-3.5" />
                {t("customers.newDeal")}
              </Link>
            </Button>
          }
        />
      </div>

      <Card>
        <CardContent className="flex flex-col gap-4 py-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-center gap-3">
            <Avatar className="size-14">
              <AvatarImage src={customer.avatarUrl} alt={customer.name} />
              <AvatarFallback>{customer.name.slice(0, 2)}</AvatarFallback>
            </Avatar>
            <div className="flex flex-col gap-1.5">
              <span className="text-base font-semibold text-foreground">{customer.name}</span>
              {customer.tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {customer.tags.map((tag) => (
                    <Badge key={tag} variant="secondary" className="border-0 text-[10px]">
                      {tag}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
            <span className="flex items-center gap-2 text-muted-foreground">
              <Phone className="size-3.5" /> <span className="text-foreground">{customer.phone}</span>
            </span>
            <span className="flex items-center gap-2 text-muted-foreground">
              <Mail className="size-3.5" /> <span className="text-foreground">{customer.email}</span>
            </span>
            {customer.address && (
              <span className="flex items-center gap-2 text-muted-foreground">
                <MapPin className="size-3.5" /> <span className="text-foreground">{customer.address}</span>
              </span>
            )}
            <span className="flex items-center gap-2 text-muted-foreground">
              <Calendar className="size-3.5" />
              <span className="text-foreground">
                {t("customers.customerSince")} {new Date(customer.createdAt).toLocaleDateString(locale)}
              </span>
            </span>
          </div>

          <div className="flex flex-col items-start gap-0.5 sm:items-end">
            <span className="text-xs text-muted-foreground">{t("customers.lifetimeValue")}</span>
            <span className="font-mono text-lg font-semibold text-foreground">
              <OptionalCurrency
                money={
                  customer.lifetimeValue !== undefined ? { amount: customer.lifetimeValue, currency: "AED" } : undefined
                }
                placeholder={t("common.restricted")}
              />
            </span>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview" className="gap-1.5">
            <Sparkles className="size-3.5" /> {t("customers.tabs.overview")}
          </TabsTrigger>
          <TabsTrigger value="messages" className="gap-1.5">
            <MessageSquare className="size-3.5" /> {t("customers.tabs.messages")}
          </TabsTrigger>
          <TabsTrigger value="calls" className="gap-1.5">
            <Phone className="size-3.5" /> {t("customers.tabs.calls")}
          </TabsTrigger>
          <TabsTrigger value="notes" className="gap-1.5">
            <StickyNote className="size-3.5" /> {t("customers.tabs.notes")}
          </TabsTrigger>
          <TabsTrigger value="documents" className="gap-1.5">
            <FileText className="size-3.5" /> {t("customers.tabs.documents")}
          </TabsTrigger>
          <TabsTrigger value="tasks" className="gap-1.5">
            <ListChecks className="size-3.5" /> {t("customers.tabs.tasks")}
          </TabsTrigger>
          <TabsTrigger value="timeline" className="gap-1.5">
            <Calendar className="size-3.5" /> {t("customers.tabs.timeline")}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <CustomerOverviewPanel customerId={customerId} />
        </TabsContent>
        <TabsContent value="messages">
          <Card>
            <CardContent className="py-5">
              <CustomerMessagesPanel customerId={customerId} />
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="calls">
          <Card>
            <CardContent className="py-5">
              <CustomerCallsPanel customerId={customerId} />
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="notes">
          <Card>
            <CardContent className="py-5">
              <CustomerNotesPanel customerId={customerId} />
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="documents">
          <Card>
            <CardContent className="py-5">
              <CustomerDocumentsPanel customerId={customerId} />
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="tasks">
          <Card>
            <CardContent className="py-5">
              <CustomerTasksPanel customerId={customerId} />
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="timeline">
          <Card>
            <CardContent className="py-5">
              <CustomerTimelineList customerId={customerId} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </>
  );
}
