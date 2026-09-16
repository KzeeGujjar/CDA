"use client";

import { useState } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { cn } from "@/utils";
import { settingsSections, type SettingsSectionKey } from "@/lib/settings-nav";
import { ProfileSection } from "@/components/settings/profile-section";
import { DealershipSection } from "@/components/settings/dealership-section";
import { UsersSection } from "@/components/settings/users-section";
import { RolesPermissionsSection } from "@/components/settings/roles-permissions-section";
import { NotificationsSection } from "@/components/settings/notifications-section";
import { AiSettingsSection } from "@/components/settings/ai-settings-section";
import { IntegrationsSection } from "@/components/settings/integrations-section";
import { LanguageSection } from "@/components/settings/language-section";
import { AppearanceSection } from "@/components/settings/appearance-section";
import { CurrencySection } from "@/components/settings/currency-section";
import { TaxSection } from "@/components/settings/tax-section";
import { DocumentTemplatesSection } from "@/components/settings/document-templates-section";
import { SecuritySection } from "@/components/settings/security-section";
import { BillingSection } from "@/components/settings/billing-section";
import { ApiKeysSection } from "@/components/settings/api-keys-section";
import { DashboardAdsManager } from "@/components/settings/dashboard-ads-manager";
import { DemoDataSection } from "@/components/settings/demo-data-section";
import { MarketplaceConnectionsCard } from "@/components/settings/marketplace-connections-card";
import { RequirePermission } from "@/components/auth/require-permission";
import { useTranslation } from "@/lib/i18n/LanguageProvider";

const sectionComponents: Record<SettingsSectionKey, React.ReactNode> = {
  profile: <ProfileSection />,
  dealership: <DealershipSection />,
  users: <UsersSection />,
  rolesPermissions: <RolesPermissionsSection />,
  notifications: <NotificationsSection />,
  aiSettings: <AiSettingsSection />,
  integrations: <IntegrationsSection />,
  language: <LanguageSection />,
  appearance: <AppearanceSection />,
  currency: <CurrencySection />,
  tax: <TaxSection />,
  documentTemplates: <DocumentTemplatesSection />,
  marketplaceConnections: <MarketplaceConnectionsCard />,
  security: <SecuritySection />,
  billing: (
    <RequirePermission module="billing">
      <BillingSection />
    </RequirePermission>
  ),
  apiKeys: (
    <RequirePermission module="settings">
      <ApiKeysSection />
    </RequirePermission>
  ),
  dashboardAds: <DashboardAdsManager />,
  demoData: <DemoDataSection />,
};

export default function SettingsPage() {
  const { t } = useTranslation();
  const [section, setSection] = useState<SettingsSectionKey>("profile");

  return (
    <>
      <PageHeader title={t("settings.title")} subtitle={t("settings.subtitle")} />

      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        <nav className="flex shrink-0 gap-1 overflow-x-auto lg:w-56 lg:flex-col lg:overflow-visible">
          {settingsSections.map(({ key, icon: Icon }) => (
            <button
              key={key}
              type="button"
              onClick={() => setSection(key)}
              className={cn(
                "flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-start text-sm font-medium whitespace-nowrap transition-colors lg:whitespace-normal",
                section === key
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              <Icon className="size-4 shrink-0" />
              {t(`settings.nav.${key}`)}
            </button>
          ))}
        </nav>

        <div className="flex min-w-0 flex-1 flex-col gap-6">{sectionComponents[section]}</div>
      </div>
    </>
  );
}
