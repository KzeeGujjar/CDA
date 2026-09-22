"use client";

import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";
import { CreditCard, Download } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { formatMoney } from "@/components/shared/currency";
import { InlineEmpty, InlineError } from "@/components/shared/inline-state";
import { getInvoices } from "@/services/billingService";
import { useTranslation } from "@/lib/i18n/LanguageProvider";

export function BillingSection() {
  const { t } = useTranslation();
  const {
    data: invoices = [],
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({ queryKey: ["invoices"], queryFn: getInvoices });

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="size-4" /> {t("settings.nav.billing")}
          </CardTitle>
          <CardDescription>{t("settings.billing.subtitle")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-border p-4">
            <div className="flex flex-col gap-1">
              <span className="inline-flex items-center gap-2">
                <span className="text-sm font-semibold text-foreground">{t("settings.billing.currentPlan")}</span>
                <Badge className="border-0 bg-primary/10 text-primary" variant="secondary">
                  {t("settings.billing.planName")}
                </Badge>
              </span>
              <span className="text-xs text-muted-foreground">{t("settings.billing.planDescription")}</span>
            </div>
            <Button variant="outline" size="sm" onClick={() => toast.info(t("settings.billing.managePlanComingSoon"))}>
              {t("settings.billing.managePlan")}
            </Button>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-border p-4">
            <div className="flex flex-col gap-1">
              <span className="text-sm font-medium text-foreground">{t("settings.billing.paymentMethod")}</span>
              <span className="font-mono text-xs text-muted-foreground">•••• •••• •••• 4242</span>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => toast.info(t("settings.billing.updatePaymentComingSoon"))}
            >
              {t("settings.billing.updatePayment")}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("settings.billing.invoiceHistory")}</CardTitle>
          <CardDescription>{t("settings.billing.invoiceHistorySubtitle")}</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex flex-col gap-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : isError ? (
            <InlineError error={error} onRetry={() => refetch()} />
          ) : invoices.length === 0 ? (
            <InlineEmpty />
          ) : (
            <div className="overflow-x-auto rounded-lg border border-border">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>{t("settings.billing.invoice")}</TableHead>
                    <TableHead>{t("reports.table.date")}</TableHead>
                    <TableHead>{t("settings.billing.amount")}</TableHead>
                    <TableHead>{t("common.status")}</TableHead>
                    <TableHead>{t("common.actions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invoices.map((inv) => (
                    <TableRow key={inv.id}>
                      <TableCell className="font-mono">{inv.id}</TableCell>
                      <TableCell>{inv.date}</TableCell>
                      <TableCell className="font-mono">
                        {formatMoney({ amount: inv.amount, currency: "AED" })}
                      </TableCell>
                      <TableCell>
                        <Badge className="border-0 bg-primary/10 text-primary" variant="secondary">
                          {t("settings.billing.paid")}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="gap-1.5"
                          onClick={() => toast.info(t("settings.billing.downloadComingSoon"))}
                        >
                          <Download className="size-3.5" />
                          {t("common.download")}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
