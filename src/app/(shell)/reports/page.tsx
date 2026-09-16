"use client";

import { PageHeader } from "@/components/layout/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SalesReportTab } from "@/components/reports/sales-report-tab";
import { PurchaseReportTab } from "@/components/reports/purchase-report-tab";
import { ProfitReportTab } from "@/components/reports/profit-report-tab";
import { InventoryReportTab } from "@/components/reports/inventory-report-tab";
import { LeadReportTab } from "@/components/reports/lead-report-tab";
import { SalespersonPerformanceTab } from "@/components/reports/salesperson-performance-tab";
import { VehiclePerformanceTab } from "@/components/reports/vehicle-performance-tab";
import { MarketReportTab } from "@/components/market/market-report-tab";
import { AiPerformanceTab } from "@/components/reports/ai-performance-tab";
import { useTranslation } from "@/lib/i18n/LanguageProvider";

const reportKeys = [
  "sales",
  "purchase",
  "profit",
  "inventory",
  "leads",
  "salesperson",
  "vehiclePerformance",
  "market",
  "aiPerformance",
] as const;

export default function ReportsPage() {
  const { t } = useTranslation();

  return (
    <>
      <PageHeader title={t("reports.title")} subtitle={t("reports.subtitle")} />

      <Tabs defaultValue="sales">
        <TabsList className="w-full justify-start gap-1 overflow-x-auto">
          {reportKeys.map((key) => (
            <TabsTrigger key={key} value={key}>
              {t(`reports.tabs.${key}`)}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="sales">
          <SalesReportTab />
        </TabsContent>
        <TabsContent value="purchase">
          <PurchaseReportTab />
        </TabsContent>
        <TabsContent value="profit">
          <ProfitReportTab />
        </TabsContent>
        <TabsContent value="inventory">
          <InventoryReportTab />
        </TabsContent>
        <TabsContent value="leads">
          <LeadReportTab />
        </TabsContent>
        <TabsContent value="salesperson">
          <SalespersonPerformanceTab />
        </TabsContent>
        <TabsContent value="vehiclePerformance">
          <VehiclePerformanceTab />
        </TabsContent>
        <TabsContent value="market">
          <MarketReportTab />
        </TabsContent>
        <TabsContent value="aiPerformance">
          <AiPerformanceTab />
        </TabsContent>
      </Tabs>
    </>
  );
}
